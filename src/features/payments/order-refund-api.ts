import { apiRequest } from '@/lib/api-client'

export type OrderRefundPreview = {
  orderNumber: string
  paymentAmount: number | null
  paymentStatus: 'READY' | 'PAID' | 'FAILED' | 'CANCELLED' | null
  localRemainingAmount: number | null
  status: 'PRECHECK_PASSED' | 'BLOCKED' | 'POLICY_REVIEW_REQUIRED'
  message: string
  cancellationEnabled: boolean
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

export type OrderCancellationResult = {
  refundId: number
  status: 'CANCELLATION_CONFIRMED' | 'PENDING_CONFIRMATION'
  amount: number
}

// 공통 클라이언트가 기존 로그인 쿠키를 전달합니다.
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

export function requestFullCancellation(orderNumber: string, cancelReason: string, expectedRemainingAmount: number) {
  // 확인한 잔액과 취소 사유만 보냅니다. 결제 키와 실제 취소 금액은 서버가 확인합니다.
  return postRefundAction(orderNumber, 'cancel', {
    mode: 'FULL',
    cancelReason,
    expectedRemainingAmount,
  })
}

export function reconcileCancellation(orderNumber: string) {
  // 결과가 불확실할 때는 기존 요청의 결과만 확인합니다.
  return postRefundAction(orderNumber, 'reconcile')
}

async function postRefundAction(
  orderNumber: string,
  action: 'cancel' | 'reconcile',
  body?: { mode: 'FULL'; cancelReason: string; expectedRemainingAmount: number },
) {
  const response = await apiRequest<{ success: boolean; data: OrderCancellationResult | null }>(
    '/api/payments/orders/' + encodeURIComponent(orderNumber) + '/refund/' + action,
    {
      method: 'POST',
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(action === 'cancel' ? 210_000 : 75_000),
    },
  )
  if (!response.success || !response.data ||
      !['CANCELLATION_CONFIRMED', 'PENDING_CONFIRMATION'].includes(response.data.status)) {
    throw new Error('취소 결과 응답을 확인할 수 없습니다.')
  }
  return response.data
}
