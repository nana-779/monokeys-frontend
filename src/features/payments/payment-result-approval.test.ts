import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmationReview, createResultFlow, CONFIRMATION_TIMEOUT_MS, resultBusy, resultCanRetry, resultHeading } from './payment-result-flow'
import { ConfirmationError, createPaymentConfirmationClient } from './payment-confirmation'
import type { ResultState } from './payment-result-flow'
import type { ApprovalRequest } from './payment-result'

const order = { orderId: 'dev_' + 'a'.repeat(32), orderName: '테스트', amount: 10000, currency: 'KRW' as const, status: 'PENDING' as const }
const params = () => new URLSearchParams({ orderId: order.orderId, amount: '10000', paymentKey: 'fixture_only' })
const attempt = JSON.stringify(order)
const done = () => ({ orderId: order.orderId, amount: 10000, currency: 'KRW', paymentStatus: 'DONE', completed: true,
  method: '카드', approvedAt: '2026-11-16T10:00:00+09:00', storage: 'MEMORY_ONLY' })

test('6-8 and 6-9: validates server order before confirming and publishes real processing state', async () => {
  const actions: string[] = [], phases: string[] = []
  let sent: ApprovalRequest | undefined
  const flow = createResultFlow(async () => { actions.push('lookup'); return order }, async (request, signal) => {
    actions.push('confirm'); sent = request
    assert.equal(signal.aborted, false)
    assert.equal(phases.at(-1), 'confirming')
    return done()
  })
  const result = await flow(params(), attempt, { onProgress: state => phases.push(state.phase), onSubmitting: () => actions.push('hint') })
  assert.deepEqual(actions, ['lookup', 'hint', 'confirm'])
  assert.deepEqual(phases, ['checking-order', 'confirming'])
  assert.deepEqual(sent, { paymentKey: 'fixture_only', orderId: order.orderId, amount: 10000 })
  assert.equal(result.phase, 'approved'); assert.equal(resultHeading('success', result), '테스트 결제 완료')
  assert.ok(!JSON.stringify(result).includes('fixture_only'))
  assert.ok(CONFIRMATION_TIMEOUT_MS > 125_000)
})

test('invalid callback or changed server order never invokes confirmation', async () => {
  let posts = 0
  const confirm = async () => { posts++; return done() }
  const invalid = params(); invalid.set('amount', '1')
  assert.equal((await createResultFlow(async () => order, confirm)(invalid, attempt)).phase, 'invalid-result')
  const invalidKey = params(); invalidKey.set('paymentKey', '한글')
  assert.equal((await createResultFlow(async () => order, confirm)(invalidKey, attempt)).phase, 'invalid-result')
  for (const saved of [null, { ...order, amount: 1 }, { ...order, status: 'DONE' }, { ...order, orderName: 'changed' }]) {
    assert.equal((await createResultFlow(async () => saved, confirm)(params(), attempt)).phase, 'order-mismatch')
  }
  assert.equal(posts, 0)
})

test('Strict Mode consumers share one lookup/POST; late subscriber receives confirming state', async () => {
  let lookups = 0, posts = 0, release!: (value: unknown) => void
  const phases: string[] = []
  const flow = createResultFlow(async () => { lookups++; return order }, async () => { posts++; return new Promise(resolve => { release = resolve }) })
  const first = flow(params(), attempt)
  await Promise.resolve(); await Promise.resolve()
  const second = flow(params(), attempt, { onProgress: value => phases.push(value.phase) })
  assert.equal(first, second); assert.equal(lookups, 1); assert.equal(posts, 1)
  assert.equal(phases.at(-1), 'confirming')
  release(done())
  assert.equal((await second).phase, 'approved')
})

test('different payment keys cannot share another in-flight approval result', async () => {
  let release!: (value: unknown) => void, posts = 0
  const flow = createResultFlow(async () => order, async () => { posts++; return new Promise(resolve => { release = resolve }) })
  const first = flow(params(), attempt)
  await Promise.resolve(); await Promise.resolve()
  const changed = params(); changed.set('paymentKey', 'other_fixture')
  assert.equal((await flow(changed, attempt)).phase, 'confirmation-conflict')
  release(done()); await first; assert.equal(posts, 1)
})

test('6-10 and 6-11: waiting/processing/unknown never render a completed heading', async () => {
  for (const [paymentStatus, method, phase] of [
    ['WAITING_FOR_DEPOSIT', '가상계좌', 'waiting-for-deposit'], ['CONFIRMING', null, 'confirmation-pending'], ['UNKNOWN', null, 'confirmation-unknown'],
  ] as const) {
    const result = await createResultFlow(async () => order, async () => ({ ...done(), paymentStatus, completed: false, method, approvedAt: null }))(params(), attempt)
    assert.equal(result.phase, phase)
    assert.notEqual(resultHeading('success', result), '테스트 결제 완료')
    assert.equal(resultBusy(result), false)
    assert.equal(resultCanRetry(result), paymentStatus !== 'WAITING_FOR_DEPOSIT')
  }
})

test('claimed DONE with false completed or mismatched response is uncertain, never successful', async () => {
  for (const patch of [{ completed: false }, { amount: 1 }, { orderId: 'other' }, { approvedAt: null }, { currency: 'USD' }]) {
    const result = await createResultFlow(async () => order, async () => ({ ...done(), ...patch }))(params(), attempt)
    assert.equal(result.phase, 'confirmation-unknown'); assert.equal(resultCanRetry(result), true)
  }
})

test('backend errors produce safe distinct states without exposing raw values', async () => {
  for (const [kind, phase] of [['request', 'invalid-result'], ['order', 'order-unavailable'], ['conflict', 'confirmation-conflict'],
    ['rejected', 'confirmation-failed'], ['configuration', 'confirmation-unavailable'], ['network', 'confirmation-network-error'], ['unknown', 'confirmation-unknown']] as const) {
    const result = await createResultFlow(async () => order, async () => { throw new ConfirmationError(kind) })(params(), attempt)
    assert.equal(result.phase, phase); assert.ok(!JSON.stringify(result).includes('fixture_only'))
  }
  for (const error of [new TypeError('fixture_only'), new DOMException('fixture_only', 'TimeoutError'), new Error('fixture_only')]) {
    const result = await createResultFlow(async () => order, async () => { throw error })(params(), attempt)
    assert.ok(resultCanRetry(result)); assert.ok(!JSON.stringify(result).includes('fixture_only'))
  }
})

test('no automatic polling: retry is a new explicit invocation with the same three values', async () => {
  const requests: ApprovalRequest[] = []
  const flow = createResultFlow(async () => order, async request => {
    requests.push(request)
    return { ...done(), paymentStatus: 'UNKNOWN', completed: false, method: null, approvedAt: null }
  })
  assert.equal((await flow(params(), attempt)).phase, 'confirmation-unknown')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(requests.length, 1)
  assert.equal((await flow(params(), attempt)).phase, 'confirmation-unknown')
  assert.deepEqual(requests[0], requests[1]); assert.equal(requests.length, 2)
})

test('refresh and review markers cannot fake completion; expired submitted orders can reach backend recovery', async () => {
  let calls = 0
  const flow = createResultFlow(async () => { throw { status: 404 } }, async () => { calls++; return done() })
  assert.equal((await flow(params(), attempt)).phase, 'order-unavailable')
  for (const review of ['invalid', JSON.stringify({ orderId: order.orderId, status: 'DONE' }), confirmationReview({ ...order, amount: 1 })]) {
    assert.equal((await flow(params(), attempt, { review })).phase, 'order-unavailable')
  }
  assert.equal(calls, 0)
  assert.equal((await flow(params(), attempt, { review: confirmationReview(order) })).phase, 'approved')
  assert.equal(calls, 1)
  const marker = confirmationReview(order)
  assert.ok(!marker.includes('fixture_only')); assert.ok(!marker.includes('DONE'))
})

test('review hint never bypasses callback or server amount validation', async () => {
  let calls = 0
  const flow = createResultFlow(async () => ({ ...order, amount: 1 }), async () => { calls++; return done() })
  assert.equal((await flow(params(), attempt, { review: confirmationReview(order) })).phase, 'order-mismatch')
  const p = params(); p.set('amount', '1')
  assert.equal((await flow(p, attempt, { review: confirmationReview(order) })).phase, 'invalid-result')
  assert.equal(calls, 0)
})

test('detached or throwing subscriber cannot cancel approval or corrupt its final result', async () => {
  let active = true, updates = 0
  const flow = createResultFlow(async () => order, async () => { active = false; return done() })
  const first = flow(params(), attempt, { onProgress: () => { if (active) updates++ } })
  const second = flow(params(), attempt, { onProgress: () => { throw new Error('detached fixture') } })
  assert.equal((await first).phase, 'approved'); assert.equal((await second).phase, 'approved')
  assert.equal(updates, 2)
})

test('concrete backend envelope client and success flow integrate using only fake transport', async () => {
  let count = 0
  const confirm = createPaymentConfirmationClient('http://localhost:8080', async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body as string), { paymentKey: 'fixture_only', orderId: order.orderId, amount: 10000 })
    count++
    return count === 1
      ? { status: 202, json: async () => ({ success: true, data: { ...done(), paymentStatus: 'UNKNOWN', completed: false, method: null, approvedAt: null } }) }
      : { status: 200, json: async () => ({ success: true, data: done() }) }
  })
  const flow = createResultFlow(async () => order, confirm)
  assert.equal((await flow(params(), attempt)).phase, 'confirmation-unknown')
  assert.equal((await flow(params(), attempt, { review: confirmationReview(order) })).phase, 'approved')
  assert.equal(count, 2)
})

test('loading and retry presentation stays separate from completed and failure pages', () => {
  for (const phase of ['validating', 'checking-order', 'confirming'] as const) {
    const value: ResultState = { phase, message: '' }
    assert.equal(resultBusy(value), true); assert.equal(resultCanRetry(value), false)
  }
  assert.equal(resultHeading('fail', { phase: 'invalid-result', message: '' }), '테스트 결제 인증 실패')
  assert.equal(resultCanRetry({ phase: 'approved', message: '' }), false)
})
