import { StrictMode } from 'react'
import { notFound } from 'next/navigation'
import SdkInitializationCheck from '@/features/payments/sdk-initialization-check'

export const dynamic = 'force-dynamic'
export default function TossOrderDevelopmentPage() {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.TOSS_PAYMENTS_DEV_ORDERS_ENABLED !== 'true'
  )
    notFound()
  return (
    <StrictMode>
      <SdkInitializationCheck includeTestOrder />
    </StrictMode>
  )
}
