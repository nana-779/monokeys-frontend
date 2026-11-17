import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

export const PAYMENT_ATTEMPT_KEY = 'toss-dev-payment-attempt'
export const PAYMENT_RESULT_REVIEW_KEY = 'toss-dev-payment-review'
export type ApprovalRequest = Readonly<{ paymentKey: string; orderId: string; amount: number }>
// 실제 개발용 통신 어댑터는 상태 코드와 공통 응답 구조를 검사한 뒤 결과를 돌려줍니다.
export type ApprovalConnector = (request: ApprovalRequest, signal: AbortSignal) => Promise<unknown>
export class ResultValidationError extends Error {
  // 검증에 실패한 입력값이나 결제 키를 예외에 넣지 않고 고정된 안내만 전달합니다.
  constructor() { super('결과 필수값·주문번호·금액을 확인해 주세요.') }
}
// 같은 필수 항목이 여러 번 오거나 비어 있으면 어느 값을 믿을지 결정하지 않고 콜백을 거부합니다.
function single(params: URLSearchParams, key: string, optional = false) {
  const values = params.getAll(key)
  if (optional && values.length === 0) return undefined
  if (values.length !== 1 || !values[0]?.trim()) throw new ResultValidationError()
  return values[0]
}
// 주소의 결제 키·주문번호·금액을 검사하고 요청 당시 주문과 대조합니다. 주소에 성공 값이 있어도 승인 완료로 간주하지 않습니다.
export function validateSuccess(params: URLSearchParams, attempt: string | null): {
  order: DevTestOrder; approval: ApprovalRequest
} {
  try {
    const orderId = single(params, 'orderId')!, amountText = single(params, 'amount')!, paymentKey = single(params, 'paymentKey')!
    if (!/^[1-9][0-9]*$/.test(amountText) || !Number.isSafeInteger(Number(amountText)) ||
        !/^[\x21-\x7e]{1,200}$/.test(paymentKey) || !attempt)
      throw new ResultValidationError()
    const order = validateDevOrder(JSON.parse(attempt))
    if (orderId !== order.orderId || Number(amountText) !== order.amount) throw new ResultValidationError()
    return { order, approval: { paymentKey, orderId, amount: order.amount } }
  } catch { throw new ResultValidationError() }
}
// 결제 키를 화면용 주문 데이터에서 제외한 채 검증된 주문 정보만 반환합니다.
export function readSuccess(params: URLSearchParams, attempt: string | null): DevTestOrder {
  return validateSuccess(params, attempt).order
}
export type FailureCategory = 'cancelled' | 'card-rejected' | 'failed' | 'system-error'
// 실패 주소의 값은 검증하고, 알려진 코드만 안전한 안내로 바꿉니다. 미확인 오류를 확정 실패로 단정하지 않습니다.
export function readFailure(params: URLSearchParams) {
  const rawCode = single(params, 'code')!
  if (!/^[A-Z0-9_]{1,100}$/.test(rawCode)) throw new ResultValidationError()
  const knownCodes = new Set(['USER_CANCEL', 'PAY_PROCESS_CANCELED', 'REJECT_CARD_COMPANY', 'REJECT_CARD_PAYMENT',
    'NETWORK_ERROR', 'PROVIDER_STATUS_UNHEALTHY', 'FAILED_INTERNAL_SYSTEM_PROCESSING', 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
    'PAY_PROCESS_ABORTED', 'EXPIRED_PAYMENT', 'UNKNOWN'])
  const code = knownCodes.has(rawCode) ? rawCode : 'UNKNOWN'
  const rawMessage = single(params, 'message', true)
  if (rawMessage !== undefined && (rawMessage.length > 500 || /[\u0000-\u001f\u007f]/u.test(rawMessage))) throw new ResultValidationError()
  const orderId = single(params, 'orderId', true)
  if (orderId !== undefined && !/^dev_[a-f0-9]{32}$/.test(orderId)) throw new ResultValidationError()
  let category: FailureCategory, message: string
  if (['USER_CANCEL', 'PAY_PROCESS_CANCELED'].includes(code)) {
    category = 'cancelled'; message = '결제 인증이 취소되었습니다. 다시 시도할 수 있습니다.'
  } else if (['REJECT_CARD_COMPANY', 'REJECT_CARD_PAYMENT'].includes(code)) {
    category = 'card-rejected'; message = '카드사에서 결제를 거절했습니다. 결제수단을 확인하거나 다른 수단으로 다시 시도해 주세요.'
  } else if (['NETWORK_ERROR', 'PROVIDER_STATUS_UNHEALTHY', 'FAILED_INTERNAL_SYSTEM_PROCESSING', 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING', 'UNKNOWN'].includes(code)) {
    category = 'system-error'; message = '결제 결과를 확인하지 못했습니다. 다시 결제하지 말고 기존 결제 상태를 먼저 확인해 주세요.'
  } else {
    category = 'failed'; message = '결제 인증이 실패했습니다. 테스트 주문을 다시 준비해 주세요.'
  }
  // 외부 메시지는 형식만 검사하며 화면에 그대로 표시하거나 문서에 없는 원인을 추정하지 않습니다.
  return { code, category, message }
}
