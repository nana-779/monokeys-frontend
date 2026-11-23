import { apiRequest } from '@/lib/api-client'

export type MyOrder = {
  orderNumber: string
  orderedAt: string
  paymentAmount: number | null
  orderStatus: 'PENDING' | 'ORDERED' | 'CANCELLED' | 'CONFIRMED'
  paymentStatus: 'READY' | 'PAID' | 'FAILED' | 'CANCELLED' | null
}

export async function readMyOrders(signal: AbortSignal): Promise<MyOrder[]> {
  // 공통 클라이언트가 로그인 쿠키를 보내므로 회원 번호를 따로 전달하지 않습니다.
  const response = await apiRequest<{ success: boolean; data: MyOrder[] | null }>('/api/orders/me', { signal })
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error('주문 목록 응답을 확인할 수 없습니다.')
  }
  return response.data
}
