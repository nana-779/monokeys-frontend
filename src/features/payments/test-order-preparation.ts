export type DevTestOrder = {
  orderId: string
  orderName: string
  amount: number
  currency: 'KRW'
  status: 'PENDING'
}
export function validateDevOrder(value: unknown): DevTestOrder {
  const order = value as Partial<DevTestOrder> | null
  if (
    !order ||
    typeof order !== 'object' ||
    typeof order.orderId !== 'string' ||
    !/^dev_[a-f0-9]{32}$/.test(order.orderId) ||
    typeof order.orderName !== 'string' ||
    !order.orderName.trim() ||
    order.orderName.length > 100 ||
    !Number.isSafeInteger(order.amount) ||
    (order.amount ?? 0) <= 0 ||
    order.currency !== 'KRW' ||
    order.status !== 'PENDING'
  ) {
    throw new Error('테스트 주문 정보가 올바르지 않습니다.')
  }
  return order as DevTestOrder
}

// SDK 인스턴스가 공유되므로 금액 변경도 직렬화합니다. 이전 작업이 끝나기 전 새 금액을 덮어쓰지 않습니다.
const amountQueues = new WeakMap<object, Promise<void>>()
type AmountWidgets = { setAmount: (amount: { currency: 'KRW'; value: number }) => Promise<unknown> }
async function runPreparation(
  widgets: AmountWidgets,
  source: { create: () => Promise<DevTestOrder>; find: (id: string) => Promise<DevTestOrder> },
  signal: AbortSignal,
): Promise<DevTestOrder> {
  signal.throwIfAborted()
  const created = validateDevOrder(await source.create())
  signal.throwIfAborted()
  const order = validateDevOrder(await source.find(created.orderId))
  if (
    Object.keys(created).some(
      (key) => created[key as keyof DevTestOrder] !== order[key as keyof DevTestOrder],
    )
  ) {
    throw new Error('생성·조회한 테스트 주문 정보가 일치하지 않습니다.')
  }
  signal.throwIfAborted()
  const previous = amountQueues.get(widgets) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      signal.throwIfAborted()
      await widgets.setAmount({ currency: 'KRW', value: order.amount })
    })
  amountQueues.set(widgets, next)
  try {
    await next
  } finally {
    if (amountQueues.get(widgets) === next) amountQueues.delete(widgets)
  }
  signal.throwIfAborted()
  return order
}

export function prepareTestOrder(
  widgets: AmountWidgets,
  source: { create: () => Promise<DevTestOrder>; find: (id: string) => Promise<DevTestOrder> },
  signal: AbortSignal,
): Promise<DevTestOrder> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('테스트 주문 준비가 중단되었습니다.'))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    runPreparation(widgets, source, signal)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}
