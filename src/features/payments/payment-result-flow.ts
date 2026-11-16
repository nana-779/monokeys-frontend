import { validateDevOrder, type DevTestOrder } from './test-order-preparation'
import { validateSuccess, ResultValidationError, type ApprovalConnector } from './payment-result'
import { ConfirmationError, readConfirmationResponse, type ConfirmationResponse } from './payment-confirmation'

export type ResultPhase = 'validating' | 'checking-order' | 'approval-unavailable' |
  'invalid-result' | 'order-unavailable' | 'order-mismatch' | 'network-error' | 'system-error' |
  'confirming' | 'confirmation-failed' | 'approved' | 'waiting-for-deposit' |
  'confirmation-pending' | 'confirmation-unknown' | 'confirmation-network-error' |
  'confirmation-conflict' | 'confirmation-unavailable'
export type ResultState = { phase: ResultPhase; message: string; orderId?: string }
export const CONFIRMATION_TIMEOUT_MS = 135_000 // Backend maximum read120s + connect5s + margin.

export function phaseMessage(phase: ResultPhase): string {
  switch (phase) {
    case 'validating': return '결과 필수값과 요청 정보를 확인하고 있습니다.'
    case 'checking-order': return '서버에 저장된 테스트 주문과 금액을 확인하고 있습니다.'
    case 'approval-unavailable': return '서버 주문과 금액이 일치합니다. 승인 연결이 없어 요청을 보내지 않았습니다. 결제 완료가 아닙니다.'
    case 'invalid-result': return '결과 필수값이 없거나 요청 정보와 일치하지 않습니다. 승인 요청을 차단했습니다.'
    case 'order-unavailable': return '테스트 주문이 없거나 만료되었습니다. 결제 완료로 처리하지 않았습니다.'
    case 'order-mismatch': return '서버 주문 정보 또는 금액이 일치하지 않습니다. 승인 요청을 차단했습니다.'
    case 'network-error': return '주문 조회 중 네트워크 오류 또는 시간 초과가 발생했습니다. 결제 완료로 처리하지 않았습니다.'
    case 'system-error': return '주문 조회를 처리하지 못했습니다. 결제 완료로 처리하지 않았습니다.'
    case 'confirming': return '서버에서 결제 승인을 처리하고 있습니다. 아직 결제 완료가 아닙니다. 다시 결제하지 말고 기다려 주세요.'
    case 'approved': return '테스트 결제 승인이 완료되었습니다.'
    case 'waiting-for-deposit': return '가상계좌가 발급되어 입금을 기다리고 있습니다. 아직 결제 완료가 아닙니다.'
    case 'confirmation-pending': return '서버에서 같은 승인 요청을 처리하고 있습니다. 새 결제를 시도하지 말고 잠시 후 같은 요청의 상태를 확인해 주세요.'
    case 'confirmation-unknown': return '승인 결과를 확정할 수 없습니다. 실패로 단정하거나 다시 결제하지 말고 같은 요청의 상태를 확인해 주세요.'
    case 'confirmation-network-error': return '승인 응답을 받지 못해 결제 상태가 불확실합니다. 새 결제를 시도하지 말고 같은 요청의 상태를 확인해 주세요.'
    case 'confirmation-conflict': return '서버에 기록된 주문금액 또는 기존 승인 요청과 일치하지 않습니다. 새 결제를 시도하지 말고 기존 결제 상태를 확인해 주세요.'
    case 'confirmation-unavailable': return '개발용 승인 기능의 활성화 설정, 테스트 키 또는 서버 상태를 확인해 주세요. 결제 완료로 표시하지 않았습니다.'
    case 'confirmation-failed': return '결제 승인이 거절되었거나 승인 가능한 상태가 아닙니다. 결제 완료가 아닙니다.'
  }
}
function state(phase: ResultPhase, orderId?: string): ResultState {
  return { phase, message: phaseMessage(phase), ...(orderId ? { orderId } : {}) }
}
export function resultBusy(result: ResultState): boolean {
  return ['validating', 'checking-order', 'confirming'].includes(result.phase)
}
export function resultCanRetry(result: ResultState): boolean {
  return ['confirmation-pending', 'confirmation-unknown', 'confirmation-network-error', 'network-error', 'system-error'].includes(result.phase)
}
export function resultHeading(outcome: 'success' | 'fail', result: ResultState): string {
  if (outcome === 'fail') return '테스트 결제 인증 실패'
  if (result.phase === 'approved') return '테스트 결제 완료'
  if (result.phase === 'waiting-for-deposit') return '테스트 결제 입금 대기'
  return '테스트 결제 인증 결과'
}

// A non-sensitive retry hint, never an approval record or a substitute for a server response.
export function confirmationReview(order: DevTestOrder): string {
  return JSON.stringify({ orderId: order.orderId, amount: order.amount, status: 'confirmation-requested' })
}
function hasReview(value: string | null | undefined, order: DevTestOrder): boolean {
  try {
    const review = JSON.parse(value ?? '')
    return review?.orderId === order.orderId && review?.amount === order.amount && review?.status === 'confirmation-requested'
  } catch { return false }
}
type FlowOptions = {
  onProgress?: (value: ResultState) => void
  onSubmitting?: (order: DevTestOrder) => void
  review?: string | null
}
type Entry = {
  identity: string; key: string; latest: ResultState
  listeners: Set<(value: ResultState) => void>; task: Promise<ResultState>
}

export function createResultFlow(find: (id: string, signal: AbortSignal) => Promise<unknown>, confirm?: ApprovalConnector) {
  const inFlight = new Map<string, Entry>()
  return (params: URLSearchParams, attempt: string | null, options: FlowOptions = {}): Promise<ResultState> => {
    let validated: ReturnType<typeof validateSuccess>
    try { validated = validateSuccess(params, attempt) }
    catch (error) { return Promise.resolve(state(error instanceof ResultValidationError ? 'invalid-result' : 'system-error')) }
    const { order: expected, approval } = validated
    const identity = JSON.stringify([expected.orderId, expected.amount, expected.orderName, expected.currency, expected.status])
    const pending = inFlight.get(expected.orderId)
    const notify = (listener: (value: ResultState) => void, value: ResultState) => {
      try { listener(value) } catch { /* A detached view must not interrupt server confirmation. */ }
    }
    if (pending) {
      if (pending.identity !== identity || pending.key !== approval.paymentKey) return Promise.resolve(state('confirmation-conflict'))
      if (options.onProgress) { pending.listeners.add(options.onProgress); notify(options.onProgress, pending.latest) }
      return pending.task
    }
    const entry: Entry = { identity, key: approval.paymentKey, latest: state('checking-order'),
      listeners: new Set(options.onProgress ? [options.onProgress] : []), task: undefined as unknown as Promise<ResultState> }
    const publish = (value: ResultState) => {
      entry.latest = value
      for (const listener of entry.listeners) notify(listener, value)
    }
    const task = (async (): Promise<ResultState> => {
      publish(state('checking-order'))
      try {
        const signal = AbortSignal.timeout(15000)
        const response = await find(expected.orderId, signal)
        signal.throwIfAborted()
        let saved: DevTestOrder
        try { saved = validateDevOrder(response) } catch { return state('order-mismatch') }
        if (saved.orderId !== expected.orderId || saved.amount !== expected.amount || saved.orderName !== expected.orderName
          || saved.currency !== expected.currency || saved.status !== expected.status) return state('order-mismatch')
      } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
        // A prior-submission hint permits backend-ledger recovery after the original dev order expired.
        // The backend still validates every request. This hint can never produce a paid UI by itself.
        if (!confirm || !hasReview(options.review, expected) || (status !== 404 && status !== 410)) {
          if (status === 404 || status === 410) return state('order-unavailable')
          if (error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) return state('network-error')
          return state('system-error')
        }
      }
      if (!confirm) return state('approval-unavailable', expected.orderId)
      publish(state('confirming', expected.orderId))
      try { options.onSubmitting?.(expected) } catch { /* Retry hints are not payment authority. */ }
      try {
        const signal = AbortSignal.timeout(CONFIRMATION_TIMEOUT_MS)
        const response = await confirm(approval, signal)
        signal.throwIfAborted()
        // Concrete client already validated HTTP and DTO. Validate again to constrain injected connectors.
        const data = response as ConfirmationResponse
        const checked = readConfirmationResponse(data?.paymentStatus === 'CONFIRMING' || data?.paymentStatus === 'UNKNOWN' ? 202 : 200,
          { success: true, data: response }, approval)
        switch (checked.paymentStatus) {
          case 'DONE': return state('approved', expected.orderId)
          case 'WAITING_FOR_DEPOSIT': return state('waiting-for-deposit', expected.orderId)
          case 'CONFIRMING': return state('confirmation-pending', expected.orderId)
          case 'UNKNOWN': return state('confirmation-unknown', expected.orderId)
        }
      } catch (error) {
        if (error instanceof ConfirmationError) {
          switch (error.kind) {
            case 'request': return state('invalid-result')
            case 'order': return state('order-unavailable')
            case 'conflict': return state('confirmation-conflict')
            case 'configuration': return state('confirmation-unavailable')
            case 'rejected': return state('confirmation-failed')
            case 'network': return state('confirmation-network-error', expected.orderId)
            case 'unknown': return state('confirmation-unknown', expected.orderId)
          }
        }
        if (error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)))
          return state('confirmation-network-error', expected.orderId)
        return state('confirmation-unknown', expected.orderId)
      }
    })()
    entry.task = task
    inFlight.set(expected.orderId, entry)
    void task.then(() => {
      if (inFlight.get(expected.orderId) === entry) inFlight.delete(expected.orderId)
    }, () => { if (inFlight.get(expected.orderId) === entry) inFlight.delete(expected.orderId) })
    return task
  }
}
