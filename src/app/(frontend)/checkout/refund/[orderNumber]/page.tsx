import { OrderRefundPanel } from '@/features/payments/order-refund-panel'

// 기존 결제 완료 화면과 마이페이지에서 분리된 환불 사전 확인 경로입니다.
export default async function OrderRefundPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const { orderNumber } = await params

  return (
    <section className="mx-auto w-[92%] max-w-xl py-16 sm:py-20">
      <h1 className="text-3xl font-bold tracking-tight">결제 취소·환불 사전 확인</h1>
      <p className="mt-3 text-sm text-neutral-600">
        주문의 취소 조건을 확인할 수 있어요. 실제 취소 기능은 준비 중입니다.
      </p>
      <OrderRefundPanel key={orderNumber} orderNumber={orderNumber} />
    </section>
  )
}
