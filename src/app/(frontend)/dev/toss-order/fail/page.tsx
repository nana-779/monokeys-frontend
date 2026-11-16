import { notFound } from 'next/navigation'
import PaymentResultView from '@/features/payments/payment-result-view'

export const dynamic = 'force-dynamic'
export default function PaymentFailurePage() {
  if (process.env.NODE_ENV !== 'development' || process.env.TOSS_PAYMENTS_DEV_ORDERS_ENABLED !== 'true') notFound()
  return <PaymentResultView outcome="fail" />
}
