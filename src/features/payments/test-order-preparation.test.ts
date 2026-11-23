import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareTestOrder, validateDevOrder, type DevTestOrder } from './test-order-preparation'
const order: DevTestOrder = {
  orderId: 'dev_' + 'a'.repeat(32),
  orderName: '테스트',
  amount: 10000,
  currency: 'KRW',
  status: 'PENDING',
}
const source = { create: async () => order, find: async () => ({ ...order }) }
test('server create and lookup precede KRW SDK amount setup', async () => {
  const amounts: unknown[] = []
  const result = await prepareTestOrder(
    {
      setAmount: async (amount) => {
        amounts.push(amount)
      },
    },
    source,
    new AbortController().signal,
  )
  assert.deepEqual(result, order)
  assert.deepEqual(amounts, [{ currency: 'KRW', value: 10000 }])
})
test('malformed orders, decimals and invalid status are rejected', () => {
  for (const patch of [
    { amount: 1.1 },
    { amount: 0 },
    { amount: -1 },
    { amount: '10000' },
    { currency: 'USD' },
    { status: 'PAID' },
    { orderId: 'bad' },
    { orderName: '' },
  ]) {
    assert.throws(() => validateDevOrder({ ...order, ...patch }))
  }
})
test('creation or lookup errors never call SDK', async () => {
  let calls = 0
  const widgets = {
    setAmount: async () => {
      calls++
    },
  }
  await assert.rejects(
    prepareTestOrder(
      widgets,
      {
        ...source,
        create: async () => {
          throw Error('network')
        },
      },
      new AbortController().signal,
    ),
  )
  await assert.rejects(
    prepareTestOrder(
      widgets,
      {
        ...source,
        find: async () => {
          throw Error('404')
        },
      },
      new AbortController().signal,
    ),
  )
  assert.equal(calls, 0)
})
test('changed order amount never calls SDK', async () => {
  let calls = 0
  await assert.rejects(
    prepareTestOrder(
      {
        setAmount: async () => {
          calls++
        },
      },
      { ...source, find: async () => ({ ...order, amount: 20000 }) },
      new AbortController().signal,
    ),
  )
  assert.equal(calls, 0)
})
test('SDK failure does not resolve as ready; retry works', async () => {
  let calls = 0
  const widgets = {
    setAmount: async () => {
      if (calls++ === 0) throw Error('SDK')
    },
  }
  await assert.rejects(prepareTestOrder(widgets, source, new AbortController().signal))
  assert.deepEqual(await prepareTestOrder(widgets, source, new AbortController().signal), order)
})
test('abort blocks late completion and hanging SDK is not ready', async () => {
  let finish!: () => void
  const controller = new AbortController()
  const pending = prepareTestOrder(
    {
      setAmount: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    },
    source,
    controller.signal,
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  controller.abort()
  await assert.rejects(pending)
  finish()
})
test('shared widget amount calls are serialized', async () => {
  let active = 0,
    max = 0
  const widgets = {
    setAmount: async () => {
      active++
      max = Math.max(active, max)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active--
    },
  }
  await Promise.all([
    prepareTestOrder(widgets, source, new AbortController().signal),
    prepareTestOrder(widgets, source, new AbortController().signal),
  ])
  assert.equal(max, 1)
})
