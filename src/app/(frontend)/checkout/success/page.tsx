'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { confirmPaymentApi, OrderResponseData } from '../api'
import { useCart } from '@/features/cart/cart-provider'
import { formatPrice } from '@/lib/store-shared'

function CheckoutSuccessContent() {
  const searchParams = useSearchParams()
  const { clearSelectedItems } = useCart()

  const [status, setStatus] = useState<'confirming' | 'success' | 'error'>('confirming')
  const [order, setOrder] = useState<OrderResponseData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const paymentKey = searchParams.get('paymentKey') || ''
  const orderId = searchParams.get('orderId') || ''
  const amountStr = searchParams.get('amount') || ''
  const amount = Number(amountStr)

  const hasRequested = useRef(false)

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setStatus('error')
      setErrorMessage('결제 승인에 필요한 필수 파라미터가 누락되었습니다.')
      return
    }

    if (hasRequested.current) return
    hasRequested.current = true

    async function confirm() {
      try {
        const confirmedOrder = await confirmPaymentApi({
          paymentKey,
          orderId,
          amount,
        })

        clearSelectedItems()
        setOrder(confirmedOrder)
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setErrorMessage(
          err instanceof Error ? err.message : '결제 승인 처리 중 오류가 발생했습니다.',
        )
      }
    }

    void confirm()
  }, [paymentKey, orderId, amount, clearSelectedItems])

  if (status === 'confirming') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 animate-spin items-center justify-center rounded-full border-4 border-zinc-200 border-t-zinc-900" />
        <h1 className="mb-2 text-2xl font-semibold">결제 승인 중입니다</h1>
        <p className="text-sm text-zinc-500">토스페이먼츠와 결제 결과를 확인하고 있습니다. 잠시만 기다려 주세요.</p>
      </div>
    )
  }

  if (status === 'error' || !order) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-red-600">PAYMENT FAILED</p>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">결제 승인에 실패했습니다</h1>
        <p className="mb-8 text-sm font-medium text-zinc-600">{errorMessage}</p>
        <div className="flex justify-center gap-4">
          <Link
            href="/checkout"
            className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            주문서로 돌아가기
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

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-white">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-zinc-500">ORDER CONFIRMATION</p>
      <h1 className="mb-4 text-4xl font-medium tracking-[-0.04em]">Thank you for your order!</h1>
      <p className="mb-8 text-sm text-zinc-600">
        결제 및 주문이 정상적으로 완료되었습니다. (주문번호: <strong>{order.orderNumber}</strong>)
      </p>

      <div className="mb-8 divide-y divide-zinc-200 rounded-xl bg-zinc-50 p-6 text-left text-sm">
        <div className="flex justify-between py-2">
          <span className="text-zinc-500">주문 상태</span>
          <span className="font-semibold text-emerald-600">{order.orderStatus}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-zinc-500">주문자 이메일</span>
          <span className="font-medium">{order.ordererEmail}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-zinc-500">받는 분</span>
          <span className="font-medium">{order.ordererName}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-zinc-500">총 결제 금액</span>
          <span className="font-semibold text-zinc-900">{formatPrice(order.finalPayAmount)}</span>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Link
          href="/"
          className="rounded-md bg-zinc-900 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          쇼핑 계속하기
        </Link>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <section className="mx-auto w-[min(80%,1200px)] py-20 max-lg:w-[92%]">
      <Suspense
        fallback={
          <div className="py-20 text-center text-sm text-zinc-500">
            결제 정보를 불러오는 중입니다...
          </div>
        }
      >
        <CheckoutSuccessContent />
      </Suspense>
    </section>
  )
}
