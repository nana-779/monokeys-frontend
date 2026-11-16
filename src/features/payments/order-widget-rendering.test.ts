import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountOrderWidgets, OrderWidgetRenderingError } from './order-widget-rendering'

const selectors = { payment: '#payment', agreement: '#agreement' }
test('renders official methods and agreement and disposes both exactly once', async () => {
  const calls: string[] = []
  const mounted = mountOrderWidgets({
    renderPaymentMethods: async ({ selector }) => {
      calls.push(selector)
      return { destroy: async () => { calls.push('payment destroyed') } }
    },
    renderAgreement: async ({ selector }) => {
      calls.push(selector)
      return { destroy: async () => { calls.push('agreement destroyed') } }
    },
  }, selectors)
  await mounted.ready
  await Promise.all([mounted.dispose(), mounted.dispose()])
  assert.deepEqual(calls, ['#payment', '#agreement', 'agreement destroyed', 'payment destroyed'])
})

test('Strict Mode cleanup before rendering creates no stale widgets', async () => {
  let renders = 0
  const widgets = {
    renderPaymentMethods: async () => { renders++; return { destroy: async () => {} } },
    renderAgreement: async () => { renders++; return { destroy: async () => {} } },
  }
  const stale = mountOrderWidgets(widgets, selectors)
  const disposal = stale.dispose()
  const current = mountOrderWidgets(widgets, selectors)
  await Promise.all([stale.ready, disposal, current.ready])
  assert.equal(renders, 2)
  await current.dispose()
})

test('late render is destroyed before a replacement mounts', async () => {
  const calls: string[] = []
  let finish!: () => void
  let started!: () => void
  const begun = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { finish = resolve })
  let count = 0
  const widgets = {
    renderPaymentMethods: async () => {
      const id = ++count
      calls.push('start ' + id)
      if (id === 1) { started(); await gate }
      return { destroy: async () => { calls.push('destroy ' + id) } }
    },
    renderAgreement: async () => ({ destroy: async () => {} }),
  }
  const stale = mountOrderWidgets(widgets, selectors)
  await begun
  const disposal = stale.dispose()
  const current = mountOrderWidgets(widgets, selectors)
  finish()
  await Promise.all([stale.ready, disposal, current.ready])
  assert.deepEqual(calls, ['start 1', 'destroy 1', 'start 2'])
  await current.dispose()
})

for (const stage of ['payment', 'agreement'] as const) {
  test(stage + ' failure is sanitized and partial widgets are cleaned before retry', async () => {
    let failing = true
    let destroyed = 0
    const widgets = {
      renderPaymentMethods: async () => {
        if (failing && stage === 'payment') throw new Error('private SDK detail')
        return { destroy: async () => { destroyed++ } }
      },
      renderAgreement: async () => {
        if (failing) throw new Error('private SDK detail')
        return { destroy: async () => { destroyed++ } }
      },
    }
    const first = mountOrderWidgets(widgets, selectors)
    await assert.rejects(first.ready, (error: unknown) => {
      assert.ok(error instanceof OrderWidgetRenderingError)
      assert.equal(error.stage, stage)
      assert.ok(!error.message.includes('private SDK detail'))
      return true
    })
    assert.equal(destroyed, stage === 'agreement' ? 1 : 0)
    await first.dispose()
    failing = false
    const second = mountOrderWidgets(widgets, selectors)
    await second.ready
    await second.dispose()
  })
}

test('failed destroy blocks duplicate rendering until a page reload', async () => {
  let renders = 0
  const widgets = {
    renderPaymentMethods: async () => {
      renders++
      return { destroy: async () => { throw new Error('private') } }
    },
    renderAgreement: async () => ({ destroy: async () => {} }),
  }
  const first = mountOrderWidgets(widgets, selectors)
  await first.ready
  await assert.rejects(first.dispose(), { stage: 'cleanup' })
  const second = mountOrderWidgets(widgets, selectors)
  await assert.rejects(second.ready, { stage: 'cleanup' })
  assert.equal(renders, 1)
  await second.dispose()
})
