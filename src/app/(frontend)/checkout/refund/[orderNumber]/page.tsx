import { RefundWorkflow } from '@/features/payments/refund-workflow'
import { OrderRefundPanel } from '@/features/payments/order-refund-panel'

// 마이페이지에서 주문번호별 결제 취소와 환불 내역을 확인하는 화면입니다.
export default async function OrderRefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const [{ orderNumber }, { view }] = await Promise.all([params, searchParams])
  const historyOnly = view === 'history'

  return (
    <section className="mx-auto w-[92%] max-w-5xl py-10 sm:py-14">
      <p className="mb-2 text-xs text-neutral-500">주문 내역 / 취소 및 환불</p>
      <h1 className="text-3xl font-bold tracking-tight">{historyOnly ? '환불 내역' : '주문 취소 및 환불'}</h1>
      {historyOnly ? <OrderRefundPanel orderNumber={orderNumber} historyOnly /> : <RefundWorkflow key={orderNumber} orderNumber={orderNumber} />}
    </section>
  )
}
