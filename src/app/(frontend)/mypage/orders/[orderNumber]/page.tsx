'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { confirmMyDelivery, readMyOrder, type MyOrderDetail } from '@/features/orders/my-orders-api'
import { OrderItems, OrderStatus } from '@/features/orders/order-summary'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'

type Detail = { status: 'loading' | 'login' | 'missing' | 'error' } | { status: 'ready'; order: MyOrderDetail }

export default function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const session = useWithdrawalSession()

  return (
    <section className="mx-auto w-[92%] max-w-5xl py-10 sm:py-14">
      <p className="mb-2 text-xs text-neutral-500">마이페이지 / 주문 내역 / 주문 상세</p>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">주문 상세</h1>
      {session ? (
        <OrderDetail key={JSON.stringify([session.user.id, session.sessionVersion, orderNumber])} orderNumber={orderNumber} />
      ) : <LoginLink />}
      <Link href="/mypage/orders" className="mt-6 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm">
        주문 내역으로 돌아가기
      </Link>
    </section>
  )
}

function LoginLink() {
  return <Link href="/?login=1" className="text-sm underline">로그인 후 주문 확인하기</Link>
}

// 상세 URL로 직접 들어와도 본인 주문 API에서 데이터를 다시 확인합니다.
function OrderDetail({ orderNumber }: { orderNumber: string }) {
  const [detail, setDetail] = useState<Detail>({ status: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    void readMyOrder(orderNumber, signal)
      .then((order) => {
        if (!controller.signal.aborted) setDetail({ status: 'ready', order })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = error instanceof ApiRequestError ? error.status : undefined
        setDetail({ status: status === 401 ? 'login' : status === 404 ? 'missing' : 'error' })
      })
    return () => controller.abort()
  }, [orderNumber, attempt])

  async function confirmReceipt(order: MyOrderDetail) {
    setConfirming(true)
    setReceiptError('')
    try {
      await confirmMyDelivery(orderNumber)
      setDetail({ status: 'ready', order: { ...order, deliveryStatus: 'DELIVERED', receiptConfirmed: true } })
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : '수령 확인을 저장하지 못했습니다.')
      setAttempt(value => value + 1)
    } finally {
      setConfirming(false)
    }
  }

  switch (detail.status) {
    case 'loading': return <p role="status" className="text-sm">주문 정보를 불러오는 중입니다.</p>
    case 'login': return <LoginLink />
    case 'missing': return <p role="alert" className="text-sm">주문을 찾을 수 없습니다.</p>
    case 'error': return (
      <div className="space-y-2 text-sm">
        <p role="alert">주문 정보를 불러오지 못했습니다.</p>
        <button type="button" className="underline" onClick={() => {
          setDetail({ status: 'loading' })
          setAttempt((value) => value + 1)
        }}>다시 조회</button>
      </div>
    )
    case 'ready': {
      const { order } = detail
      return (
        <div className="space-y-5 rounded-md border border-neutral-200 p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt>주문번호</dt><dd className="break-all font-semibold">{order.orderNumber}</dd>
            <dt>주문일</dt><dd><time dateTime={order.orderedAt}>{order.orderedAt.slice(0, 10)}</time></dd>
            <dt>결제 금액</dt><dd>{order.paymentAmount === null ? '결제 정보 없음' : formatPrice(order.paymentAmount)}</dd>
            <dt>주문자</dt><dd>{order.ordererName || '—'}</dd>
            <dt>연락처</dt><dd>{order.ordererPhone || '—'}</dd>
            <dt>배송지</dt><dd className="min-w-0 break-words">
              {[order.postalCode && `(${order.postalCode})`, order.roadAddress, order.detailAddress].filter(Boolean).join(' ') || '—'}
            </dd>
            <dt>배송 상태</dt><dd><OrderStatus order={order} /></dd>
            {order.trackingCompany && <><dt>택배사</dt><dd>{order.trackingCompany}</dd></>}
            {order.trackingNumber && <><dt>운송장 번호</dt><dd className="break-all tabular-nums">{order.trackingNumber}</dd></>}
          </dl>
          {!order.receiptConfirmed && ['SHIPPING','DELIVERED'].includes(order.deliveryStatus ?? '') && ['ORDERED', 'CONFIRMED'].includes(order.orderStatus) && (
            <div className="space-y-2"><p className="text-sm">상품을 받으셨다면 수령 확인 후 반품/환불을 신청할 수 있습니다.</p>
            <button className="rounded-md border px-4 py-2 text-sm" disabled={confirming} onClick={() => confirmReceipt(order)}>수령 확인</button></div>
          )}
          {order.receiptConfirmed && order.deliveryStatus === 'DELIVERED' && <Link className="underline" href={`/checkout/refund/${encodeURIComponent(orderNumber)}`}>반품/환불 신청</Link>}
          {receiptError && <p role="alert" className="text-sm">{receiptError}</p>}
          <div className="space-y-3 border-t border-neutral-200 pt-4">
            <h2 className="text-sm font-semibold">주문 상품</h2>
            <OrderItems items={order.items} />
          </div>
        </div>
      )
    }
  }
}
