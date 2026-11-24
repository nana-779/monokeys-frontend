'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ProductImage } from '@/components/common/product-image'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'
import { ApiRequestError } from '@/lib/api-client'
import { formatPrice } from '@/lib/store-shared'
import {
  formatRefundMethod,
  readOrderRefundHistory,
  readOrderRefundPreview,
  reconcileCancellation,
  requestFullCancellation,
  type OrderRefundHistory,
  type OrderRefundPreview,
} from './order-refund-api'
import { OrderRefundHistoryPanel } from './order-refund-history-panel'

const REASON_MAX_LENGTH = 140
const reasons = ['단순 변심', '상품을 잘못 주문함', '배송 정보 변경', '기타']

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
  | { status: 'confirmed' }
  | { status: 'error'; message: string }

type RefundPanelProps = { orderNumber: string; historyOnly: boolean }

export function OrderRefundPanel({ orderNumber, historyOnly }: RefundPanelProps) {
  const session = useWithdrawalSession()
  if (!session) {
    return <Link href="/?login=1" className="mt-6 inline-block underline">로그인 후 주문 확인하기</Link>
  }
  return <RefundPanel key={JSON.stringify([session.user.id, session.sessionVersion])} orderNumber={orderNumber} historyOnly={historyOnly} />
}

function RefundPanel({ orderNumber, historyOnly }: RefundPanelProps) {
  const router = useRouter()
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [reason, setReason] = useState(reasons[0])
  const [detail, setDetail] = useState('')
  const [cancellation, setCancellation] = useState<CancellationState>({ status: 'idle' })
  const confirmation = useRef<HTMLDialogElement>(null)
  const returnButton = useRef<HTMLButtonElement>(null)
  const requestInFlight = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

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
    setState({ status: 'loading' })
    setHistoryState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  const preview = state.status === 'ready' ? state.preview : null
  const history = historyState.status === 'ready' ? historyState.history : null
  const fullyCanceled = history?.status === 'FULL' || preview?.paymentStatus === 'CANCELLED'
    || cancellation.status === 'confirmed'
  const pendingEntry = history?.entries.some((entry) => entry.status === 'REQUESTED') ?? false
  const pendingWasRejected = cancellation.status === 'pending' && history?.entries.some((entry) =>
    entry.status === 'REJECTED' && (cancellation.refundId === undefined
      ? entry.id > cancellation.lastKnownId
      : entry.id === cancellation.refundId),
  )
  const pending = !fullyCanceled && (pendingEntry || (cancellation.status === 'pending' && !pendingWasRejected))
  const sending = cancellation.status === 'sending'
  const confirmationBusy = sending || cancellation.status === 'confirmed'
  const loading = state.status === 'loading' || historyState.status === 'loading'
  const cleanedDetail = detail.replace(/[\r\n\t]+/g, ' ').trim()
  const cancelReason = cleanedDetail ? `${reason} - ${cleanedDetail}` : reason
  const reasonInvalid = cancelReason.length > REASON_MAX_LENGTH || /[\u0000-\u001f\u007f-\u009f]/u.test(cancelReason)
  const remainingAmount = preview?.localRemainingAmount ?? null
  // 새 조회에서 결제 상태와 내역이 모두 일치할 때만 최초 결제 금액 전체를 취소할 수 있습니다.
  const canConfirm = !historyOnly && preview?.cancellationEnabled === true && preview.status === 'PRECHECK_PASSED'
    && preview.paymentStatus === 'PAID' && !fullyCanceled && !pending && !sending
    && history?.status === 'NONE' && remainingAmount !== null && remainingAmount > 0
    && remainingAmount === preview.paymentAmount && remainingAmount === history.remainingAmount
  const canReconcile = preview?.cancellationEnabled === true && pendingEntry && !fullyCanceled && !sending

  // 첫 클릭은 모달만 열고, 기본 포커스를 돌아가기 버튼에 둡니다.
  function openConfirmation() {
    const dialog = confirmation.current
    if (!canConfirm || reasonInvalid || requestInFlight.current || !dialog || dialog.open) return
    dialog.showModal()
    returnButton.current?.focus()
  }

  function closeConfirmation() {
    if (!requestInFlight.current) confirmation.current?.close()
  }

  // 전액 취소는 열린 모달의 최종 확인에서 실행하고, 재확인은 별도 API를 사용합니다.
  async function submitCancellation(action: 'cancel' | 'reconcile') {
    if (requestInFlight.current) return
    if (action === 'cancel') {
      if (!confirmation.current?.open || !canConfirm || reasonInvalid || remainingAmount === null) return
    }
    if (action === 'reconcile' && !canReconcile) return

    // 버튼이 다시 그려지기 전 연달아 눌러도 요청을 한 번만 보냅니다.
    requestInFlight.current = true
    const lastKnownId = history?.entries.reduce((highest, entry) => Math.max(highest, entry.id), 0) ?? 0
    setCancellation({ status: 'sending', action })
    let navigating = false
    try {
      let result
      if (action === 'cancel') {
        if (remainingAmount === null) return
        result = await requestFullCancellation(orderNumber, cancelReason, remainingAmount)
      } else {
        result = await reconcileCancellation(orderNumber)
      }
      if (!mounted.current) return
      if (result.status === 'CANCELLATION_CONFIRMED') {
        navigating = true
        setCancellation({ status: 'confirmed' })
        router.replace(`/checkout/refund/${encodeURIComponent(orderNumber)}/result?refundId=${result.refundId}`)
      } else {
        setCancellation({ status: 'pending', refundId: result.refundId, lastKnownId, message: '취소 결과를 확인 중입니다.' })
      }
    } catch (error) {
      if (!mounted.current) return
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
      if (mounted.current && !navigating) {
        if (action === 'cancel') confirmation.current?.close()
        reloadRefundDetails()
        requestInFlight.current = false
      }
    }
  }

  return (
    <div className="mt-8 space-y-4 text-sm">
      {state.status === 'loading' && <p role="status">주문과 결제 정보를 확인하고 있어요.</p>}
      {state.status === 'error' && (
        <div className="space-y-3">
          <p role="alert" className="text-red-700">{state.message}</p>
          {state.loginRequired && <Link href="/?login=1" className="block underline">로그인</Link>}
        </div>
      )}

      {preview && !fullyCanceled && !historyOnly && (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="rounded-lg border border-neutral-200 p-5" aria-labelledby="refund-items">
            <h2 id="refund-items" className="border-b border-neutral-200 pb-3 font-semibold">취소할 상품</h2>
            {preview.items?.length ? (
              <ul className="divide-y divide-neutral-200">
                {preview.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-4 py-3">
                    <ProductImage src={item.thumbnailUrl} alt={item.productName} className="size-20 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 space-y-1 break-words">
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-neutral-700">{formatPrice(item.unitPrice)} · {item.quantity}개</p>
                      <p className="text-xs text-neutral-500">주문번호 {preview.orderNumber}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-3 text-neutral-600">주문번호 {preview.orderNumber}</p>}

            <fieldset disabled={!canConfirm} className="space-y-4 border-t border-neutral-200 pt-4">
              <div>
                <label htmlFor="refund-reason" className="mb-2 block font-semibold">취소 사유</label>
                <select id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2">
                  {reasons.map((option) => <option key={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="refund-detail" className="mb-2 block font-semibold">
                  상세 사유 <span className="ml-1 text-xs font-normal text-neutral-500">선택</span>
                </label>
                <textarea id="refund-detail" rows={3} value={detail} onChange={(event) => setDetail(event.target.value)}
                  aria-invalid={reasonInvalid} aria-describedby={reasonInvalid ? 'refund-reason-error' : undefined}
                  placeholder="추가로 전달할 내용이 있으면 입력해 주세요."
                  className="w-full resize-y rounded-md border border-neutral-200 px-3 py-2" />
                {reasonInvalid && (
                  <p id="refund-reason-error" role="alert" className="text-red-700">취소 사유를 합해 140자 이내로 입력해 주세요.</p>
                )}
              </div>
            </fieldset>
          </section>

          <section className="rounded-lg border border-neutral-200 p-5" aria-labelledby="refund-total">
            <h2 id="refund-total" className="border-b border-neutral-200 pb-3 font-semibold">예상 환불 금액</h2>
            <dl className="space-y-3 py-3">
              {preview.items?.length ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-600">상품 금액</dt>
                  <dd>{formatPrice(preview.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-600">결제 수단</dt>
                <dd className="text-right">{formatRefundMethod(preview)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3 font-semibold">
                <dt>총 예상 환불 금액</dt>
                <dd className="text-lg">{canConfirm && remainingAmount !== null ? formatPrice(remainingAmount) : '—'}</dd>
              </div>
            </dl>
            {preview.status !== 'PRECHECK_PASSED' && <p role="status" className="mb-3 text-neutral-600">{preview.message}</p>}
            {preview.status === 'PRECHECK_PASSED' && !preview.cancellationEnabled && (
              <p role="status" className="mb-3 text-neutral-600">전액 취소는 활성화된 테스트 환경에서 요청할 수 있어요.</p>
            )}
            <p className="mb-4 text-xs text-neutral-500">취소가 완료되면 원래 결제 수단으로 환불됩니다.</p>
            <button type="button" aria-haspopup="dialog" disabled={!canConfirm || reasonInvalid} onClick={openConfirmation}
              className="w-full rounded-md bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
              주문 취소 요청
            </button>
          </section>
        </div>
      )}

      {cancellation.status === 'sending' && (
        <p role="status" className="text-sm">
          {cancellation.action === 'cancel' ? '전액 취소를 요청하고 있어요.' : '취소 결과를 다시 확인하고 있어요.'}
        </p>
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
      {history && (historyOnly || fullyCanceled || history.entries.length > 0) && <OrderRefundHistoryPanel history={history} />}
      {historyState.status === 'loading' && <p role="status">환불 내역을 확인하고 있어요.</p>}
      {historyState.status === 'error' && <p role="alert" className="text-sm text-red-700">{historyState.message}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/mypage/orders" className="rounded-md border border-neutral-200 px-4 py-2">
          ‹ 주문 내역
        </Link>
        {(state.status === 'error' || historyState.status === 'error' || pending || cancellation.status === 'error') && (
          <button type="button" className="underline disabled:opacity-50" disabled={loading || sending} onClick={reloadRefundDetails}>
            다시 조회
          </button>
        )}
      </div>
      <dialog
        ref={confirmation}
        aria-labelledby="order-cancel-confirm-title"
        aria-describedby="order-cancel-confirm-warning"
        aria-busy={confirmationBusy}
        closedby={confirmationBusy ? 'none' : 'closerequest'}
        className="m-auto max-h-[90dvh] w-[min(92%,440px)] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-xl backdrop:bg-black/50 sm:p-7"
        onCancel={(event) => {
          event.preventDefault()
          closeConfirmation()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="order-cancel-confirm-title" className="pt-1 text-xl font-semibold tracking-tight">주문 취소 확인</h2>
          <button type="button" aria-label="닫기" disabled={confirmationBusy} onClick={closeConfirmation}
            className="grid size-9 shrink-0 place-items-center rounded-md text-2xl leading-none hover:bg-neutral-100 disabled:opacity-50">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <dl className="my-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-y border-neutral-200 py-4 text-sm">
          <dt className="text-neutral-600">주문번호</dt>
          <dd className="break-all text-right font-medium">{preview?.orderNumber}</dd>
          <dt className="text-neutral-600">예상 환불 금액</dt>
          <dd className="text-right font-semibold">{remainingAmount === null ? '—' : formatPrice(remainingAmount)}</dd>
        </dl>
        <p id="order-cancel-confirm-warning" className="text-sm text-neutral-700">주문 취소 후에는 되돌릴 수 없습니다.</p>
        <div className="mt-6 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <button ref={returnButton} type="button" disabled={confirmationBusy} onClick={closeConfirmation}
            className="rounded-md border border-neutral-300 px-3 py-3 font-semibold disabled:opacity-50">
            돌아가기
          </button>
          <button type="button" disabled={!canConfirm || reasonInvalid} onClick={() => void submitCancellation('cancel')}
            className="rounded-md bg-neutral-900 px-3 py-3 font-semibold text-white disabled:opacity-50">
            {confirmationBusy ? '취소 요청 중…' : '주문 취소하기'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
