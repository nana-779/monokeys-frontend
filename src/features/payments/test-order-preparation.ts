export type DevTestOrder = {
  orderId: string
  orderName: string
  amount: number
  currency: 'KRW'
  status: 'PENDING'
}
// 테스트 주문번호·양수 금액·통화·대기 상태를 확인합니다. 화면에서 받은 값도 그대로 신뢰하지 않습니다.
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
// 서버에서 생성한 주문을 다시 조회해 같은 데이터인지 비교한 다음 위젯 금액을 설정합니다.
async function runPreparation(
  widgets: AmountWidgets,
  source: { create: () => Promise<DevTestOrder>; find: (id: string) => Promise<DevTestOrder> },
  signal: AbortSignal,
): Promise<DevTestOrder> {
  signal.throwIfAborted()
  // 생성한 주문을 다시 조회하여 같은 주문번호와 금액인지 확인할 기준으로 사용합니다.
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
  // 공유 위젯의 금액 설정을 순서대로 처리하여 동시에 준비한 주문끼리 금액을 덮어쓰지 않게 합니다.
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

// 화면 이탈이나 준비 시간 초과로 요청이 취소되면 준비 실패로 끝내고 결제 가능한 주문을 반환하지 않습니다.
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
