import test from 'node:test'
import assert from 'node:assert/strict'
import { ConfirmationError, createPaymentConfirmationClient, readConfirmationResponse } from './payment-confirmation'

const request = { paymentKey: 'fixture_key_only', orderId: 'dev_' + 'a'.repeat(32), amount: 10000 }
const done = () => ({ success: true, message: null, data: {
  orderId: request.orderId, amount: 10000, currency: 'KRW', paymentStatus: 'DONE', completed: true,
  method: '카드', approvedAt: '2026-11-16T10:00:00+09:00', storage: 'MEMORY_ONLY',
} })
const pending = (status: string) => ({ success: true, data: { ...done().data,
  paymentStatus: status, completed: false, method: null, approvedAt: null } })

test('POST uses exact backend DTO, common base URL and credential policy without manual Origin', async () => {
  let calls = 0
  const signal = new AbortController().signal
  const client = createPaymentConfirmationClient('http://localhost:8080/', async (url, init) => {
    calls++
    assert.equal(url, 'http://localhost:8080/api/payments/confirm')
    assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'include')
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.signal, signal)
    assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' })
    assert.deepEqual(JSON.parse(init.body as string), request)
    return { status: 200, json: async () => done() }
  })
  const result = await client(request, signal)
  assert.equal(result.completed, true); assert.equal(calls, 1)
  assert.ok(!JSON.stringify(result).includes(request.paymentKey))
})

test('200 DONE is completed only with exact correlated server fields and an approval timestamp', () => {
  assert.equal(readConfirmationResponse(200, done(), request).paymentStatus, 'DONE')
  for (const patch of [
    { completed: false }, { amount: 1 }, { amount: '10000' }, { orderId: 'dev_' + 'b'.repeat(32) },
    { currency: 'USD' }, { storage: 'DATABASE' }, { method: null }, { method: 'untrusted details' },
    { approvedAt: null }, { approvedAt: 'invalid' }, { approvedAt: '2026-11-16' }, { paymentStatus: 'PAID' },
  ]) assert.throws(() => readConfirmationResponse(200, { ...done(), data: { ...done().data, ...patch } }, request), ConfirmationError)
  for (const body of [null, {}, { ...done(), success: false }, { success: true, data: [] }])
    assert.throws(() => readConfirmationResponse(200, body, request), ConfirmationError)
})

test('202 processing/unknown and 200 virtual-account wait can never become completed', () => {
  for (const status of ['CONFIRMING', 'UNKNOWN']) {
    const result = readConfirmationResponse(202, pending(status), request)
    assert.equal(result.paymentStatus, status); assert.equal(result.completed, false)
    assert.throws(() => readConfirmationResponse(200, pending(status), request), ConfirmationError)
  }
  assert.throws(() => readConfirmationResponse(202, done(), request), ConfirmationError)
  const waiting = { ...pending('WAITING_FOR_DEPOSIT'), data: { ...pending('WAITING_FOR_DEPOSIT').data, method: '가상계좌' } }
  assert.equal(readConfirmationResponse(200, waiting, request).completed, false)
  assert.throws(() => readConfirmationResponse(202, waiting, request), ConfirmationError)
})

test('server internal and provider error codes are allowlisted; raw messages never escape', () => {
  for (const [status, code, kind] of [
    [400, 'INVALID_CONFIRM_REQUEST', 'request'], [404, 'DEV_ORDER_NOT_FOUND', 'order'],
    [409, 'PAYMENT_AMOUNT_MISMATCH', 'conflict'], [409, 'PAYMENT_REQUEST_CONFLICT', 'conflict'],
    [409, 'PAYMENT_STATE_CONFLICT', 'rejected'], [422, 'PAYMENT_REJECTED', 'rejected'],
    [403, 'PAYMENT_CONFIRM_FORBIDDEN', 'configuration'], [502, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'configuration'],
    [429, 'PAYMENT_CONFIRM_CAPACITY_EXCEEDED', 'configuration'], [500, 'PAYMENT_CONFIRM_INTERNAL_ERROR', 'unknown'],
  ] as const) {
    assert.throws(() => readConfirmationResponse(status, { success: false, message: request.paymentKey,
      data: { code, providerCode: 'INVALID_API_KEY' } }, request), (error: unknown) => {
      assert.ok(error instanceof ConfirmationError)
      assert.equal(error.kind, kind); assert.equal(error.code, code); assert.equal(error.providerCode, 'INVALID_API_KEY')
      assert.ok(!String(error).includes(request.paymentKey)); return true
    })
  }
  assert.throws(() => readConfirmationResponse(500, { success: false, data: { code: request.paymentKey, providerCode: request.paymentKey } }, request),
    (error: unknown) => error instanceof ConfirmationError && error.code === undefined && error.providerCode === undefined)
})

test('network/timeout and malformed JSON are uncertain, sanitized and never automatically retried', async () => {
  for (const failure of [new TypeError(request.paymentKey), new DOMException(request.paymentKey, 'TimeoutError')]) {
    let calls = 0
    const client = createPaymentConfirmationClient('http://localhost:8080', async () => { calls++; throw failure })
    await assert.rejects(client(request, new AbortController().signal), (error: unknown) => {
      assert.ok(error instanceof ConfirmationError); assert.equal(error.kind, 'network')
      assert.ok(!String(error).includes(request.paymentKey)); return true
    })
    assert.equal(calls, 1)
  }
  const invalid = createPaymentConfirmationClient('http://localhost:8080', async () => ({ status: 200, json: async () => { throw new Error(request.paymentKey) } }))
  await assert.rejects(invalid(request, new AbortController().signal), (error: unknown) => error instanceof ConfirmationError && error.kind === 'unknown')
})

test('invalid input or an already-aborted request performs no transport call', async () => {
  let calls = 0
  const client = createPaymentConfirmationClient('http://localhost:8080', async () => { calls++; return { status: 200, json: async () => done() } })
  for (const patch of [{ paymentKey: '' }, { paymentKey: '한글' }, { paymentKey: 'bad key' }, { paymentKey: 'a'.repeat(201) },
    { paymentKey: undefined }, { amount: 1.5 }, { amount: 0 }, { orderId: 'bad' }]) {
    await assert.rejects(client({ ...request, ...patch } as typeof request, new AbortController().signal), ConfirmationError)
  }
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(client(request, aborted.signal), ConfirmationError)
  assert.equal(calls, 0)
})

test('unexpected HTTP codes and extra provider fields never become display credentials', () => {
  for (const status of [201, 204, 302, 503]) assert.throws(() => readConfirmationResponse(status, done(), request), ConfirmationError)
  const response = { ...done(), data: { ...done().data, paymentKey: request.paymentKey, authorization: 'private fixture' } }
  const safe = readConfirmationResponse(200, response, request)
  assert.ok(!JSON.stringify(safe).includes(request.paymentKey)); assert.ok(!JSON.stringify(safe).includes('private fixture'))
})

test('contradictory HTTP/error-code pairs remain uncertain instead of declaring a rejection', () => {
  for (const [status, code] of [[500, 'PAYMENT_REJECTED'], [502, 'DEV_ORDER_NOT_FOUND'], [422, 'PAYMENT_CONFIRM_FORBIDDEN']] as const) {
    assert.throws(() => readConfirmationResponse(status, { success: false, data: { code } }, request),
      (error: unknown) => error instanceof ConfirmationError && error.kind === 'unknown' && error.code === undefined)
  }
})
