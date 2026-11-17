type Widget = { destroy: () => Promise<void> }
export type OrderWidgetRenderer = {
  renderPaymentMethods: (options: { selector: string }) => Promise<Widget>
  renderAgreement: (options: { selector: string }) => Promise<Widget>
}

export class OrderWidgetRenderingError extends Error {
  // 어느 표시 단계에서 실패했는지만 안내하여 외부 SDK 오류 원문이 화면에 노출되지 않게 합니다.
  constructor(public readonly stage: 'payment' | 'agreement' | 'cleanup') {
    super(
      stage === 'payment'
        ? '결제수단 UI를 표시하지 못했습니다. 테스트 주문 준비를 다시 시도해 주세요.'
        : stage === 'agreement'
          ? '결제 약관 UI를 표시하지 못했습니다. 테스트 주문 준비를 다시 시도해 주세요.'
          : '기존 위젯을 정리하지 못했습니다. 페이지를 새로고침해 주세요.',
    )
    this.name = 'OrderWidgetRenderingError'
  }
}

// 공유 SDK는 이전 표시와 정리 작업이 끝난 뒤 다시 화면에 연결합니다.
const queues = new WeakMap<object, Promise<void>>()
const cleanupFailed = new WeakSet<object>()
// 금액 설정을 마친 위젯에 결제수단과 약관을 순서대로 표시하고, 화면 종료 시 정리할 함수를 돌려줍니다.
export function renderPaymentWidgets(
  widgets: OrderWidgetRenderer,
  selectors: { payment: string; agreement: string },
) {
  let disposed = false
  let payment: Widget | undefined
  let agreement: Widget | undefined
  let disposal: Promise<void> | undefined

  // 같은 SDK 인스턴스의 표시·정리 작업을 직렬화하여 중복 화면과 남아 있는 위젯을 방지합니다.
  function enqueue(action: () => Promise<void>) {
    const previous = queues.get(widgets) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(action)
    // 대기열은 계속 이어지도록 유지하되 실제 작업의 오류는 호출한 쪽에 전달합니다.
    const tail = next.then(() => {}, () => {})
    queues.set(widgets, tail)
    void tail.then(() => { if (queues.get(widgets) === tail) queues.delete(widgets) })
    return next
  }

  // 약관과 결제수단을 역순으로 제거합니다. 정리에 실패한 인스턴스는 다시 표시하지 않아 화면 충돌을 막습니다.
  async function cleanup() {
    const handles = [agreement, payment]
    agreement = undefined
    payment = undefined
    let failed = false
    for (const handle of handles) {
      try { await handle?.destroy() } catch { failed = true }
    }
    if (failed) {
      cleanupFailed.add(widgets)
      throw new OrderWidgetRenderingError('cleanup')
    }
  }

  const ready = enqueue(async () => {
    if (disposed) return
    if (cleanupFailed.has(widgets)) throw new OrderWidgetRenderingError('cleanup')
    let stage: 'payment' | 'agreement' = 'payment'
    try {
      // 결제수단을 먼저 표시하고 화면 종료 요청이 없을 때만 약관을 이어서 표시합니다.
      payment = await widgets.renderPaymentMethods({ selector: selectors.payment })
      if (!disposed) {
        stage = 'agreement'
        agreement = await widgets.renderAgreement({ selector: selectors.agreement })
      }
      // 표시 도중 화면을 떠났다면 늦게 만들어진 위젯도 정리해 다음 표시 작업과 겹치지 않게 합니다.
      if (disposed) await cleanup()
    } catch (error) {
      await cleanup()
      if (error instanceof OrderWidgetRenderingError) throw error
      // 외부 SDK 오류에 개인 설정이 포함될 수 있으므로 단계별 고정 안내만 표시합니다.
      throw new OrderWidgetRenderingError(stage)
    }
  })

  return {
    ready,
    // 여러 번 정리 요청을 받아도 하나의 정리 작업만 실행합니다.
    dispose() {
      disposed = true
      return disposal ??= enqueue(cleanup)
    },
  }
}
