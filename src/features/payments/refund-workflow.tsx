'use client'

import Link from 'next/link'
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

export function RefundWorkflow({ orderNumber, compact = false }: { orderNumber: string; compact?: boolean }) {
  const [row, setRow] = useState<Workflow | null>(null)
  const [error, setError] = useState('')
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
  async function send(url: string, body?: object) {
    setBusy(true)
    setError('')
    try {
      await apiRequest(url, { method: 'POST', body: body && JSON.stringify(body) })
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.')
    } finally {
      setRefresh((n) => n + 1)
      setRow(null)
      setBusy(false)
    }
  }
  const button = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50'
  const title = row?.availableType === 'RETURN' ? '전체 반품 신청' : '주문 취소 요청'
  return <div className="space-y-2 text-sm">
    {error && <p role="alert">{error}</p>}
    {row?.status && <p role="status">{row.type === 'CANCELLATION' && row.status === 'COMPLETED'
      ? '취소 완료' : row.status === 'PENDING_APPROVAL' ? (row.type === 'RETURN' ? '반품 승인 대기 중' : '취소 승인 대기 중') : labels[row.status]}</p>}
    {row?.rejectionReason && <p>거절 사유 {row.rejectionReason}</p>}
    {row?.status === 'PENDING_APPROVAL' && <button className={button} disabled={busy}
      onClick={() => void send(path + '/' + row.id + '/withdraw')}>{row.type === 'RETURN' ? '반품 철회' : '취소 철회'}</button>}
    {row?.availableType && (compact ? <Link href={page} className={button}>{title}</Link> :
      <form className="grid max-w-lg gap-3" onSubmit={(e) => {
        e.preventDefault()
        const fields = new FormData(e.currentTarget)
        void send(path, { type: row.availableType, reason: fields.get('reason'), returnReason: fields.get('returnReason') })
      }}>
        {row.availableType === 'RETURN' ? <>
          <p>수령 확인일부터 단순 변심은 7일, 상품 불량·오배송은 30일 이내에 신청할 수 있습니다. 반품 회수 확인 후 전액 환불됩니다.</p>
          <label>반품 사유 <select name="returnReason" required defaultValue="" className={button}>
            <option value="" disabled>선택해 주세요</option>
            {Object.entries(reasons).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select></label>
        </> : <p>승인 전까지 철회할 수 있습니다. 승인 후에는 전액 환불됩니다.</p>}
        <label>상세 사유<textarea name="reason" required maxLength={140} className="block w-full rounded-md border p-2" /></label>
        <button className={button} disabled={busy}>{title}</button>
      </form>)}
    {!compact && row && !row.status && !row.availableType && <p>현재 신청할 수 없습니다. 반품은 수령 확인 후 신청해 주세요.</p>}
    {(!compact || row?.status === 'COMPLETED') && <Link href={page + '?view=history'} className="underline">환불 내역</Link>}
  </div>
}
