'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import { readMyOrders, type MyOrder } from './my-orders-api'

const orderLabels: Record<MyOrder['orderStatus'], string> = {
  PENDING: '주문 대기',
  ORDERED: '주문 완료',
  CANCELLED: '주문 취소',
  CONFIRMED: '구매 확정',
}

const paymentLabels: Record<NonNullable<MyOrder['paymentStatus']>, string> = {
  READY: '결제 대기',
  PAID: '결제 완료',
  FAILED: '결제 실패',
  CANCELLED: '결제 취소',
}

type OrderListState =
  | { status: 'loading' }
  | { status: 'error'; loginRequired: boolean }
  | { status: 'ready'; orders: MyOrder[] }

export function MyOrderList() {
  const [state, setState] = useState<OrderListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // 화면을 떠나거나 계정이 바뀌면 요청을 중단해 늦게 도착한 응답을 무시합니다.
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    void readMyOrders(signal)
      .then((orders) => {
        if (!controller.signal.aborted) setState({ status: 'ready', orders })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', loginRequired: error instanceof ApiRequestError && error.status === 401 })
      })
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return (
    <section aria-labelledby="my-orders-heading" className="space-y-3 border-b border-zinc-200 pb-5">
      <h2 id="my-orders-heading" className="text-lg font-semibold">내 주문</h2>
      {state.status === 'loading' && <p role="status" className="text-sm">주문 목록을 불러오는 중입니다.</p>}
      {state.status === 'error' && (
        <div className="space-y-2 text-sm">
          <p role="alert" className="text-red-700">
            {state.loginRequired ? '다시 로그인해 주세요.' : '주문 목록을 불러오지 못했습니다.'}
          </p>
          {state.loginRequired ? (
            <Link href="/?login=1" className="underline">스토어에서 로그인</Link>
          ) : (
            <button type="button" onClick={retry} className="underline">다시 조회</button>
          )}
        </div>
      )}
      {state.status === 'ready' && (
        state.orders.length === 0 ? (
          <p role="status" className="text-sm text-zinc-600">아직 주문 내역이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {state.orders.map((order) => (
              <li key={order.orderNumber} className="space-y-3 rounded-lg border border-zinc-200 p-4">
                <h3 className="break-all text-sm font-semibold">{order.orderNumber}</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-zinc-600">주문일</dt>
                  {/* 서버에 저장된 주문 날짜를 그대로 표시해 브라우저 시간대로 날짜가 바뀌지 않게 합니다. */}
                  <dd><time dateTime={order.orderedAt}>{order.orderedAt.slice(0, 10)}</time></dd>
                  <dt className="text-zinc-600">결제 금액</dt>
                  <dd>{order.paymentAmount === null ? '결제 정보 없음' : formatPrice(order.paymentAmount)}</dd>
                  <dt className="text-zinc-600">주문 상태</dt>
                  <dd>{orderLabels[order.orderStatus]}</dd>
                  <dt className="text-zinc-600">결제 상태</dt>
                  <dd>{order.paymentStatus === null ? '결제 정보 없음' : paymentLabels[order.paymentStatus]}</dd>
                </dl>
                {/* 결제 또는 취소 기록이 있는 주문은 기존 사전 확인 화면에서 볼 수 있습니다. */}
                {(order.paymentStatus === 'PAID' || order.paymentStatus === 'CANCELLED') && (
                  <Link
                    href={`/checkout/refund/${encodeURIComponent(order.orderNumber)}`}
                    prefetch={false}
                    className="inline-block text-sm font-semibold underline underline-offset-4"
                  >
                    환불 사전 확인
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )
}
