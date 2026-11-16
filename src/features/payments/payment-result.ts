import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

export const PAYMENT_ATTEMPT_KEY = 'toss-dev-payment-attempt'
function single(params: URLSearchParams, key: string) {
  const values = params.getAll(key)
  if (values.length !== 1 || !values[0]) throw new Error('결과 필수값이 없거나 중복되었습니다.')
  return values[0]
}
export function readSuccess(params: URLSearchParams, attempt: string | null): DevTestOrder {
  const id = single(params, 'orderId'), amount = single(params, 'amount'), key = single(params, 'paymentKey')
  if (!/^\d+$/.test(amount) || key.length > 200 || !attempt) throw new Error('결과를 확인할 수 없습니다.')
  const expected = validateDevOrder(JSON.parse(attempt))
  if (id !== expected.orderId || Number(amount) !== expected.amount) throw new Error('요청한 주문과 결과가 다릅니다.')
  return expected
}
export function readFailure(params: URLSearchParams) {
  const code = single(params, 'code')
  if (!/^[A-Z0-9_]{1,100}$/.test(code)) throw new Error('잘못된 오류 코드입니다.')
  // Never render the provider's raw message, which can contain request data.
  return { code, message: ['USER_CANCEL', 'PAY_PROCESS_CANCELED'].includes(code)
    ? '결제 인증이 취소되었습니다.' : '결제 인증이 실패했습니다. 테스트 주문을 다시 준비해 주세요.' }
}
