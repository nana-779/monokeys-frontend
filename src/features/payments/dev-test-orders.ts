import { apiRequest } from '@/lib/api-client'
import { validateDevOrder, type DevTestOrder } from './test-order-preparation'

// 실제 주문 API로 교체할 연결 지점입니다. 장바구니·회원 정보는 전송하지 않습니다.
// 입력 가격 없이 개발 주문 생성 API를 호출하고, 서버가 정한 주문번호·상품명·금액을 받습니다. 실제 주문 연결은 추후 11단계 대상입니다.
export async function createDevTestOrder(signal: AbortSignal): Promise<DevTestOrder> {
  const response = await apiRequest<unknown>(
    '/api/dev/toss-orders',
    { method: 'POST', signal },
    201,
  )
  return readOrderResponse(response)
}
// 결제 직전 서버에 남아 있는 개발 주문을 다시 조회합니다. 주문 만료나 서버 재시작으로 조회가 실패할 수 있습니다.
export async function getDevTestOrder(orderId: string, signal: AbortSignal): Promise<DevTestOrder> {
  const response = await apiRequest<unknown>(
    '/api/dev/toss-orders/' + encodeURIComponent(orderId),
    { signal },
    200,
  )
  return readOrderResponse(response)
}
// 성공 응답의 공통 포장을 확인한 뒤 주문 데이터의 형식도 검사하여 잘못된 금액이 SDK에 전달되지 않게 합니다.
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
