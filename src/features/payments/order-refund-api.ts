import { apiRequest } from '@/lib/api-client'

export type OrderRefundPreview = {
  orderNumber: string
  paymentAmount: number | null
  paymentStatus: 'READY' | 'PAID' | 'FAILED' | 'CANCELLED' | null
  localRemainingAmount: number | null
  status: 'PRECHECK_PASSED' | 'BLOCKED' | 'POLICY_REVIEW_REQUIRED'
  message: string
}

export type OrderRefundHistory = {
  orderNumber: string
  paymentAmount: number | null
  completedAmount: number | null
  remainingAmount: number | null
  status: 'NO_PAYMENT' | 'NONE' | 'PARTIAL' | 'FULL' | 'REVIEW_REQUIRED'
  entries: Array<{
    id: number
    amount: number
    reason: string
    requestedAt: string
    canceledAt: string | null
    status: 'REQUESTED' | 'COMPLETED' | 'REJECTED'
    effect: 'PARTIAL' | 'FULL' | null
  }>
}

// 공통 클라이언트가 로그인 쿠키를 전달합니다. 화면에서는 사전 확인과 환불 이력을 읽기만 합니다.
export async function readOrderRefundPreview(orderNumber: string, signal: AbortSignal) {
  const response = await apiRequest<{ success: boolean; data: OrderRefundPreview | null }>(
    '/api/payments/orders/' + encodeURIComponent(orderNumber) + '/refund/eligibility',
    { method: 'GET', signal },
  )
  if (!response.success || !response.data) {
    throw new Error('환불 사전 조회 응답을 확인할 수 없습니다.')
  }
  return response.data
}

export async function readOrderRefundHistory(orderNumber: string, signal: AbortSignal) {
  const response = await apiRequest<{ success: boolean; data: OrderRefundHistory | null }>(
    '/api/payments/orders/' + encodeURIComponent(orderNumber) + '/refund/history',
    { method: 'GET', signal },
  )
  if (!response.success || !response.data) {
    throw new Error('환불 내역 응답을 확인할 수 없습니다.')
  }
  return response.data
}
