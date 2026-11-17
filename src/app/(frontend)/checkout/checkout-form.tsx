'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useCart } from '@/features/cart/cart-provider'
import { getCurrentUser } from '@/features/auth/api'
import { formatPrice } from '@/lib/store-shared'
import { submitOrderApi } from './api'
import { useTossWidgets } from '@/features/payments/use-toss-widgets'
import { renderPaymentWidgets } from '@/features/payments/order-widget-rendering'
import { paymentErrorMessage } from '@/features/payments/payment-request'

export function CheckoutForm() {
  const { selectedItems } = useCart()
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [widgetReady, setWidgetReady] = useState(false)

  const tossWidgetsState = useTossWidgets()
  const { widgets } = tossWidgetsState

  useEffect(() => {
    getCurrentUser().then(({ user }) => {
      if (user?.email) setUserEmail(user.email)
    })
  }, [])

  const subtotal = selectedItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  const shipping = selectedItems.reduce((total, item) => total + item.shippingFee, 0)
  const totalAmount = subtotal + shipping

  useEffect(() => {
    if (!widgets || totalAmount <= 0) return
    let active = true

    // 위젯에 결제 금액 설정
    void widgets.setAmount({ currency: 'KRW', value: totalAmount })

    const rendering = renderPaymentWidgets(widgets, {
      payment: '#toss-payment-method',
      agreement: '#toss-agreement',
    })

    rendering.ready.then(
      () => {
        if (active) setWidgetReady(true)
      },
      () => {
        if (active) setWidgetReady(false)
      },
    )

    return () => {
      active = false
      void rendering.dispose().catch(() => {})
    }
  }, [widgets, totalAmount])

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedItems.length || isSubmitting) return

    setIsSubmitting(true)
    setMessage('')

    const form = event.currentTarget
    const formData = new FormData(form)

    const recipientName = String(formData.get('recipientName') || '').trim()
    const rawPhone = String(formData.get('phone') || '').trim()
    const email = String(formData.get('email') || userEmail || '').trim()

    const cleanPhone = rawPhone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 10) {
      setMessage('올바른 전화번호를 입력해 주세요. (10~11자리 숫자)')
      setIsSubmitting(false)
      return
    }

    if (!email) {
      setMessage('주문자 이메일을 입력해 주세요.')
      setIsSubmitting(false)
      return
    }

    try {
      const items = selectedItems.map((item) => ({
        productId: Number(item.productId),
        quantity: item.quantity,
      }))

      // 1. 백엔드에 PENDING(결제 대기) 상태로 주문서 생성
      const result = await submitOrderApi({
        ordererEmail: email,
        ordererName: recipientName,
        ordererPhone: cleanPhone,
        items,
      })

      if (!widgets || !widgetReady) {
        setMessage('결제 위젯이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.')
        setIsSubmitting(false)
        return
      }

      // 2. 토스페이먼츠 결제 요청 (결제 완료 시 successUrl, 실패/취소 시 failUrl로 이동)
      const firstItemName = selectedItems[0]?.name || '주문 상품'
      const orderName =
        selectedItems.length > 1
          ? `${firstItemName} 외 ${selectedItems.length - 1}건`
          : firstItemName

      await widgets.requestPayment({
        orderId: result.orderNumber,
        orderName,
        customerEmail: email,
        customerName: recipientName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
      })
    } catch (err) {
      setMessage(paymentErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={submitOrder} className="grid grid-cols-[1fr_.75fr] gap-16 max-lg:grid-cols-1">
      <div>
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-zinc-500">CHECKOUT</p>
        <h1 className="mb-12 text-5xl font-medium tracking-[-0.06em]">Where should we send it?</h1>
        <div className="space-y-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Orderer Email</span>
            <input
              className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
              defaultValue={userEmail}
              key={userEmail}
              name="email"
              placeholder="user@example.com"
              required
              type="email"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Recipient name</span>
            <input
              className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
              name="recipientName"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Phone number</span>
            <input
              className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
              inputMode="tel"
              name="phone"
              required
              placeholder="010-0000-0000"
              value={[phone.slice(0, 3), phone.slice(3, 7), phone.slice(7)].filter(Boolean).join('-')}
              onChange={(event) => setPhone(event.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Shipping address</span>
            <textarea
              className="min-h-32 w-full resize-none rounded-md border border-zinc-300 p-4 outline-none transition focus:border-black"
              name="shippingAddress"
              required
            />
          </label>
        </div>

        {/* 토스페이먼츠 결제 위젯 영역 */}
        <div className="mt-10 rounded-xl border border-zinc-200 p-6">
          <h2 className="mb-4 text-lg font-medium">결제 수단 선택</h2>
          {tossWidgetsState.status === 'error' && (
            <p className="mb-4 text-sm text-red-600">{tossWidgetsState.message}</p>
          )}
          <div id="toss-payment-method" />
          <div id="toss-agreement" />
        </div>
      </div>

      <aside className="h-fit rounded-xl bg-zinc-100 p-7 lg:sticky lg:top-28">
        <h2 className="text-xl font-medium tracking-[-0.03em]">Order summary</h2>
        <div className="my-6 divide-y divide-zinc-200 border-y border-zinc-200">
          {selectedItems.map((item, index) => (
            <div
              className="flex justify-between gap-5 py-4 text-sm"
              key={`${item.productId}-${index}`}
            >
              <div>
                <p className="font-medium">
                  {item.name} × {item.quantity}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{item.optionLabel}</p>
              </div>
              <strong>{formatPrice(item.unitPrice * item.quantity)}</strong>
            </div>
          ))}
          {!selectedItems.length && (
            <p className="py-8 text-center text-sm text-zinc-500">
              선택된 상품이 없습니다. 장바구니에서 주문할 상품을 선택해 주세요.
            </p>
          )}
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Subtotal</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Shipping</dt>
            <dd>{formatPrice(shipping)}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-300 pt-4 text-lg">
            <dt>Total</dt>
            <dd className="font-semibold">{formatPrice(totalAmount)}</dd>
          </div>
        </dl>
        {message && (
          <p className="mt-5 text-sm text-red-600" role="alert">
            {message}
          </p>
        )}
        <button
          className="mt-7 h-14 w-full rounded-md bg-black text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!selectedItems.length || isSubmitting || !widgetReady}
          type="submit"
        >
          {isSubmitting ? 'PROCESSING...' : `${formatPrice(totalAmount)} 결제하기`}
        </button>
      </aside>
    </form>
  )
}
