import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

export type PaymentRequest = { orderId: string; orderName: string; successUrl: string; failUrl: string }
export class PaymentRequestError extends Error {}
const retryableSdkCodes = new Set(['USER_CANCEL', 'PAY_PROCESS_CANCELED', 'NOT_AGREED_REQUIRED_TERMS'])

// 현재 사이트의 성공·실패 주소를 만들고 안전하지 않은 반환 주소는 결제 요청 전에 차단합니다.
export function paymentUrls(origin: string) {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new PaymentRequestError('반환 주소를 확인해 주세요.')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new PaymentRequestError('로컬 테스트 주소를 사용해 주세요.')
  return {
    successUrl: new URL('/dev/toss-order/success', url).href,
    failUrl: new URL('/dev/toss-order/fail', url).href,
  }
}

// 취소·약관 미동의와 일반 오류를 구분하되 SDK가 보낸 민감한 상세 메시지는 표시하지 않습니다.
export function paymentErrorMessage(error: unknown) {
  if (error instanceof PaymentRequestError) return error.message
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === 'USER_CANCEL' || code === 'PAY_PROCESS_CANCELED') return '결제 인증을 취소했습니다. 다시 시도할 수 있습니다.'
  if (code === 'NOT_AGREED_REQUIRED_TERMS') return '필수 결제 약관에 동의해 주세요.'
  return '결제를 요청하지 못했습니다. 주문 만료·서버·네트워크 상태를 확인하고 다시 시도해 주세요.'
}

// 화면의 주문과 서버 주문을 대조한 뒤 구매자 인증을 요청합니다. 실제 주문의 권한·최종금액 검증은 추후 서버 연동이 필요합니다.
export function createPaymentRequester(deps: {
  find: (id: string, signal: AbortSignal) => Promise<unknown>
  request: (value: PaymentRequest) => Promise<unknown>
  remember: (order: DevTestOrder) => void
}) {
  let busy = false
  // 이 화면 인스턴스에서 이미 인증을 요청한 주문을 기억합니다. 서버 재시작이나 여러 서버에 대한 영속 중복 방지 장치는 아닙니다.
  const submitted = new Set<string>()
  return async (input: { order: DevTestOrder; ready: boolean; clientKey: string | undefined; origin: string; signal: AbortSignal }) => {
    if (busy) throw new PaymentRequestError('결제 요청이 진행 중입니다.')
    busy = true
    try {
      if (!input.ready) throw new PaymentRequestError('결제수단과 약관 UI 준비가 끝난 뒤 다시 시도해 주세요.')
      if (!/^test_gck_[A-Za-z0-9_-]+$/.test(input.clientKey ?? '')) throw new PaymentRequestError('테스트 주문서형 클라이언트 키만 사용할 수 있습니다.')
      const prepared = validateDevOrder(input.order)
      if (submitted.has(prepared.orderId)) throw new PaymentRequestError('이미 결제 인증을 요청한 주문입니다. 다시 결제하지 말고 기존 결제 결과를 확인해 주세요.')
      const urls = paymentUrls(input.origin)
      input.signal.throwIfAborted()
      // 취소 가능한 서버 조회에만 시간 제한을 적용합니다. 진행 중인 SDK 결제 요청의 잠금을 먼저 풀지 않습니다.
      const lookupSignal = AbortSignal.any([input.signal, AbortSignal.timeout(15_000)])
      const saved = validateDevOrder(await deps.find(prepared.orderId, lookupSignal))
      lookupSignal.throwIfAborted()
      if (saved.orderId !== prepared.orderId || saved.orderName !== prepared.orderName ||
          saved.amount !== prepared.amount || saved.currency !== prepared.currency || saved.status !== prepared.status)
        throw new PaymentRequestError('서버 주문 정보가 변경되었습니다. 테스트 주문을 다시 준비해 주세요.')
      // 성공 콜백의 주문번호·금액을 원래 요청과 대조할 수 있도록 주문 정보를 먼저 보관합니다.
      deps.remember(saved)
      input.signal.throwIfAborted()
      // 클릭 처리 중뿐 아니라 SDK 결과가 반환되거나 불확실한 뒤에도 같은 주문의 재요청을 막습니다.
      submitted.add(saved.orderId)
      try {
        await deps.request({ orderId: saved.orderId, orderName: saved.orderName, ...urls })
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        // 확실한 취소나 약관 미동의만 다시 요청하도록 허용합니다. 결과를 모르면 새 결제보다 기존 결과 확인이 우선입니다.
        if (typeof code === 'string' && retryableSdkCodes.has(code)) {
          submitted.delete(saved.orderId)
          throw error
        }
        throw new PaymentRequestError('결제 인증 결과를 확인하지 못했습니다. 다시 결제하지 말고 기존 결제 결과를 확인해 주세요.')
      }
    } finally { busy = false }
  }
}
