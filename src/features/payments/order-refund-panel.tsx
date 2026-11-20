'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import { readOrderRefundHistory, readOrderRefundPreview, type OrderRefundHistory, type OrderRefundPreview } from './order-refund-api'
import { OrderRefundHistoryPanel } from './order-refund-history-panel'

const REASON_MAX_LENGTH = 140
const paymentLabels = { READY: '결제 대기', PAID: '결제 완료', FAILED: '결제 실패', CANCELLED: '취소 완료' }
const previewLabels = {
  PRECHECK_PASSED: '사전 조건 충족',
  BLOCKED: '사전 조건 미충족',
  POLICY_REVIEW_REQUIRED: '정책 확인 필요',
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string; loginRequired: boolean }
  | { status: 'ready'; preview: OrderRefundPreview }

type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; history: OrderRefundHistory }

// 결제 조회 결과와 화면 안의 취소 대상 확인만 관리합니다. 입력한 사유는 서버에 보내지 않습니다.
export function OrderRefundPanel({ orderNumber }: { orderNumber: string }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    // 화면을 떠나거나 다시 조회하면 이전 요청을 중단해 늦게 도착한 결과를 반영하지 않습니다.
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
    void readOrderRefundPreview(orderNumber, signal)
      .then((preview) => {
        if (!controller.signal.aborted) setState({ status: 'ready', preview })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = error instanceof ApiRequestError ? error.status : undefined
        // 404는 서버와 같은 안내를 사용해 타인 주문의 존재를 공개하지 않습니다.
        const message = status === 401
          ? '로그인 후 본인 주문을 확인해 주세요.'
          : status === 404
            ? '주문을 찾을 수 없습니다.'
            : '결제 정보를 불러오지 못했습니다. 다시 조회해 주세요.'
        setState({ status: 'error', message, loginRequired: status === 401 })
      })
    // 내역 조회에 실패해도 이미 읽은 사전 확인 정보를 유지하고, 다시 조회에서 두 요청을 갱신합니다.
    void readOrderRefundHistory(orderNumber, signal)
      .then((history) => {
        if (!controller.signal.aborted) setHistoryState({ status: 'ready', history })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = error instanceof ApiRequestError ? error.status : undefined
        const message = status === 401
          ? '로그인 후 환불 내역을 확인해 주세요.'
          : status === 404
            ? '주문을 찾을 수 없습니다.'
            : '환불 내역을 불러오지 못했습니다. 다시 조회해 주세요.'
        setHistoryState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [orderNumber, attempt])

  function refresh() {
    if (state.status === 'loading' || historyState.status === 'loading') return
    setConfirmed(false)
    setState({ status: 'loading' })
    setHistoryState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  const preview = state.status === 'ready' ? state.preview : null
  const history = historyState.status === 'ready' ? historyState.history : null
  const fullyCanceled = history?.status === 'FULL' || preview?.paymentStatus === 'CANCELLED'
  // ZIP 화면의 사유 입력 기준을 미리보기에 사용합니다. 실제 요청 단계에서는 서버가 다시 검증해야 합니다.
  const reasonInvalid = /[\u0000-\u001f\u007f-\u009f]/u.test(reason)

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7">
      {state.status === 'loading' && <p role="status">주문과 결제 정보를 확인하고 있어요.</p>}
      {state.status === 'error' && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-700">{state.message}</p>
          {state.loginRequired && <Link href="/?login=1" className="block text-sm underline">로그인</Link>}
        </div>
      )}

      {preview && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-neutral-600">주문번호</dt>
            <dd className="break-all text-right font-medium">{preview.orderNumber}</dd>
            <dt className="text-neutral-600">결제금액</dt>
            <dd className="text-right">{preview.paymentAmount === null ? '—' : formatPrice(preview.paymentAmount)}</dd>
            <dt className="text-neutral-600">결제상태</dt>
            <dd className="text-right">{preview.paymentStatus === null ? '결제 정보 없음' : paymentLabels[preview.paymentStatus]}</dd>
            {!history && (
              <>
                <dt className="text-neutral-600">로컬 기록 기준 잔액</dt>
                <dd className="text-right">
                  {preview.localRemainingAmount === null ? '—' : formatPrice(preview.localRemainingAmount)}
                </dd>
              </>
            )}
          </dl>
          <div role="status" className="rounded-lg bg-neutral-100 p-4 text-sm">
            <p className="font-semibold">{previewLabels[preview.status]}</p>
            <p className="mt-1 text-neutral-700">{preview.message}</p>
          </div>
          {preview.status === 'PRECHECK_PASSED' && !fullyCanceled && (
            <div className="space-y-3">
              <label htmlFor="refund-reason" className="block text-sm font-semibold">취소 사유</label>
              <input
                id="refund-reason"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                maxLength={REASON_MAX_LENGTH}
                placeholder="취소 사유를 입력해 주세요"
                value={reason}
                aria-invalid={reasonInvalid}
                onChange={(event) => {
                  setReason(event.target.value)
                  setConfirmed(false)
                }}
              />
              {reasonInvalid && <p role="alert" className="text-sm text-red-700">제어 문자를 빼고 입력해 주세요.</p>}
              <button
                type="button"
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!reason.trim() || reasonInvalid || confirmed}
                onClick={() => setConfirmed(true)}
              >
                취소 대상 확인
              </button>
              {confirmed && preview.paymentAmount !== null && (
                <p role="status" className="text-sm">
                  {preview.orderNumber} 주문의 {formatPrice(preview.paymentAmount)} 전액 취소 대상을 확인했어요.
                </p>
              )}
            </div>
          )}
          {/* 실제 취소가 준비되기 전까지 이 버튼은 요청을 전송하지 않습니다. */}
          <button type="button" disabled className="rounded-lg border px-4 py-2 text-sm text-neutral-500">
            {fullyCanceled ? '전액 취소된 결제' : '결제 취소 (준비 중)'}
          </button>
        </>
      )}

      {history && <OrderRefundHistoryPanel history={history} />}
      {historyState.status === 'loading' && <p role="status">환불 내역을 확인하고 있어요.</p>}
      {historyState.status === 'error' && <p role="alert" className="text-sm text-red-700">{historyState.message}</p>}
      <button type="button" className="text-sm underline disabled:opacity-50"
        disabled={state.status === 'loading' || historyState.status === 'loading'} onClick={refresh}>
        다시 조회
      </button>
    </div>
  )
}
