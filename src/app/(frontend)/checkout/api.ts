import { apiRequest } from '@/lib/api-client'

export type ApiResponse<T> = {
  success: boolean
  message: string | null
  data: T
}

export type OrderItemInput = {
  cartItemId?: number
  productId?: number
  manualBuildId?: number
  autoBuildId?: number
  customDesignData?: string
  quantity: number
}

export type OrderCreateInput = {
  ordererEmail: string
  ordererName?: string
  ordererPhone?: string
  recipientName?: string
  recipientPhone?: string
  postalCode?: string
  roadAddress?: string
  detailAddress?: string
  deliveryMemo?: string
  items: OrderItemInput[]
}

export type OrderResponseData = {
  orderId: number
  orderNumber: string
  orderStatus: string
  ordererName: string
  ordererPhone: string
  ordererEmail: string
  totalProductAmount: number
  deliveryFee: number
  finalPayAmount: number
  orderedAt?: string
  createdAt?: string
  items?: Array<{
    orderItemId: number
    productId: number
    productName: string
    unitPrice: number
    quantity: number
    totalPrice: number
  }>
}

export async function submitOrderApi(input: OrderCreateInput): Promise<OrderResponseData> {
  const res = await apiRequest<ApiResponse<OrderResponseData>>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.data
}

export async function getOrderApi(orderId: number): Promise<OrderResponseData> {
  const res = await apiRequest<ApiResponse<OrderResponseData>>(`/api/orders/${orderId}`, {
    method: 'GET',
  })
  return res.data
}

export type PaymentConfirmInput = {
  paymentKey: string
  orderId: string
  amount: number
}

export async function confirmPaymentApi(input: PaymentConfirmInput): Promise<OrderResponseData> {
  const res = await apiRequest<ApiResponse<OrderResponseData>>('/api/payments/complete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.data
}

export async function failPaymentApi(orderId: string, message?: string): Promise<void> {
  try {
    await apiRequest<ApiResponse<string>>(
      `/api/payments/fail?orderId=${encodeURIComponent(orderId)}&message=${encodeURIComponent(message || '결제 실패')}`,
      {
        method: 'POST',
      },
    )
  } catch {
    // 실패 통지는 최선형 처리
  }
}