'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/api-client'
import { labels, reasons, type Workflow } from '@/features/payments/refund-workflow'

const filters = {
  전체: Object.keys(labels), '승인 대기': ['PENDING_APPROVAL'], 승인: ['REQUESTED', 'COMPLETED'],
  거절: ['REJECTED'], 보류: ['AWAITING_RETURN'], 철회: ['WITHDRAWN'],
}
const path = '/api/admin/refund-requests'
const button = 'h-9 shrink-0 rounded-md border border-zinc-200 bg-white px-4 text-xs font-medium text-zinc-900 transition-colors enabled:hover:border-black enabled:hover:bg-black enabled:hover:text-white focus-visible:outline-2 disabled:opacity-50'

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
      <button key={key} className={'rounded-md border px-3 py-2 text-xs ' + (key === filter ? 'bg-zinc-900 text-white' : 'border-zinc-200')}
        aria-pressed={key === filter} onClick={() => setFilter(key)}>{key}</button>)}</div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>조회 중…</p> : !error && !visible.length && <p>해당 요청이 없습니다.</p>}
    <div className="divide-y divide-zinc-200 border-y border-zinc-200 empty:hidden">
    {visible.map(row => {
      const pending = row.status === 'PENDING_APPROVAL'
      const held = row.status === 'AWAITING_RETURN'
      const returning = row.type === 'RETURN'
      return <article key={row.id} className="flex flex-col gap-4 py-5 text-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1.5 break-words">
        <h3 className="font-semibold">{row.orderNumber} · {returning ? '반품' : '취소'} · {row.status && labels[row.status]}</h3>
        <p className="text-xs tabular-nums text-zinc-500">{row.requestedAt?.replace('T', ' ').slice(0,16)} · {row.amount.toLocaleString('ko-KR')}원</p>
        <p>{row.returnReason && reasons[row.returnReason] + ' · '}{row.reason}</p>
        {row.rejectionReason && <p>거절 사유 {row.rejectionReason}</p>}
        </div>
        {(pending || held) && <fieldset disabled={busy || loading} className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <button className={button} onClick={() => {
            if (window.confirm(returning ? '반품을 회수했나요? 승인하면 전액 환불됩니다.' : '취소를 승인하고 전액 환불할까요?'))
              void act(row, returning ? 'RECEIVE_RETURN' : 'APPROVE_CANCELLATION')
          }}>승인</button>
          {returning && pending && <button className={button} onClick={() => void act(row, 'HOLD_RETURN')}>보류</button>}
          <form className="flex min-w-0 max-w-full items-center gap-2" onSubmit={e => {
            e.preventDefault()
            const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
            if (reason) void act(row, 'REJECT', reason)
          }}>
            <button className={button}>거절</button>
            <input aria-label="거절 사유" name="reason" placeholder="거절 사유" required maxLength={255} className="h-9 w-44 min-w-0 rounded-md border border-zinc-200 bg-white px-3 text-xs placeholder:text-zinc-500 focus:border-zinc-600" />
          </form>
        </fieldset>}
        {row.status === 'REQUESTED' && <button className={button} disabled={busy || loading} onClick={() => void act(row,'RECONCILE')}>환불 결과 확인</button>}
      </article>
    })}
    </div>
  </section>
}
