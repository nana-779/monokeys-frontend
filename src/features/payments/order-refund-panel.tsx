'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import {
  readOrderRefundHistory,
  readOrderRefundPreview,
  reconcileCancellation,
  requestFullCancellation,
  type OrderRefundHistory,
  type OrderRefundPreview,
} from './order-refund-api'
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

type CancellationState =
  | { status: 'idle' }
  | { status: 'sending'; action: 'cancel' | 'reconcile' }
  | { status: 'pending'; refundId?: number; lastKnownId: number; message: string }
  | { status: 'confirmed'; amount: number; full: boolean }
  | { status: 'error'; message: string }

export function OrderRefundPanel({ orderNumber }: { orderNumber: string }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [cancellation, setCancellation] = useState<CancellationState>({ status: 'idle' })
  const requestInFlight = useRef(false)

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

  function reloadRefundDetails() {
    setConfirmed(false)
    setState({ status: 'loading' })
    setHistoryState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  const preview = state.status === 'ready' ? state.preview : null
  const history = historyState.status === 'ready' ? historyState.history : null
  const fullyCanceled = history?.status === 'FULL' || preview?.paymentStatus === 'CANCELLED'
    || (cancellation.status === 'confirmed' && cancellation.full)
  const pendingEntry = history?.entries.some((entry) => entry.status === 'REQUESTED') ?? false
  const pendingWasRejected = cancellation.status === 'pending' && history?.entries.some((entry) =>
    entry.status === 'REJECTED' && (cancellation.refundId === undefined
      ? entry.id > cancellation.lastKnownId
      : entry.id === cancellation.refundId),
  )
  const pending = !fullyCanceled && (pendingEntry || (cancellation.status === 'pending' && !pendingWasRejected))
  const sending = cancellation.status === 'sending'
  const loading = state.status === 'loading' || historyState.status === 'loading'
  const reasonInvalid = /[\u0000-\u001f\u007f-\u009f]/u.test(reason)
  const remainingAmount = preview?.localRemainingAmount ?? null
  // 새 조회에서 결제 상태와 내역이 모두 일치할 때만 최초 결제 금액 전체를 취소할 수 있습니다.
  const canConfirm = preview?.cancellationEnabled === true && preview.status === 'PRECHECK_PASSED'
    && preview.paymentStatus === 'PAID' && !fullyCanceled && !pending && !sending
    && history?.status === 'NONE' && remainingAmount !== null && remainingAmount > 0
    && remainingAmount === preview.paymentAmount && remainingAmount === history.remainingAmount
  const canReconcile = preview?.cancellationEnabled === true && pendingEntry && !fullyCanceled && !sending

  async function submitCancellation(action: 'cancel' | 'reconcile') {
    if (requestInFlight.current) return
    if (action === 'cancel' && (!canConfirm || !confirmed || !reason.trim() || reasonInvalid)) return
    if (action === 'reconcile' && !canReconcile) return

    // 버튼이 다시 그려지기 전 연달아 눌러도 요청을 한 번만 보냅니다.
    requestInFlight.current = true
    const lastKnownId = history?.entries.reduce((highest, entry) => Math.max(highest, entry.id), 0) ?? 0
    setCancellation({ status: 'sending', action })
    try {
      let result
      if (action === 'cancel') {
        if (remainingAmount === null) return
        result = await requestFullCancellation(orderNumber, reason.trim(), remainingAmount)
      } else {
        result = await reconcileCancellation(orderNumber)
      }
      setCancellation(result.status === 'CANCELLATION_CONFIRMED'
        ? { status: 'confirmed', amount: result.amount, full: result.amount === preview?.paymentAmount }
        : { status: 'pending', refundId: result.refundId, lastKnownId, message: '취소 결과를 확인 중입니다.' })
    } catch (error) {
      if (error instanceof ApiRequestError && error.status < 500) {
        setCancellation({ status: 'error', message: error.message })
      } else {
        // 응답이 끊겼거나 서버 결과가 불분명하면 취소를 재전송하지 않고 내역부터 확인합니다.
        const message = error instanceof ApiRequestError
          ? error.message
          : '취소 응답을 받지 못했습니다. 환불 내역을 다시 확인해 주세요.'
        setCancellation({ status: 'pending', lastKnownId, message })
      }
    } finally {
      reloadRefundDetails()
      requestInFlight.current = false
    }
  }

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
          {!preview.cancellationEnabled && preview.status === 'PRECHECK_PASSED' && !fullyCanceled && (
            <p className="text-sm text-neutral-600">전액 취소는 활성화된 테스트 환경에서만 요청할 수 있어요.</p>
          )}
          {preview.status === 'PRECHECK_PASSED' && preview.cancellationEnabled && !fullyCanceled && !pending && (
            <div className="space-y-3">
              <label htmlFor="refund-reason" className="block text-sm font-semibold">취소 사유</label>
              <input
                id="refund-reason"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                maxLength={REASON_MAX_LENGTH}
                disabled={!canConfirm}
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
                disabled={!canConfirm || !reason.trim() || reasonInvalid || confirmed}
                onClick={() => setConfirmed(true)}
              >
                취소 대상 확인
              </button>
              {confirmed && remainingAmount !== null && (
                <p role="status" className="text-sm">
                  {preview.orderNumber} 주문의 {formatPrice(remainingAmount)} 전액을 취소합니다.
                </p>
              )}
            </div>
          )}
          <button type="button" disabled={!canConfirm || !confirmed || !reason.trim() || reasonInvalid}
            onClick={() => void submitCancellation('cancel')}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {fullyCanceled ? '전액 취소된 결제' : '전액 취소 요청'}
          </button>
        </>
      )}

      {cancellation.status === 'sending' && (
        <p role="status" className="text-sm">
          {cancellation.action === 'cancel' ? '전액 취소를 요청하고 있어요.' : '취소 결과를 다시 확인하고 있어요.'}
        </p>
      )}
      {cancellation.status === 'confirmed' && (
        <div className="space-y-2 text-sm">
          <p role="status">
            {formatPrice(cancellation.amount)} {cancellation.full ? '전액 취소' : '취소'}가 확인됐습니다.
            카드·계좌에 반영되기까지 시간이 걸릴 수 있어요.
          </p>
          <Link href="/mypage" className="inline-block underline underline-offset-4">
            마이페이지 주문 내역으로
          </Link>
        </div>
      )}
      {pending && (
        <p role="status" className="text-sm text-amber-800">
          {cancellation.status === 'pending' ? cancellation.message : '처리 중인 취소 요청이 있습니다.'}
        </p>
      )}
      {pendingEntry && !fullyCanceled && (
        <button type="button" disabled={!canReconcile} onClick={() => void submitCancellation('reconcile')}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          취소 결과 다시 확인
        </button>
      )}
      {!fullyCanceled && cancellation.status === 'error' && (
        <p role="alert" className="text-sm text-red-700">{cancellation.message}</p>
      )}
      {!fullyCanceled && pendingWasRejected && (
        <p role="alert" className="text-sm text-red-700">환불 내역에서 취소 실패를 확인했습니다.</p>
      )}
      {history && <OrderRefundHistoryPanel history={history} />}
      {historyState.status === 'loading' && <p role="status">환불 내역을 확인하고 있어요.</p>}
      {historyState.status === 'error' && <p role="alert" className="text-sm text-red-700">{historyState.message}</p>}
      <button type="button" className="text-sm underline disabled:opacity-50"
        disabled={loading || sending} onClick={reloadRefundDetails}>
        다시 조회
      </button>
    </div>
  )
}
