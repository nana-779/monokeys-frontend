import { apiRequest } from '@/lib/api-client'

export type MyOrder = {
  orderNumber: string
  orderedAt: string
  paymentAmount: number | null
  orderStatus: 'PENDING' | 'ORDERED' | 'CANCELLED' | 'CONFIRMED'
  paymentStatus: 'READY' | 'PAID' | 'FAILED' | 'CANCELLED' | null
  deliveryStatus: 'PREPARING' | 'SHIPPING' | 'DELIVERED' | 'RETURNED' | null
  items: Array<{ orderItemId: number; productName: string; unitPrice: number; quantity: number; thumbnailUrl: string | null }>
}

// 주문번호를 전달하면 본인 주문 상세 API가 로그인 회원의 소유권을 확인합니다.
export async function readMyOrder(orderNumber: string, signal: AbortSignal): Promise<MyOrder> {
  const response = await apiRequest<{ success: boolean; data: MyOrder | null }>(
    '/api/orders/me/' + encodeURIComponent(orderNumber), { signal },
  )
  if (!response.success || response.data?.orderNumber !== orderNumber) {
    throw new Error('주문 상세 응답을 확인할 수 없습니다.')
  }
  return response.data
}

export async function readMyOrders(signal: AbortSignal): Promise<MyOrder[]> {
  // 공통 클라이언트가 로그인 쿠키를 보내므로 회원 번호를 따로 전달하지 않습니다.
  const response = await apiRequest<{ success: boolean; data: MyOrder[] | null }>('/api/orders/me', { signal })
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error('주문 목록 응답을 확인할 수 없습니다.')
  }
  return response.data
}
