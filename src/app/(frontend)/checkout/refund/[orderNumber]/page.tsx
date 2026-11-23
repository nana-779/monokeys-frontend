import { OrderRefundPanel } from '@/features/payments/order-refund-panel'

// 마이페이지에서 주문번호별 결제 취소와 환불 내역을 확인하는 화면입니다.
export default async function OrderRefundPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const { orderNumber } = await params

  return (
    <section className="mx-auto w-[92%] max-w-xl py-16 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight">결제 취소·환불</h1>
      <p className="mt-3 text-sm text-neutral-600">
        주문의 전액 취소 조건과 환불 내역을 확인할 수 있어요.
      </p>
      <OrderRefundPanel key={orderNumber} orderNumber={orderNumber} />
    </section>
  )
}
