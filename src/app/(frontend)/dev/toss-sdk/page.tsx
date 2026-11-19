import { StrictMode } from 'react'
import { notFound } from 'next/navigation'
import SdkInitializationCheck from '@/features/payments/sdk-initialization-check'

export default function TossSdkDevelopmentPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <StrictMode>
      <SdkInitializationCheck />
    </StrictMode>
  )
}
