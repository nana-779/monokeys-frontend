import { ProductImage } from '@/components/common/product-image'
import { formatPrice } from '@/lib/store-shared'
import type { MyOrder } from './my-orders-api'

const deliveryLabels: Record<NonNullable<MyOrder['deliveryStatus']>, string> = {
  PREPARING: '배송 준비',
  SHIPPING: '배송 중',
  DELIVERED: '배송 완료',
  RETURNED: '반품 완료',
}

export function OrderStatus({ order }: { order: MyOrder }) {
  return <p className="text-sm text-neutral-600">{order.deliveryStatus ? deliveryLabels[order.deliveryStatus] : '배송 정보 없음'}</p>
}

// 목록과 상세에서 주문 당시 상품명·단가·수량을 같은 형식으로 표시합니다.
export function OrderItems({ items, alignedWithOrderNumber = false }: { items: MyOrder['items']; alignedWithOrderNumber?: boolean }) {
  if (!items?.length) return <p className="text-sm text-neutral-600">상품 정보 없음</p>

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.orderItemId} className={`flex min-w-0 items-center ${alignedWithOrderNumber ? 'gap-8' : 'gap-3'}`}>
          <ProductImage src={item.thumbnailUrl} alt={item.productName} className="size-16 shrink-0 rounded-sm object-cover" />
          <div className="min-w-0 break-words">
            <p className="text-sm font-semibold">{item.productName}</p>
            <p className="mt-1 text-xs text-neutral-600">{formatPrice(item.unitPrice)} · {item.quantity}개</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
