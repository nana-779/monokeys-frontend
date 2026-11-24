'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import { readOrderRefundHistory, readOrderRefundPreview } from '@/features/payments/order-refund-api'
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

type RefundAction = 'cancel' | 'history' | 'pending' | 'unavailable' | 'error'

// 사전 확인과 환불 이력을 대조해 전액 취소, 결과 재확인 또는 내역 조회로 연결합니다.
async function readRefundAction(orderNumber: string, signal: AbortSignal): Promise<RefundAction> {
  try {
    const preview = await readOrderRefundPreview(orderNumber, signal)
    if (preview.paymentStatus === 'CANCELLED') return 'history'
    const history = await readOrderRefundHistory(orderNumber, signal)
    if (history.entries.some((entry) => entry.status === 'REQUESTED')) return 'pending'
    if (preview.cancellationEnabled && preview.status === 'PRECHECK_PASSED' && history.status === 'NONE'
      && preview.localRemainingAmount !== null && preview.localRemainingAmount > 0
      && preview.localRemainingAmount === preview.paymentAmount && preview.localRemainingAmount === history.remainingAmount) {
      return 'cancel'
    }
    return history.entries.length > 0 ? 'history' : 'unavailable'
  } catch {
    return 'error'
  }
}

export function MyOrderList() {
  const [state, setState] = useState<OrderListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refundActions, setRefundActions] = useState<Record<string, RefundAction>>({})
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

  useEffect(() => {
    if (state.status !== 'ready') return
    const controller = new AbortController()
    // 상품은 주문 목록 응답에 포함되므로 화면에 표시되는 결제 완료 주문의 취소 여부만 따로 확인합니다.
    const candidates = state.orders.filter((order) => order.orderedAt.slice(0, 10) >= cutoff
      && order.orderStatus === 'ORDERED' && order.paymentStatus === 'PAID')
    async function loadRefundActions() {
      for (let index = 0; index < candidates.length && !controller.signal.aborted; index += 4) {
        const actions = await Promise.all(candidates.slice(index, index + 4).map(async ({ orderNumber }) => [
          orderNumber,
          await readRefundAction(orderNumber, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])),
        ] as const))
        if (!controller.signal.aborted) setRefundActions((current) => ({ ...current, ...Object.fromEntries(actions) }))
      }
    }
    void loadRefundActions()
    return () => controller.abort()
  }, [state, cutoff])

  function retry() {
    setState({ status: 'loading' })
    setRefundActions({})
    setAttempt((value) => value + 1)
  }

  return (
    <section aria-label="내 주문 목록" className="space-y-3">
      <div role="group" aria-label="주문 조회 기간" className="mb-5 flex flex-wrap gap-2">
        {periods.map((period) => (
          <button key={period.months} type="button" aria-pressed={months === period.months}
            onClick={() => {
              if (months === period.months) return
              setRefundActions({})
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
              const action = order.orderStatus === 'CANCELLED' || order.paymentStatus === 'CANCELLED'
                ? 'history'
                : refundActions[order.orderNumber]
              return (
                <li key={order.orderNumber} className="space-y-3 px-2 py-4">
                  <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <time className="font-semibold" dateTime={order.orderedAt}>{order.orderedAt.slice(0, 10).replaceAll('-', '.')}</time>
                    <span className="break-all border-l border-neutral-300 pl-3">{order.orderNumber}</span>
                  </h2>
                  <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-8">
                    <div>
                      <OrderItems items={order.items} />
                      {order.paymentAmount !== null && (
                        <p className="mt-2 text-xs text-neutral-600">결제 금액 {formatPrice(order.paymentAmount)}</p>
                      )}
                    </div>
                    <OrderStatus order={order} />
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Link href={`/mypage/orders/${encodeURIComponent(order.orderNumber)}`} prefetch={false}
                        className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold">
                        주문 상세
                      </Link>
                      {(action === 'cancel' || action === 'history' || action === 'pending') && (
                        <Link
                          href={`/checkout/refund/${encodeURIComponent(order.orderNumber)}${action === 'history' ? '?view=history' : ''}`}
                          prefetch={false}
                          className="inline-flex rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold"
                        >
                          {action === 'cancel' ? '주문 취소' : action === 'pending' ? '취소 결과 다시 확인' : '환불 내역'}
                        </Link>
                      )}
                      {action === 'error' && (
                        <button type="button" onClick={retry} className="text-sm underline">취소 가능 여부 다시 확인</button>
                      )}
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
