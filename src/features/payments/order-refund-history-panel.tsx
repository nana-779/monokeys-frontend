import { formatPrice } from '@/lib/store-shared'
import type { OrderRefundHistory } from './order-refund-api'

const summaryLabels = {
  NO_PAYMENT: '결제 정보 없음',
  NONE: '완료된 취소 없음',
  PARTIAL: '부분 취소',
  FULL: '전액 취소',
  REVIEW_REQUIRED: '결과 확인 필요',
}
const entryLabels = { REQUESTED: '처리 중 또는 결과 확인 필요', COMPLETED: '취소 확인', REJECTED: '거절 또는 실패', PENDING_APPROVAL: '승인 대기', WITHDRAWN: '철회', AWAITING_RETURN: '보류' }
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Seoul',
})

// 확정된 취소만 금액 합계에 포함합니다. PG 취소 확인과 카드·계좌 입금은 시점이 다를 수 있습니다.
export function OrderRefundHistoryPanel({ history }: { history: OrderRefundHistory }) {
  const money = (amount: number | null) => amount === null ? '—' : formatPrice(amount)
  return (
    <section aria-labelledby="refund-history-heading" className="space-y-4 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="refund-history-heading" className="text-lg font-semibold">취소·환불 내역</h2>
        <p className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">{summaryLabels[history.status]}</p>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg bg-neutral-50 p-4 text-sm">
        <dt>최초 결제금액</dt>
        <dd>{money(history.paymentAmount)}</dd>
        <dt>누적 취소금액</dt>
        <dd>{money(history.completedAmount)}</dd>
        <dt>로컬 기록 기준 잔액</dt>
        <dd>{money(history.remainingAmount)}</dd>
      </dl>
      {history.status === 'REVIEW_REQUIRED' && (
        <p role="alert" className="text-sm text-amber-800">결제금액과 취소 내역을 확인 중입니다.</p>
      )}
      {history.entries.length === 0 ? (
        <p className="text-sm text-neutral-600">기록된 취소 내역이 없습니다.</p>
      ) : (
        <ol className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {history.entries.map((entry) => {
            const eventAt = entry.canceledAt ?? entry.requestedAt
            return (
              <li key={entry.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2 font-medium">
                  <span>{entryLabels[entry.status]}{entry.effect === 'FULL' ? ' · 잔액 전액' : entry.effect === 'PARTIAL' ? ' · 부분' : ''}</span>
                  <span>{formatPrice(entry.amount)}</span>
                </div>
                <p className="break-words text-neutral-700">{entry.reason}</p>
                <time dateTime={eventAt} className="text-xs text-neutral-600">{timeFormat.format(new Date(eventAt))}</time>
                {entry.status === 'REJECTED' && (
                  <p className="text-red-700">취소가 완료되지 않았습니다. 다시 조회해 최신 상태를 확인해 주세요.</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {(history.completedAmount ?? 0) > 0 && (
        <p className="text-xs text-neutral-600">
          결제사에서 취소를 확인한 뒤 실제 카드·계좌에 환불이 반영되기까지 시간이 걸릴 수 있어요.
        </p>
      )}
    </section>
  )
}
