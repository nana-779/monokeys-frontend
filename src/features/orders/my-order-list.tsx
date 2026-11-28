'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import { RefundWorkflow } from '@/features/payments/refund-workflow'
import { readMyOrders, type MyOrder } from './my-orders-api'
import { OrderItems, OrderStatus } from './order-summary'

const periods = [{ months: 3, label: '최근 3개월' }, { months: 6, label: '최근 6개월' }, { months: 0, label: '전체' }]
const orderCalendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short' })

// 한국 날짜 기준으로 달을 빼고, 대상 월에 같은 날짜가 없으면 해당 월의 마지막 날을 사용합니다.
function firstOrderDate(months: number) {
  if (months === 0) return ''
  const [year, month, day] = orderCalendar.format().split('-').map(Number)
  const targetMonth = month - 1 - months
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10)
}

type OrderListState =
  | { status: 'loading' }
  | { status: 'error'; loginRequired: boolean }
  | { status: 'ready'; orders: MyOrder[] }

export function MyOrderList() {
  const [state, setState] = useState<OrderListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [months, setMonths] = useState(3)
  const cutoff = firstOrderDate(months)
  const visibleOrders = state.status === 'ready' ? state.orders.filter((order) => order.orderedAt.slice(0, 10) >= cutoff) : []

  useEffect(() => {
    // 화면을 떠나거나 계정이 바뀌면 요청을 중단해 늦게 도착한 응답을 무시합니다.
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    void readMyOrders(signal)
      .then((orders) => {
        if (controller.signal.aborted) return
        setState({ status: 'ready', orders })
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
    <section aria-label="내 주문 목록" className="space-y-3">
      <div role="group" aria-label="주문 조회 기간" className="mb-5 flex flex-wrap gap-2">
        {periods.map((period) => (
          <button key={period.months} type="button" aria-pressed={months === period.months}
            onClick={() => {
              if (months === period.months) return
              setMonths(period.months)
            }}
            className="min-w-20 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold aria-pressed:border-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white">
            {period.label}
          </button>
        ))}
      </div>
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
        visibleOrders.length === 0 ? (
          <p role="status" className="border-y border-neutral-200 py-6 text-sm text-zinc-600">선택한 기간에 주문 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-300 border-y border-neutral-300">
            {visibleOrders.map((order) => {
              return (
                <li key={order.orderNumber} className="space-y-3 px-2 py-4">
                  <h2 className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-3 text-sm">
                    <time className="border-r border-neutral-300 text-xs font-semibold tabular-nums" dateTime={order.orderedAt}>{order.orderedAt.slice(0, 10).replaceAll('-', '.')}</time>
                    <span className="break-all">{order.orderNumber}</span>
                  </h2>
                  <div className="grid grid-cols-2 items-center gap-x-3 gap-y-3 sm:grid-cols-[1fr_1fr_6rem_7rem] lg:grid-cols-[minmax(0,1fr)_6rem_5rem_6rem_7rem]">
                    <div className="col-span-full min-w-0 lg:col-span-1">
                      <OrderItems items={order.items} alignedWithOrderNumber />
                    </div>
                    <div className="text-center text-xs text-neutral-600">
                      <p>총 결제금액</p>
                      <p className="font-semibold tabular-nums">{order.paymentAmount === null ? '—' : formatPrice(order.paymentAmount)}</p>
                    </div>
                    <div className="text-center"><OrderStatus order={order} /></div>
                    <Link href={`/mypage/orders/${encodeURIComponent(order.orderNumber)}`} prefetch={false}
                      className="inline-flex h-9 w-24 max-w-full justify-self-center items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 px-2 text-xs font-semibold">
                      주문 상세
                    </Link>
                    <div className="grid justify-items-center gap-1 text-center text-xs">
                      {order.paymentStatus === 'PAID' || order.paymentStatus === 'CANCELLED'
                        ? <RefundWorkflow orderNumber={order.orderNumber} shipping={order.deliveryStatus === 'SHIPPING' || order.deliveryStatus === 'DELIVERED'} compact /> : '—'}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}
    </section>
  )
}
