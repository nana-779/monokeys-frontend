import test from 'node:test'
import assert from 'node:assert/strict'
import { createPaymentRequester, paymentErrorMessage, paymentUrls } from './payment-request'

const order = { orderId: 'dev_' + 'a'.repeat(32), orderName: '테스트 키보드', amount: 10000, currency: 'KRW' as const, status: 'PENDING' as const }
const input = () => ({ order, ready: true, clientKey: 'test_gck_fixture_only', origin: 'http://localhost:3000', signal: new AbortController().signal })
function fixture() {
  const calls: unknown[] = []
  const deps = { find: async (_id: string, _signal: AbortSignal): Promise<unknown> => { calls.push('find'); return order },
    remember: () => { calls.push('remember') }, request: async (value: unknown) => { calls.push(value) } }
  return { deps, calls }
}
test('server lookup and correlation precede supported SDK request parameters', async () => {
  const { deps, calls } = fixture()
  await createPaymentRequester(deps)(input())
  assert.deepEqual(calls, ['find', 'remember', { orderId: order.orderId, orderName: order.orderName,
    successUrl: 'http://localhost:3000/dev/toss-order/success', failUrl: 'http://localhost:3000/dev/toss-order/fail' }])
})
test('not rendered, missing/live key and invalid order never call server or SDK', async () => {
  for (const value of [{ ...input(), ready: false }, { ...input(), clientKey: undefined },
    { ...input(), clientKey: 'live_gck_fixture_only' }, { ...input(), order: { ...order, amount: 0 } },
    { ...input(), order: { ...order, orderName: '' } }]) {
    const { deps, calls } = fixture()
    await assert.rejects(createPaymentRequester(deps)(value)); assert.equal(calls.length, 0)
  }
})
test('missing, expired, malformed and changed server orders never request SDK', async () => {
  for (const response of [null, { ...order, amount: 10001 }, { ...order, orderName: '변경' }, { ...order, status: 'PAID' }]) {
    const { deps, calls } = fixture(); deps.find = async () => response
    await assert.rejects(createPaymentRequester(deps)(input())); assert.equal(calls.length, 0)
  }
  const { deps, calls } = fixture(); deps.find = async () => { throw new Error('404 expired') }
  await assert.rejects(createPaymentRequester(deps)(input())); assert.equal(calls.length, 0)
})
test('double click stays locked until SDK settles; cancellation permits retry', async () => {
  const { deps } = fixture(); let release!: () => void, requested = 0
  deps.request = async () => { requested++; await new Promise<void>((_resolve, reject) => { release = () => reject({ code: 'USER_CANCEL' }) }) }
  const request = createPaymentRequester(deps), first = request(input())
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(request(input()), /진행 중/); assert.equal(requested, 1)
  release(); await assert.rejects(first)
  deps.request = async () => { throw { code: 'USER_CANCEL', message: 'private details' } }
  await assert.rejects(request(input()))
  deps.request = async () => { requested++ }; await request(input()); assert.equal(requested, 2)
})

test('SDK resolution keeps the same order blocked after the busy flag is released', async () => {
  const { deps, calls } = fixture(); const request = createPaymentRequester(deps)
  await request(input()); const count = calls.length
  await assert.rejects(request(input()), /이미 결제 인증/)
  assert.equal(calls.length, count)
})

test('unknown SDK errors keep the order blocked and redact diagnostics', async () => {
  for (const error of [new TypeError('private network detail'), { code: 'UNKNOWN', message: 'private provider detail' },
    Object.assign(new Error('private timeout detail'), { name: 'TimeoutError' })]) {
    const { deps } = fixture(); let requests = 0
    deps.request = async () => { requests++; throw error }
    const request = createPaymentRequester(deps)
    await assert.rejects(request(input()), error => {
      assert.match(paymentErrorMessage(error), /다시 결제하지 말고/)
      assert.ok(!paymentErrorMessage(error).includes('private')); return true
    })
    await assert.rejects(request(input()), /이미 결제 인증/)
    assert.equal(requests, 1)
  }
})

test('required-terms refusal permits a corrected retry but lookup failure never latches an order', async () => {
  const { deps } = fixture(); const request = createPaymentRequester(deps)
  deps.request = async () => { throw { code: 'NOT_AGREED_REQUIRED_TERMS' } }
  await assert.rejects(request(input()))
  deps.find = async () => { throw new TypeError('lookup only') }
  await assert.rejects(request(input()))
  deps.find = async () => order; deps.request = async () => {}
  await request(input())
})
test('aborted or late server response and storage failure never request payment', async () => {
  const { deps, calls } = fixture(); const controller = new AbortController()
  deps.find = async () => { controller.abort(); return order }
  await assert.rejects(createPaymentRequester(deps)({ ...input(), signal: controller.signal })); assert.equal(calls.length, 0)
  deps.find = async () => order; deps.remember = () => { throw new Error('Storage unavailable') }
  await assert.rejects(createPaymentRequester(deps)(input())); assert.equal(calls.length, 0)
})
test('unsafe redirect origins rejected and errors never expose provider message', () => {
  for (const origin of ['javascript:alert(1)', 'http://untrusted.example', 'https://a.example/path', 'https://user:pass@a.example']) assert.throws(() => paymentUrls(origin))
  assert.match(paymentUrls('https://shop.example').successUrl, /^https:\/\/shop.example\//)
  assert.match(paymentErrorMessage({ code: 'USER_CANCEL', message: 'secret' }), /취소/)
  assert.match(paymentErrorMessage({ code: 'NOT_AGREED_REQUIRED_TERMS' }), /약관/)
  assert.ok(!paymentErrorMessage(new Error('secret')).includes('secret'))
})
