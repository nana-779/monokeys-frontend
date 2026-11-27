'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/api-client'
import { labels, reasons, type Workflow } from '@/features/payments/refund-workflow'

const filters = {
  전체: Object.keys(labels), '승인 대기': ['PENDING_APPROVAL'], 승인: ['REQUESTED', 'COMPLETED'],
  거절: ['REJECTED'], 보류: ['AWAITING_RETURN'], 철회: ['WITHDRAWN'],
}
const path = '/api/admin/refund-requests'
const button = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50'

export function AdminRefunds() {
  const [filter, setFilter] = useState<keyof typeof filters>('전체')
  const [rows, setRows] = useState<Workflow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    apiRequest<{data: Workflow[]}>(path, {signal:controller.signal}).then(({data}) => {
      if (!controller.signal.aborted) setRows(data)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])
  async function act(row: Workflow, action: string, reason?: string) {
    setError('')
    setBusy(true)
    try { await apiRequest(path + '/' + row.id, {method:'POST', body:JSON.stringify({action, reason})}) }
    catch (e) { setError(e instanceof Error ? e.message : '처리에 실패했습니다.') }
    finally { setLoading(true); setReload(n => n+1); setBusy(false) }
  }
  const visible = rows.filter(row => row.status && filters[filter].includes(row.status))
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2">{(Object.keys(filters) as (keyof typeof filters)[]).map(key =>
      <button key={key} className={button + (key === filter ? ' bg-zinc-900 text-white' : '')}
        aria-pressed={key === filter} onClick={() => setFilter(key)}>{key}</button>)}</div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>조회 중…</p> : !error && !visible.length && <p>해당 요청이 없습니다.</p>}
    {visible.map(row => {
      const pending = row.status === 'PENDING_APPROVAL'
      const held = row.status === 'AWAITING_RETURN'
      const returning = row.type === 'RETURN'
      return <article key={row.id} className="space-y-2 rounded-lg border p-4 text-sm">
        <h3 className="font-semibold">{row.orderNumber} · {returning ? '반품' : '취소'} · {row.status && labels[row.status]}</h3>
        <p>{row.requestedAt?.replace('T', ' ').slice(0,16)} · {row.amount.toLocaleString('ko-KR')}원</p>
        <p>{row.returnReason && reasons[row.returnReason] + ' · '}{row.reason}</p>
        {row.rejectionReason && <p>거절 사유 {row.rejectionReason}</p>}
        {(pending || held) && <fieldset disabled={busy || loading} className="space-y-2">
          <button className={button} onClick={() => {
            if (window.confirm(returning ? '반품을 회수했나요? 승인하면 전액 환불됩니다.' : '취소를 승인하고 전액 환불할까요?'))
              void act(row, returning ? 'RECEIVE_RETURN' : 'APPROVE_CANCELLATION')
          }}>승인</button>
          {returning && pending && <button className={button} onClick={() => void act(row, 'HOLD_RETURN')}>보류</button>}
          <form className="flex gap-2" onSubmit={e => {
            e.preventDefault()
            const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
            if (reason) void act(row, 'REJECT', reason)
          }}><input aria-label="거절 사유" name="reason" placeholder="거절 사유" required maxLength={255} className={button}/>
            <button className={button}>거절</button></form>
        </fieldset>}
        {row.status === 'REQUESTED' && <button className={button} disabled={busy || loading} onClick={() => void act(row,'RECONCILE')}>환불 결과 확인</button>}
      </article>
    })}
  </section>
}
