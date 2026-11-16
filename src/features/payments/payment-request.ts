import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

export type PaymentRequest = { orderId: string; orderName: string; successUrl: string; failUrl: string }
export class PaymentRequestError extends Error {}

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

export function paymentErrorMessage(error: unknown) {
  if (error instanceof PaymentRequestError) return error.message
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === 'USER_CANCEL' || code === 'PAY_PROCESS_CANCELED') return '결제 인증을 취소했습니다. 다시 시도할 수 있습니다.'
  if (code === 'NOT_AGREED_REQUIRED_TERMS') return '필수 결제 약관에 동의해 주세요.'
  return '결제를 요청하지 못했습니다. 주문 만료·서버·네트워크 상태를 확인하고 다시 시도해 주세요.'
}

// Only the test-order source is replaceable. Real orders must still be validated by the server.
export function createPaymentRequester(deps: {
  find: (id: string, signal: AbortSignal) => Promise<unknown>
  request: (value: PaymentRequest) => Promise<unknown>
  remember: (order: DevTestOrder) => void
}) {
  let busy = false
  return async (input: { order: DevTestOrder; ready: boolean; clientKey: string | undefined; origin: string; signal: AbortSignal }) => {
    if (busy) throw new PaymentRequestError('결제 요청이 진행 중입니다.')
    busy = true
    try {
      if (!input.ready) throw new PaymentRequestError('결제수단과 약관 UI 준비가 끝난 뒤 다시 시도해 주세요.')
      if (!/^test_gck_[A-Za-z0-9_-]+$/.test(input.clientKey ?? '')) throw new PaymentRequestError('테스트 주문서형 클라이언트 키만 사용할 수 있습니다.')
      const prepared = validateDevOrder(input.order)
      const urls = paymentUrls(input.origin)
      input.signal.throwIfAborted()
      // Bound only the abortable server lookup; never unlock a still-running SDK payment request.
      const lookupSignal = AbortSignal.any([input.signal, AbortSignal.timeout(15_000)])
      const saved = validateDevOrder(await deps.find(prepared.orderId, lookupSignal))
      lookupSignal.throwIfAborted()
      if (saved.orderId !== prepared.orderId || saved.orderName !== prepared.orderName ||
          saved.amount !== prepared.amount || saved.currency !== prepared.currency || saved.status !== prepared.status)
        throw new PaymentRequestError('서버 주문 정보가 변경되었습니다. 테스트 주문을 다시 준비해 주세요.')
      deps.remember(saved)
      input.signal.throwIfAborted()
      await deps.request({ orderId: saved.orderId, orderName: saved.orderName, ...urls })
    } finally { busy = false }
  }
}
