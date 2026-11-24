import { OrderRefundResultView } from '@/features/payments/order-refund-result-view'

export default async function OrderRefundResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ refundId?: string | string[] }>
}) {
  const [{ orderNumber }, { refundId }] = await Promise.all([params, searchParams])
  const id = typeof refundId === 'string' && /^[1-9]\d*$/.test(refundId) ? Number(refundId) : null
  return <OrderRefundResultView key={JSON.stringify([orderNumber, id])} orderNumber={orderNumber} refundId={id} />
}
