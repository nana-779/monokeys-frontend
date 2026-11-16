'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import { mountOrderWidgets, OrderWidgetRenderingError } from './order-widget-rendering'
import { createDevTestOrder, getDevTestOrder } from './dev-test-orders'
import { prepareTestOrder, type DevTestOrder } from './test-order-preparation'
import { createPaymentRequester, paymentErrorMessage } from './payment-request'
import { PAYMENT_ATTEMPT_KEY } from './payment-result'

type State =
  | { status: 'idle' | 'loading' | 'error'; message: string }
  | { status: 'ready'; order: DevTestOrder }
export default function TestOrderCheck({ widgets }: { widgets: TossPaymentsWidgets }) {
  const [state, setState] = useState<State>({ status: 'idle', message: '' })
  const [widgetState, setWidgetState] = useState({ status: 'idle', message: '' })
  const [paying, setPaying] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')
  const paymentPending = useRef<AbortController | null>(null)
  const requestPayment = useRef(createPaymentRequester({
    find: getDevTestOrder,
    request: (value) => widgets.requestPayment(value),
    remember: (value) => sessionStorage.setItem(PAYMENT_ATTEMPT_KEY, JSON.stringify(value)),
  }))
  const widgetId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const paymentSelector = '#toss-payment-' + widgetId
  const agreementSelector = '#toss-agreement-' + widgetId
  const order = state.status === 'ready' ? state.order : null
  useEffect(() => {
    if (!order) return
    let active = true
    setWidgetState({ status: 'loading', message: '결제수단 및 결제 약관 UI를 표시하고 있습니다.' })
    const rendering = mountOrderWidgets(widgets, { payment: paymentSelector, agreement: agreementSelector })
    rendering.ready.then(
      () => { if (active) setWidgetState({ status: 'ready', message: '결제수단 및 결제 약관 UI 표시 완료' }) },
      (error: unknown) => {
        if (active) setWidgetState({ status: 'error', message: error instanceof OrderWidgetRenderingError
          ? error.message : '결제 UI를 표시하지 못했습니다. 페이지를 새로고침해 주세요.' })
      },
    )
    return () => { active = false; void rendering.dispose().catch(() => {}) }
  }, [widgets, order, paymentSelector, agreementSelector])
  const pending = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.abort()
      paymentPending.current?.abort()
    }
  }, [])

  async function prepare() {
    if (pending.current || paymentPending.current) return
    setPaymentMessage('')
    setWidgetState({ status: 'idle', message: '' })
    const controller = new AbortController()
    pending.current = controller
    const timeout = setTimeout(() => controller.abort(), 20000)
    setState({ status: 'loading', message: '테스트 주문 생성·조회 및 위젯 금액 설정 중입니다.' })
    try {
      const order = await prepareTestOrder(
        widgets,
        {
          create: () => createDevTestOrder(controller.signal),
          find: (id) => getDevTestOrder(id, controller.signal),
        },
        controller.signal,
      )
      if (mounted.current && !controller.signal.aborted) setState({ status: 'ready', order })
    } catch {
      // 서버 원문/SDK 내부 오류에 키 등 민감 정보가 있을 수 있어 표시하지 않습니다.
      if (mounted.current && pending.current === controller)
        setState({
          status: 'error',
          message: '준비에 실패했습니다. 개발 주문 활성화 설정과 서버·네트워크 상태를 확인하세요.',
        })
    } finally {
      clearTimeout(timeout)
      if (pending.current === controller) pending.current = null
    }
  }
  async function pay() {
    if (paymentPending.current || pending.current || !order) return
    const controller = new AbortController()
    paymentPending.current = controller
    setPaying(true)
    setPaymentMessage('서버 주문 확인 및 테스트 결제 인증을 요청하고 있습니다.')
    try {
      await requestPayment.current({ order, ready: widgetState.status === 'ready',
        clientKey: process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY,
        origin: window.location.origin, signal: controller.signal })
      if (mounted.current) setPaymentMessage('결과 화면으로 이동하지 않았다면 다시 결제하지 말고 기존 결제 인증 결과를 확인해 주세요.')
    } catch (error) {
      if (mounted.current) setPaymentMessage(paymentErrorMessage(error))
    } finally {
      paymentPending.current = null
      if (mounted.current) setPaying(false)
    }
  }
  return (
    <section>
      <h2>개발 테스트 주문 준비</h2>
      <button type="button" disabled={state.status === 'loading' || paying} onClick={prepare}>
        테스트 주문 생성 및 금액 설정
      </button>
      <p role="status">
        {state.status === 'ready' ? '테스트 주문 조회 및 위젯 금액 설정 완료' : state.message}
      </p>
      {state.status === 'ready' && (
        <dl>
          <dt>주문번호</dt>
          <dd>{state.order.orderId}</dd>
          <dt>상품명</dt>
          <dd>{state.order.orderName}</dd>
          <dt>금액</dt>
          <dd>{state.order.amount.toLocaleString('ko-KR')} KRW</dd>
          <dt>상태</dt>
          <dd>{state.order.status}</dd>
        </dl>
      )}
      <section hidden={state.status !== 'ready'} aria-label="테스트 결제 위젯">
        <h3>결제수단</h3>
        <div id={paymentSelector.slice(1)} />
        <h3>결제 약관</h3>
        <div id={agreementSelector.slice(1)} />
        <p role={widgetState.status === 'error' ? 'alert' : 'status'}>{widgetState.message}</p>
        <button type="button" onClick={pay} disabled={paying || state.status !== 'ready' || widgetState.status !== 'ready'}>
          {paying ? '테스트 결제 인증 요청 중…' : '테스트 결제하기'}
        </button>
        <p role="status">{paymentMessage}</p>
      </section>
      <p>
        테스트 주문은 30분 후 만료되며 서버 재시작 시 삭제됩니다. 인증 성공 화면에서 백엔드 승인 API를 호출합니다. 결과가 불확실하면 새 결제를 요청하지 말고 기존 결과를 확인해 주세요.
      </p>
    </section>
  )
}
