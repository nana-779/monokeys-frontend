'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/api-client'

export const labels = {
  PENDING_APPROVAL: '승인 대기 중', REQUESTED: '환불 처리 중', COMPLETED: '환불 완료',
  REJECTED: '거절', WITHDRAWN: '철회', AWAITING_RETURN: '보류 · 회수 대기',
}
export const reasons = { CHANGE_OF_MIND: '단순 변심', DEFECT: '상품 불량', WRONG_ITEM: '오배송' }
export type Workflow = {
  id: number | null
  orderNumber: string
  status: keyof typeof labels | null
  type: 'CANCELLATION' | 'RETURN' | null
  availableType: 'CANCELLATION' | 'RETURN' | null
  reason: string | null
  rejectionReason: string | null
  returnReason: keyof typeof reasons | null
  requestedAt: string | null
  amount: number
}

export function RefundWorkflow({ orderNumber, compact = false, shipping = false }: { orderNumber: string; compact?: boolean; shipping?: boolean }) {
  const router = useRouter()
  const [submittedType, setSubmittedType] = useState<Workflow['availableType']>(null)
  const [row, setRow] = useState<Workflow | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const path = '/api/payments/orders/' + encodeURIComponent(orderNumber) + '/refund/request'
  const page = '/checkout/refund/' + encodeURIComponent(orderNumber)
  useEffect(() => {
    const controller = new AbortController()
    apiRequest<{data: Workflow}>(path, { signal: controller.signal }).then(({data}) => {
      if (!controller.signal.aborted) setRow(data)
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [path, refresh])
  useEffect(() => {
    if (!submittedType) return
    const timer = window.setTimeout(() => router.replace('/mypage/orders'), 1500)
    return () => window.clearTimeout(timer)
  }, [submittedType, router])

  async function send(url: string, body?: { type: Workflow['availableType']; reason: string; returnReason: FormDataEntryValue | null }) {
    setBusy(true)
    setError('')
    try {
      await apiRequest(url, { method: 'POST', body: body && JSON.stringify(body) })
      if (body?.type) {
        setSubmittedType(body.type)
        return
      }
      setRefresh((n) => n + 1)
      setRow(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const button = compact ? 'inline-flex h-9 w-24 max-w-full items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 px-2 text-xs font-semibold disabled:opacity-50' : 'rounded-md border px-3 py-2 text-sm disabled:opacity-50'
  const cancellation = row?.availableType === 'CANCELLATION'
  const reasonTooShort = cancellation && reason.trim().length < 5
  const title = row?.availableType === 'RETURN' ? '반품/환불 신청' : '주문 취소 요청'
  if (submittedType) return (
    <div role="status" className="space-y-2 text-center">
      <p className="font-semibold">{submittedType === 'RETURN' ? '반품 신청이 접수되었습니다!' : '취소요청이 완료되었습니다!'}</p>
      <p className="text-sm text-neutral-600">주문내역으로 이동합니다.</p>
    </div>
  )
  if (busy || (!row && !error)) return <RefundSpinner />
  const detail = '/mypage/orders/' + encodeURIComponent(orderNumber)
  return <div className={compact ? 'grid w-full min-w-0 justify-items-center gap-2 break-words text-sm' : 'mx-auto max-w-lg space-y-5 text-center text-sm'}>
    {error && <p role="alert">{error}</p>}
    {row?.status && <p role="status">{row.type === 'CANCELLATION' && row.status === 'COMPLETED'
      ? '취소 완료' : row.status === 'PENDING_APPROVAL' ? (row.type === 'RETURN' ? '반품 승인 대기 중' : '취소 승인 대기 중') : labels[row.status]}</p>}
    {row?.rejectionReason && <p>거절 사유 {row.rejectionReason}</p>}
    {row?.status === 'PENDING_APPROVAL' && <button className={button} disabled={busy}
      onClick={() => void send(path + '/' + row.id + '/withdraw')}>{row.type === 'RETURN' ? '반품 철회' : '취소 철회'}</button>}
    {compact && shipping && row && !row.availableType && !row.status &&
      <Link href={detail} className={button}>반품/환불 신청</Link>}
    {row?.availableType && (compact ? <Link href={page} className={button}>{title}</Link> :
      <form className="grid max-w-lg gap-3" onSubmit={(e) => {
        e.preventDefault()
        if (reasonTooShort) return
        const fields = new FormData(e.currentTarget)
        void send(path, { type: row.availableType, reason: reason.trim(), returnReason: fields.get('returnReason') })
      }}>
        {row.availableType === 'RETURN' ? <>
          <p>수령 확인일부터 단순 변심은 7일, 상품 불량·오배송은 30일 이내에 신청할 수 있습니다. <br/>반품하시는 상품은 판매자 확인을 거쳐 승인된 후 전액 환불 처리됩니다.</p>
          <label>반품 사유 <select name="returnReason" required defaultValue="" className={button}>
            <option value="" disabled>선택해 주세요</option>
            {Object.entries(reasons).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select></label>
        </> : <p>단순 변심에 의한 취소 요청은 취소가 승인되기 전까지 요청을 철회할 수 있습니다. <br/>승인되면 결제 금액 전액이 환불됩니다. <br/>카드 결제의 경우 주말과 공휴일을 제외하고 3~5영업일이 소요될 수 있습니다.</p>}
        {row.availableType === 'CANCELLATION'}
        <p/>
        <p/>
        <p/>
        <label>상세 사유<textarea name="reason" required maxLength={140}
          value={reason} onChange={(event) => setReason(event.target.value)}
          minLength={cancellation ? 5 : undefined}
          placeholder={cancellation ? '취소 사유를 5자 이상 입력해 주세요. \n상세 사유는 판매자가 확인할 수 있습니다.' : undefined} className="block w-full resize-none w-80 h-40 rounded-md border p-2" /></label>
        <p/>
        <button className={`${button} transition-colors enabled:hover:bg-black enabled:hover:text-white ${cancellation ? 'w-1/2 justify-self-center' : ''}`}
          disabled={busy || reasonTooShort}>{title}</button>
      </form>)}
    {!compact && row && !row.status && !row.availableType && <p>현재 신청할 수 없습니다. 반품은 수령 확인 후 신청해 주세요.</p>}
    {(!compact || row?.status === 'COMPLETED') && <Link href={page + '?view=history'} className="underline">환불 내역</Link>}
  </div>
}

export function RefundSpinner() {
  return <div role="status" className="flex justify-center py-2">
    <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-800" />
    <span className="sr-only">처리 중입니다</span>
  </div>
}
