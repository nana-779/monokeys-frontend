import type { ApprovalRequest } from './payment-result'

export type ConfirmationStatus = 'DONE' | 'WAITING_FOR_DEPOSIT' | 'CONFIRMING' | 'UNKNOWN'
export type ConfirmationResponse = Readonly<{
  orderId: string; amount: number; currency: 'KRW'; paymentStatus: ConfirmationStatus
  completed: boolean; method: string | null; approvedAt: string | null; storage: 'MEMORY_ONLY'
}>
export type ConfirmationFailure = 'request' | 'order' | 'conflict' | 'rejected' | 'configuration' | 'network' | 'unknown'
const errorCodes = new Set([
  'INVALID_CONFIRM_REQUEST', 'INVALID_CONFIRM_CONTENT_TYPE', 'DEV_ORDER_NOT_FOUND',
  'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_REQUEST_CONFLICT', 'PAYMENT_STATE_CONFLICT',
  'PAYMENT_REJECTED', 'PAYMENT_CONFIRM_FORBIDDEN', 'PAYMENT_PROVIDER_CONFIGURATION_ERROR',
  'PAYMENT_CONFIRM_CAPACITY_EXCEEDED', 'PAYMENT_CONFIRM_INTERNAL_ERROR',
])
const errorStatuses: Record<string, number> = {
  INVALID_CONFIRM_REQUEST: 400, INVALID_CONFIRM_CONTENT_TYPE: 415, DEV_ORDER_NOT_FOUND: 404,
  PAYMENT_AMOUNT_MISMATCH: 409, PAYMENT_REQUEST_CONFLICT: 409, PAYMENT_STATE_CONFLICT: 409,
  PAYMENT_REJECTED: 422, PAYMENT_CONFIRM_FORBIDDEN: 403, PAYMENT_PROVIDER_CONFIGURATION_ERROR: 502,
  PAYMENT_CONFIRM_CAPACITY_EXCEEDED: 429, PAYMENT_CONFIRM_INTERNAL_ERROR: 500,
}
const providerCodes = new Set([
  'INVALID_API_KEY', 'UNAUTHORIZED_KEY', 'FORBIDDEN_REQUEST', 'NOT_FOUND_PAYMENT',
  'NOT_FOUND_PAYMENT_SESSION', 'ALREADY_PROCESSED_PAYMENT', 'EXPIRED_PAYMENT', 'INVALID_REQUEST',
  'INVALID_PAYMENT_KEY', 'INVALID_AMOUNT', 'INVALID_ORDER_ID', 'REJECT_CARD_COMPANY',
  'PAY_PROCESS_CANCELED', 'PAY_PROCESS_ABORTED', 'PROVIDER_ERROR',
])
const methods = new Set(['카드', '가상계좌', '간편결제', '휴대폰', '계좌이체', '문화상품권', '도서문화상품권', '게임문화상품권'])

export class ConfirmationError extends Error {
  constructor(public readonly kind: ConfirmationFailure, public readonly status = 0,
    public readonly code?: string, public readonly providerCode?: string) {
    super('결제 승인 응답을 확인하지 못했습니다.')
    this.name = 'ConfirmationError'
  }
}

type JsonObject = Record<string, unknown>
function object(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function validApprovalRequest(request: ApprovalRequest): boolean {
  return !!request && typeof request.paymentKey === 'string' && /^[\x21-\x7e]{1,200}$/.test(request.paymentKey)
    && typeof request.orderId === 'string' && /^dev_[a-f0-9]{32}$/.test(request.orderId)
    && Number.isSafeInteger(request.amount) && request.amount > 0
}

/** Validate the actual backend HTTP/envelope/DTO together; return only whitelisted display data. */
export function readConfirmationResponse(status: number, body: unknown, request: ApprovalRequest): ConfirmationResponse {
  if (status !== 200 && status !== 202) {
    const data = object(body) && body.success === false && object(body.data) ? body.data : null
    const code = data && typeof data.code === 'string' && errorCodes.has(data.code)
      && errorStatuses[data.code] === status ? data.code : undefined
    const provider = data && typeof data.providerCode === 'string' && providerCodes.has(data.providerCode)
      ? data.providerCode : undefined
    let kind: ConfirmationFailure = 'unknown'
    if (code === 'INVALID_CONFIRM_REQUEST' || code === 'INVALID_CONFIRM_CONTENT_TYPE') kind = 'request'
    else if (code === 'DEV_ORDER_NOT_FOUND') kind = 'order'
    else if (code === 'PAYMENT_AMOUNT_MISMATCH' || code === 'PAYMENT_REQUEST_CONFLICT') kind = 'conflict'
    else if (code === 'PAYMENT_REJECTED' || code === 'PAYMENT_STATE_CONFLICT') kind = 'rejected'
    else if (code === 'PAYMENT_CONFIRM_FORBIDDEN' || code === 'PAYMENT_PROVIDER_CONFIGURATION_ERROR'
      || code === 'PAYMENT_CONFIRM_CAPACITY_EXCEEDED') kind = 'configuration'
    // Never copy server/provider messages, field values or arbitrary error codes into an Error.
    throw new ConfirmationError(kind, status, code, provider)
  }
  if (!object(body) || body.success !== true || !object(body.data)) throw new ConfirmationError('unknown', status)
  const data = body.data
  if (data.orderId !== request.orderId || data.amount !== request.amount
    || !Number.isSafeInteger(data.amount) || data.currency !== 'KRW' || data.storage !== 'MEMORY_ONLY')
    throw new ConfirmationError('unknown', status)
  const paymentStatus = data.paymentStatus
  let method: string | null = null, approvedAt: string | null = null
  if (status === 200 && paymentStatus === 'DONE' && data.completed === true) {
    if (typeof data.method !== 'string' || !methods.has(data.method)
      || typeof data.approvedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.approvedAt)
      || !Number.isFinite(Date.parse(data.approvedAt))) throw new ConfirmationError('unknown', status)
    method = data.method; approvedAt = data.approvedAt
  } else if (status === 200 && paymentStatus === 'WAITING_FOR_DEPOSIT' && data.completed === false) {
    if (data.method !== '가상계좌' || data.approvedAt !== null) throw new ConfirmationError('unknown', status)
    method = data.method
  } else if (status === 202 && (paymentStatus === 'CONFIRMING' || paymentStatus === 'UNKNOWN') && data.completed === false) {
    if (data.method !== null || data.approvedAt !== null) throw new ConfirmationError('unknown', status)
  } else throw new ConfirmationError('unknown', status)
  return { orderId: request.orderId, amount: request.amount, currency: 'KRW', paymentStatus,
    completed: data.completed, method, approvedAt, storage: 'MEMORY_ONLY' }
}

export type ConfirmationTransport = (url: string, init: RequestInit) => Promise<{
  status: number; json: () => Promise<unknown>
}>

/** Feature-only adapter: shared auth/API error semantics are intentionally left unchanged. */
export function createPaymentConfirmationClient(baseUrl: string, transport: ConfirmationTransport) {
  return async (request: ApprovalRequest, signal: AbortSignal): Promise<ConfirmationResponse> => {
    if (!validApprovalRequest(request)) throw new ConfirmationError('request')
    let response: Awaited<ReturnType<ConfirmationTransport>>
    try {
      signal.throwIfAborted()
      response = await transport(baseUrl.replace(/\/$/, '') + '/api/payments/confirm', {
        method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentKey: request.paymentKey, orderId: request.orderId, amount: request.amount }),
      })
      signal.throwIfAborted()
    } catch { throw new ConfirmationError('network') }
    let body: unknown
    try { body = await response.json() } catch { throw new ConfirmationError('unknown', response.status) }
    if (signal.aborted) throw new ConfirmationError('network')
    return readConfirmationResponse(response.status, body, request)
  }
}
