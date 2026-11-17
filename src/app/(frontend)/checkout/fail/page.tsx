'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { failPaymentApi } from '../api'

function CheckoutFailContent() {
  const searchParams = useSearchParams()

  const code = searchParams.get('code') || 'PAYMENT_FAILED'
  const message = searchParams.get('message') || '결제에 실패했습니다.'
  const orderId = searchParams.get('orderId') || ''

  useEffect(() => {
    if (orderId) {
      void failPaymentApi(orderId, `${code}: ${message}`)
    }
  }, [orderId, code, message])

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-12 text-center shadow-sm">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-red-600">PAYMENT FAILED</p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">결제에 실패했습니다</h1>
      <p className="mb-2 text-sm font-medium text-zinc-700">{message}</p>
      <p className="mb-8 text-xs text-zinc-400">에러 코드: {code}</p>

      <div className="flex justify-center gap-4">
        <Link
          href="/checkout"
          className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          다시 결제하기
        </Link>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}

export default function CheckoutFailPage() {
  return (
    <section className="mx-auto w-[min(80%,1200px)] py-20 max-lg:w-[92%]">
      <Suspense
        fallback={
          <div className="py-20 text-center text-sm text-zinc-500">
            결제 실패 정보를 확인하는 중입니다...
          </div>
        }
      >
        <CheckoutFailContent />
      </Suspense>
    </section>
  )
}
