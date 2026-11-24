import { API_BASE_URL } from '@/lib/api-client'

export type AdminOrder = {
  id: number
  number: string
  paidAt: string | null
  amount: number | null
  orderStatus: string
  paymentStatus: string | null
  deliveryStatus: string | null
  company: string | null
  tracking: string | null
  name: string
  phone: string
  postalCode: string
  roadAddress: string
  detailAddress: string
  memo: string | null
  items: { name: string; quantity: number }[]
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const response = await fetch(`${API_BASE_URL}/api/admin/orders`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const result = await response.json()
  if (!response.ok || !result.success || !Array.isArray(result.data))
    throw new Error(result.message || '주문을 불러오지 못했습니다.')
  return result.data
}

export type AdminOrderChanges = Partial<
  Pick<
    AdminOrder,
    'name' | 'phone' | 'postalCode' | 'roadAddress' | 'detailAddress' | 'company' | 'tracking'
  >
>

export async function updateAdminOrder(id: number, changes: AdminOrderChanges) {
  const response = await fetch(`${API_BASE_URL}/api/admin/orders/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  const result = (await response.json()) as { success: boolean; message?: string }
  if (!response.ok || !result.success)
    throw new Error(result.message || '주문 정보를 저장하지 못했습니다.')
}
