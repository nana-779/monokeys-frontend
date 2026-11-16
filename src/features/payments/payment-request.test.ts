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
  deps.request = async () => { requested++; await new Promise<void>(resolve => { release = resolve }) }
  const request = createPaymentRequester(deps), first = request(input())
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(request(input()), /진행 중/); assert.equal(requested, 1)
  release(); await first
  deps.request = async () => { throw { code: 'USER_CANCEL', message: 'private details' } }
  await assert.rejects(request(input()))
  deps.request = async () => { requested++ }; await request(input()); assert.equal(requested, 2)
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
