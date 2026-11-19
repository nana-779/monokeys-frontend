import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWidgetsInitializer, WidgetsInitializationError } from './widgets-initializer'

const fixtureKey = 'test_gck_fixture_only'
function fixture() {
  const counts = { load: 0, widgets: 0, clear: 0 }
  const widget = { initialized: true }
  const sdk = {
    widgets: (options: { customerKey: string }) => {
      assert.equal(options.customerKey, 'anonymous-fixture')
      counts.widgets++
      return widget
    },
  }
  const options = {
    isClient: () => true,
    readClientKey: (): string | undefined => fixtureKey,
    anonymousCustomerKey: 'anonymous-fixture',
    load: async (_key: string) => {
      counts.load++
      return sdk
    },
    clear: () => {
      counts.clear++
    },
    timeoutMs: 50,
  }
  return { counts, widget, sdk, options }
}

test('server use and missing keys never call SDK', async () => {
  const f = fixture()
  await assert.rejects(createWidgetsInitializer({ ...f.options, isClient: () => false })(), {
    code: 'CLIENT_ONLY',
  })
  await assert.rejects(
    createWidgetsInitializer({ ...f.options, readClientKey: () => undefined })(),
    { code: 'MISSING_KEY' },
  )
  assert.equal(f.counts.load, 0)
})

test('client key validation rejects live, individual and secret key kinds', async () => {
  const f = fixture()
  for (const key of [
    'live_gck_fixture',
    'test_ck_fixture',
    'test_gsk_fixture',
    'test_sk_fixture',
    'test_gck_',
    ' test_gck_fixture',
  ]) {
    await assert.rejects(createWidgetsInitializer({ ...f.options, readClientKey: () => key })(), {
      code: 'INVALID_KEY',
    })
  }
  assert.equal(f.counts.load, 0)
})

test('concurrent Strict Mode-like consumers and later calls share one instance', async () => {
  const f = fixture()
  const initialize = createWidgetsInitializer(f.options)
  const first = initialize()
  assert.equal(initialize(), first)
  assert.equal(await first, f.widget)
  assert.equal(await initialize(), f.widget)
  assert.deepEqual(f.counts, { load: 1, widgets: 1, clear: 0 })
})

test('load failure is sanitized and retry clears the failed cache', async () => {
  const f = fixture()
  let fail = true
  const initialize = createWidgetsInitializer({
    ...f.options,
    load: async () => {
      f.counts.load++
      if (fail) throw new Error(fixtureKey)
      return f.sdk
    },
  })
  await assert.rejects(initialize(), (error: unknown) => {
    assert.ok(error instanceof WidgetsInitializationError)
    assert.equal(error.code, 'LOAD_FAILED')
    assert.equal(error.message.includes(fixtureKey), false)
    return true
  })
  fail = false
  assert.equal(await initialize(), f.widget)
  assert.deepEqual(f.counts, { load: 2, widgets: 1, clear: 1 })
})

test('synchronous SDK or widgets errors become safe failures', async () => {
  const f = fixture()
  const loadThrow = createWidgetsInitializer({
    ...f.options,
    load: () => {
      throw new Error(fixtureKey)
    },
  })
  await assert.rejects(loadThrow(), { code: 'LOAD_FAILED' })
  const widgetsThrow = createWidgetsInitializer({
    ...f.options,
    load: async () => ({
      widgets: () => {
        throw new Error(fixtureKey)
      },
    }),
  })
  await assert.rejects(widgetsThrow(), { code: 'LOAD_FAILED' })
})

test('timeout rejects, cleans up and never creates a widget from a late response', async () => {
  const f = fixture()
  let release: (sdk: typeof f.sdk) => void = () => {}
  const initialize = createWidgetsInitializer({
    ...f.options,
    timeoutMs: 5,
    load: () =>
      new Promise<typeof f.sdk>((resolve) => {
        release = resolve
      }),
  })
  await assert.rejects(initialize(), { code: 'TIMEOUT' })
  release(f.sdk)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(f.counts.widgets, 0)
  assert.equal(f.counts.clear, 1)
})

test('cleanup failure does not replace the initialization failure', async () => {
  const f = fixture()
  const initialize = createWidgetsInitializer({
    ...f.options,
    load: async () => {
      throw new Error('offline')
    },
    clear: () => {
      throw new Error('cleanup failed')
    },
  })
  await assert.rejects(initialize(), { code: 'LOAD_FAILED' })
})
