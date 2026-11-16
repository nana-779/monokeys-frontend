import { apiRequest } from '@/lib/api-client'
import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

// 실제 주문 API로 교체할 연결 지점입니다. 장바구니·회원 정보는 전송하지 않습니다.
export async function createDevTestOrder(signal: AbortSignal): Promise<DevTestOrder> {
  const response = await apiRequest<unknown>(
    '/api/dev/toss-orders',
    { method: 'POST', signal },
    201,
  )
  return readOrderResponse(response)
}
export async function getDevTestOrder(orderId: string, signal: AbortSignal): Promise<DevTestOrder> {
  const response = await apiRequest<unknown>(
    '/api/dev/toss-orders/' + encodeURIComponent(orderId),
    { signal },
    200,
  )
  return readOrderResponse(response)
}
function readOrderResponse(response: unknown): DevTestOrder {
  if (
    !response ||
    typeof response !== 'object' ||
    !('success' in response) ||
    response.success !== true ||
    !('data' in response)
  ) {
    throw new Error('테스트 주문 응답 형식이 올바르지 않습니다.')
  }
  return validateDevOrder(response.data)
}
