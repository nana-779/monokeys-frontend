import test from 'node:test'
import assert from 'node:assert/strict'
import { readFailure, readSuccess } from './payment-result'

const order = { orderId: 'dev_' + 'a'.repeat(32), orderName: '테스트', amount: 10000, currency: 'KRW', status: 'PENDING' }
const params = () => new URLSearchParams({ orderId: order.orderId, amount: '10000', paymentKey: 'fixture_only' })
test('success callback correlates requested order without returning or storing paymentKey', () => {
  assert.deepEqual(readSuccess(params(), JSON.stringify(order)), order)
  assert.equal('paymentKey' in readSuccess(params(), JSON.stringify(order)), false)
})
test('success rejects missing, duplicate, malformed, mismatched and uncorrelated values', () => {
  for (const key of ['orderId', 'amount', 'paymentKey']) {
    const missing = params(); missing.delete(key); assert.throws(() => readSuccess(missing, JSON.stringify(order)))
    const duplicate = params(); duplicate.append(key, 'other'); assert.throws(() => readSuccess(duplicate, JSON.stringify(order)))
  }
  for (const amount of ['0', '10001', '1e4', '-1', 'NaN']) { const p = params(); p.set('amount', amount); assert.throws(() => readSuccess(p, JSON.stringify(order))) }
  assert.throws(() => readSuccess(params(), null)); assert.throws(() => readSuccess(params(), 'invalid'))
  assert.throws(() => readSuccess(params(), JSON.stringify({ ...order, orderId: 'dev_'+'b'.repeat(32) })))
})
test('fail callback maps cancellation and does not render arbitrary message', () => {
  assert.match(readFailure(new URLSearchParams('code=USER_CANCEL&message=private')).message, /취소/)
  assert.ok(!readFailure(new URLSearchParams('code=UNKNOWN&message=private')).message.includes('private'))
  assert.throws(() => readFailure(new URLSearchParams('code=A&code=B')))
  assert.throws(() => readFailure(new URLSearchParams('code=%3Cscript%3E')))
})
