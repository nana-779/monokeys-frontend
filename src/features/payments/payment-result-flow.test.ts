import test from 'node:test'
import assert from 'node:assert/strict'
import { createResultFlow, phaseMessage } from './payment-result-flow'
import { validateSuccess, readFailure } from './payment-result'

const order = { orderId: 'dev_'+'a'.repeat(32), orderName: '테스트', amount: 10000, currency: 'KRW', status: 'PENDING' }
const params = () => new URLSearchParams({ orderId: order.orderId, amount: '10000', paymentKey: 'fixture_only' })
const attempt = JSON.stringify(order)
test('valid result stops at unavailable approval; no fake completion or exposed key', async () => {
  const result = await createResultFlow(async () => order)(params(), attempt)
  assert.equal(result.phase, 'approval-unavailable')
  assert.match(result.message, /결제 완료가 아닙니다/)
  assert.ok(!JSON.stringify(result).includes('fixture_only'))
  assert.deepEqual(validateSuccess(params(), attempt).approval, { paymentKey: 'fixture_only', orderId: order.orderId, amount: 10000 })
})
test('invalid callback never queries server or enters approval phase', async () => {
  let calls = 0
  const flow = createResultFlow(async () => { calls++; return order })
  const p=params();p.set('amount','9999')
  assert.equal((await flow(p,attempt)).phase, 'invalid-result')
  assert.equal((await flow(params(),null)).phase, 'invalid-result')
  assert.equal(calls,0)
})
test('Strict Mode and simultaneous consumers share lookup; one subscriber cannot cancel another', async () => {
  let calls=0, release!: (value: unknown)=>void
  const flow=createResultFlow(async () => { calls++; return new Promise(resolve => {release=resolve}) })
  const first=flow(params(),attempt), second=flow(params(),attempt)
  assert.equal(first,second);assert.equal(calls,1)
  release(order)
  assert.equal((await second).phase,'approval-unavailable');await first
})
test('refresh never trusts a previous review and rechecks expired server order', async () => {
  let calls=0
  const flow=createResultFlow(async () => {calls++;if(calls>1)throw {status:404};return order})
  assert.equal((await flow(params(),attempt)).phase,'approval-unavailable')
  assert.equal((await flow(params(),attempt)).phase,'order-unavailable');assert.equal(calls,2)
})
test('server identity, amount, currency, name and status mismatch block progression', async () => {
  for(const response of [null,{...order,orderId:'dev_'+'b'.repeat(32)},{...order,amount:9999},
    {...order,orderName:'다른 상품'},{...order,currency:'USD'},{...order,status:'DONE'}]){
    assert.equal((await createResultFlow(async()=>response)(params(),attempt)).phase,'order-mismatch')
  }
})
test('lookup missing, network, timeout and server errors have safe separate results', async () => {
  for(const[error,phase]of [[{status:404},'order-unavailable'],[{status:410},'order-unavailable'],
    [new TypeError('private network details'),'network-error'],[new DOMException('private','TimeoutError'),'network-error'],
    [{status:500,message:'private server details'},'system-error']] as const){
    const result=await createResultFlow(async()=>{throw error})(params(),attempt)
    assert.equal(result.phase,phase);assert.ok(!JSON.stringify(result).includes('private'))
  }
})
test('failed lookup releases in-flight gate for read-only retry', async () => {
  let calls=0
  const flow=createResultFlow(async()=>{if(++calls===1)throw new TypeError('offline');return order})
  assert.equal((await flow(params(),attempt)).phase,'network-error')
  assert.equal((await flow(params(),attempt)).phase,'approval-unavailable')
})
test('success validation rejects blank or control keys and unsafe/noncanonical amounts', () => {
  for(const key of [' ','\t','some key','some\nkey','a'.repeat(201)]){const p=params();p.set('paymentKey',key);assert.throws(()=>validateSuccess(p,attempt))}
  for(const value of ['010000','10000.0','9007199254740992','Infinity','-10000']){const p=params();p.set('amount',value);assert.throws(()=>validateSuccess(p,attempt))}
})
test('failure classification covers cancellation, rejection, general and system errors', () => {
  for(const[code,category]of [['USER_CANCEL','cancelled'],['PAY_PROCESS_CANCELED','cancelled'],
    ['REJECT_CARD_COMPANY','card-rejected'],['PAY_PROCESS_ABORTED','failed'],['NETWORK_ERROR','system-error'],
    ['PROVIDER_STATUS_UNHEALTHY','system-error'],['UNDOCUMENTED_CODE','failed']]){
    const failure=readFailure(new URLSearchParams({code,message:'untrusted details'}))
    assert.equal(failure.category,category);assert.ok(!failure.message.includes('untrusted'))
  }
})
test('failure message and optional order are bounded, duplicate-safe and never echoed', () => {
  for(const query of ['code=USER_CANCEL&message=a&message=b','code=USER_CANCEL&message=%00',
    'code=USER_CANCEL&orderId=bad','code=USER_CANCEL&orderId='+order.orderId+'&orderId='+order.orderId])assert.throws(()=>readFailure(new URLSearchParams(query)))
  assert.throws(()=>readFailure(new URLSearchParams({code:'USER_CANCEL',message:'a'.repeat(501)})))
  assert.ok(!readFailure(new URLSearchParams({code:'USER_CANCEL',message:'<script>external</script>'})).message.includes('external'))
})
test('reserved approval states never advertise a completed payment', () => {
  assert.match(phaseMessage('confirming'),/まだ|아직/)
  assert.match(phaseMessage('confirmation-failed'),/결제 완료가 아닙니다/)
})
