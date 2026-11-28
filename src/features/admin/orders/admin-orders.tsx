import { useEffect, useState } from 'react'
import { getAdminOrders, updateAdminOrder, type AdminOrder, type AdminOrderChanges } from './api'

const labels: Record<string, string> = {
  ALL: '전체',
  PREPARING: '배송 준비 중',
  SHIPPING: '배송 중',
  DELIVERED: '배송 완료',
  RETURNED: '반송',
  PENDING: '결제 대기',
  ORDERED: '주문 완료',
  CANCELLED: '취소',
  REFUNDED: '환불 완료',
  CONFIRMED: '구매 확정',
}
const headings = [
  '저장',
  '선택',
  '주문 번호 / 결제 일시',
  '주문 상품',
  '주문 상태',
  '배송 상태',
  '배송사',
  '트래킹 넘버',
  '결제 금액',
  '주문자',
  '연락처',
  '배송지',
  '배송메모',
]
const inputStyle = 'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs'

function AdminOrderRow({ order, onSaved }: { order: AdminOrder; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(order)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canEditShipment =
    order.paymentStatus === 'PAID' &&
    ['ORDERED', 'CONFIRMED'].includes(order.orderStatus) &&
    ['PREPARING', 'SHIPPING', 'DELIVERED'].includes(order.deliveryStatus || '')
  const canEditAddress = order.deliveryStatus === 'PREPARING' && order.orderStatus === 'ORDERED'
  const contactFields = ['name', 'phone', 'postalCode', 'roadAddress', 'detailAddress'] as const
  const shipmentChanged = draft.company !== order.company || draft.tracking !== order.tracking
  const changed = shipmentChanged || contactFields.some((key) => draft[key] !== order[key])
  const valid =
    (draft.phone === order.phone || /^[0-9]+$/.test(draft.phone)) &&
    contactFields.every((key) => draft[key].trim()) &&
    (!shipmentChanged || (draft.company?.trim() && draft.tracking?.trim()))

  function field(
    key: keyof AdminOrderChanges,
    label: string,
    maxLength: number,
  ) {
    return (
      <input
        className={inputStyle}
        aria-label={label}
        placeholder={label}
        inputMode={key === 'phone' ? 'numeric' : undefined}
        maxLength={maxLength}
        disabled={busy}
        value={draft[key] ?? ''}
        onChange={(e) => setDraft({ ...draft, [key]: key === 'phone' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value })}
      />
    )
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const changes: AdminOrderChanges = {}
      for (const key of contactFields) {
        if (draft[key] !== order[key]) changes[key] = draft[key].trim()
      }
      if (shipmentChanged) {
        changes.company = draft.company?.trim()
        changes.tracking = draft.tracking?.trim()
      }
      await updateAdminOrder(order.id, changes)
      await onSaved()
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '배송 정보를 저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr className="h-[49px] border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-600 [&>td]:px-2 [&>td]:py-2">
        <td>
          <button
            className="rounded bg-zinc-900 px-2 py-1 text-white disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={!editing || busy || !changed || !valid}
            onClick={save}
          >
            저장
          </button>
        </td>
        <td>
          <input
            type="checkbox"
            aria-label={order.number + ' 배송 입력'}
            checked={editing}
            disabled={busy}
            onChange={(e) => {
              setDraft(order)
              setError('')
              setEditing(e.target.checked)
            }}
          />
        </td>
        <td>
          <strong>{order.number}</strong>
          <br />
          {order.paidAt?.replace('T', ' ').slice(0, 16) || '—'}
        </td>
        <td>
          {order.items.map((item, i) => (
            <div key={i}>
              {item.name} · {item.quantity}개
            </div>
          ))}
        </td>
        <td>{labels[order.orderStatus] || order.orderStatus}</td>
        <td>{labels[order.deliveryStatus || ''] || '—'}</td>
        <td>
          {editing && canEditShipment ? field('company', '배송사', 50) : order.company || '—'}
        </td>
        <td>
          {editing && canEditShipment
            ? field('tracking', '트래킹 넘버', 100)
            : order.tracking || '—'}
        </td>
        <td className="font-bold">
          {order.amount == null ? '—' : order.amount.toLocaleString('ko-KR') + '원'}
        </td>
        <td>{editing ? field('name', '주문자', 50) : order.name}</td>
        <td>{editing ? field('phone', '연락처', 11) : order.phone}</td>
        <td>
          {' '}
          {editing && canEditAddress ? (
            <div className="grid gap-1">
              {field('postalCode', '우편번호', 10)}
              {field('roadAddress', '도로명 주소', 255)}
              {field('detailAddress', '상세 주소', 255)}
            </div>
          ) : (
            [order.postalCode, order.roadAddress, order.detailAddress].join(' ')
          )}
        </td>
        <td>{order.memo || '—'}</td>
      </tr>
      {error && (
        <tr>
          <td colSpan={headings.length} role="alert" className="p-2 text-sm text-red-700">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [status, setStatus] = useState('ALL')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exclude, setExclude] = useState(false)
  const [page, setPage] = useState(1)
  async function loadOrders() {
    setError('')
    try {
      setOrders(await getAdminOrders())
    } catch {
      setError('주문 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [])

  const visible = orders.filter(
    (o) =>
      o.number.includes(query) &&
      (status === 'ALL' || o.deliveryStatus === status) &&
      (!exclude ||
        (o.orderStatus !== 'PENDING' &&
          o.orderStatus !== 'CANCELLED' &&
          o.paymentStatus !== 'CANCELLED')),
  )
  const pages = Math.max(1, Math.ceil(visible.length / 50))
  const currentPage = Math.min(page, pages)
  const pageOrders = visible.slice((currentPage - 1) * 50, currentPage * 50)

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          setPage(1)
          setQuery(String(form.get('orderNumber') || '').trim())
        }}
      >
        <input
          className={inputStyle}
          aria-label="주문번호 검색"
          placeholder="주문번호 검색"
          name="orderNumber"
        />
        <button className="rounded-md bg-zinc-900 px-4 text-sm text-white">검색</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {['ALL', 'PREPARING', 'SHIPPING', 'DELIVERED'].map((key) => (
          <button
            key={key}
            aria-pressed={key === status}
            onClick={() => {
              setStatus(key)
              setPage(1)
            }}
            className={
              'rounded-md border px-3 py-2 text-xs ' +
              (key === status ? 'bg-zinc-900 text-white' : 'border-zinc-200')
            }
          >
            {labels[key]}
          </button>
        ))}
        <button
          aria-pressed={exclude}
          onClick={() => {
            setExclude(!exclude)
            setPage(1)
          }}
          className={
            'rounded-md border px-3 py-2 text-xs ' +
            (exclude ? 'bg-zinc-900 text-white' : 'border-zinc-200')
          }
        >
          결제 대기·취소 제외
        </button>
      </div>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            onClick={() => {
              setLoading(true)
              void loadOrders()
            }}
          >
            다시 불러오기
          </button>
        </p>
      ) : loading ? (
        <p role="status">주문을 불러오는 중입니다.</p>
      ) : (
        <>
          <p className="text-xs text-zinc-600">
            조회 결과 {visible.length}건 · 수정할 주문을 선택하세요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1632px] text-left">
              <thead className="border-y border-zinc-200 text-xs text-zinc-700">
                <tr>
                  {headings.map((h) => (
                    <th scope="col" key={h} className="px-2 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((o) => (
                  <AdminOrderRow key={o.id} order={o} onSaved={loadOrders} />
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="주문 페이지" className="flex justify-center gap-4 text-sm">
              <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                이전
              </button>
              <span>
                {currentPage} / {pages}
              </span>
              <button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>
                다음
              </button>
            </nav>
          )}
          {!visible.length && <p className="py-6 text-center text-sm">조회된 주문이 없습니다.</p>}
        </>
      )}
    </section>
  )
}
