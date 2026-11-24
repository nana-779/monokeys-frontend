'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import { formatRefundMethod, readOrderRefundHistory, readOrderRefundPreview } from './order-refund-api'

type Result =
  | { status: 'loading' }
  | { status: 'unavailable' | 'error' | 'login' }
  | { status: 'ready'; orderNumber: string; amount: number; method: string }

export function OrderRefundResultView({ orderNumber, refundId }: { orderNumber: string; refundId: number | null }) {
  const session = useWithdrawalSession()
  if (!session) {
    return (
      <section className="mx-auto w-[92%] max-w-xl py-16 text-center">
        <h1 className="text-3xl font-bold">환불 결과</h1>
        <Link className="mt-6 inline-block underline" href="/?login=1">로그인 후 확인하기</Link>
      </section>
    )
  }
  return <RefundResult key={JSON.stringify([session.user.id, session.sessionVersion])} orderNumber={orderNumber} refundId={refundId} />
}

// URL의 환불 ID는 조회 키입니다. 본인 주문 내역에서 전액 환불 완료를 확인한 뒤 실제 금액을 표시합니다.
function RefundResult({ orderNumber, refundId }: { orderNumber: string; refundId: number | null }) {
  const [result, setResult] = useState<Result>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (refundId === null || !Number.isSafeInteger(refundId)) return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    void Promise.all([readOrderRefundHistory(orderNumber, signal), readOrderRefundPreview(orderNumber, signal)])
      .then(([history, preview]) => {
        if (controller.signal.aborted) return
        const entry = history.entries.find((item) => item.id === refundId && item.status === 'COMPLETED' && item.effect === 'FULL')
        if (!entry || history.status !== 'FULL' || history.orderNumber !== orderNumber || preview.orderNumber !== orderNumber) {
          setResult({ status: 'unavailable' })
          return
        }
        setResult({ status: 'ready', orderNumber: history.orderNumber, amount: entry.amount, method: formatRefundMethod(preview) })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = error instanceof ApiRequestError ? error.status : undefined
        setResult({ status: status === 401 ? 'login' : status === 404 ? 'unavailable' : 'error' })
      })
    return () => controller.abort()
  }, [orderNumber, refundId, attempt])

  const status = refundId === null || !Number.isSafeInteger(refundId) ? 'unavailable' : result.status
  return (
    <section className="mx-auto w-[92%] max-w-xl py-16 text-center sm:py-28">
      {result.status === 'ready' ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">환불 처리가 완료되었습니다</h1>
          <dl className="mx-auto mt-12 max-w-md divide-y divide-neutral-200 border-y border-neutral-500 text-left text-sm sm:mt-16">
            <div className="grid grid-cols-[1fr_2fr] gap-3 px-4 py-3">
              <dt className="font-semibold">주문번호</dt>
              <dd className="break-all">{result.orderNumber}</dd>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3 px-4 py-3">
              <dt className="font-semibold">환불 수단</dt>
              <dd>{result.method}</dd>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3 px-4 py-3 font-semibold">
              <dt>환불 금액</dt>
              <dd>{formatPrice(result.amount)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">카드·계좌에 반영되기까지 시간이 걸릴 수 있습니다.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">환불 결과</h1>
          {status === 'loading' && <p className="mt-6" role="status">환불 결과를 확인하고 있어요.</p>}
          {status === 'unavailable' && <p className="mt-6" role="alert">완료된 환불을 확인할 수 없습니다.</p>}
          {status === 'login' && <Link className="mt-6 inline-block underline" href="/?login=1">로그인 후 확인하기</Link>}
          {status === 'error' && (
            <div className="mt-6 space-y-2">
              <p role="alert">환불 결과를 불러오지 못했습니다.</p>
              <button type="button" className="underline" onClick={() => {
                setResult({ status: 'loading' })
                setAttempt((value) => value + 1)
              }}>다시 조회</button>
            </div>
          )}
        </>
      )}
      <div className="mx-auto mt-12 grid max-w-md grid-cols-2 gap-3 text-sm font-semibold sm:mt-16">
        <Link href="/" className="rounded-md border border-neutral-400 px-3 py-3">홈으로 가기</Link>
        <Link href="/mypage/orders" className="rounded-md bg-neutral-900 px-3 py-3 text-white">주문 내역 보기</Link>
      </div>
    </section>
  )
}
