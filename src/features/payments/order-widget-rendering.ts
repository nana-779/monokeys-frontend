type Widget = { destroy: () => Promise<void> }
export type OrderWidgetRenderer = {
  renderPaymentMethods: (options: { selector: string }) => Promise<Widget>
  renderAgreement: (options: { selector: string }) => Promise<Widget>
}

export class OrderWidgetRenderingError extends Error {
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

// The SDK instance is shared. Finish pending rendering and disposal before mounting again.
const queues = new WeakMap<object, Promise<void>>()
const cleanupFailed = new WeakSet<object>()
export function mountOrderWidgets(
  widgets: OrderWidgetRenderer,
  selectors: { payment: string; agreement: string },
) {
  let disposed = false
  let payment: Widget | undefined
  let agreement: Widget | undefined
  let disposal: Promise<void> | undefined

  function enqueue(action: () => Promise<void>) {
    const previous = queues.get(widgets) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(action)
    // Keep a fulfilled queue tail; callers still receive the original operation's error.
    const tail = next.then(() => {}, () => {})
    queues.set(widgets, tail)
    void tail.then(() => { if (queues.get(widgets) === tail) queues.delete(widgets) })
    return next
  }

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
      payment = await widgets.renderPaymentMethods({ selector: selectors.payment })
      if (!disposed) {
        stage = 'agreement'
        agreement = await widgets.renderAgreement({ selector: selectors.agreement })
      }
      if (disposed) await cleanup()
    } catch (error) {
      await cleanup()
      if (error instanceof OrderWidgetRenderingError) throw error
      // SDK error text can contain private configuration; expose only a fixed stage message.
      throw new OrderWidgetRenderingError(stage)
    }
  })

  return {
    ready,
    dispose() {
      disposed = true
      return disposal ??= enqueue(cleanup)
    },
  }
}
