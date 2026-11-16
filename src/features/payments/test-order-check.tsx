'use client'

import { useEffect, useRef, useState } from 'react'
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import { createDevTestOrder, getDevTestOrder } from './dev-test-orders'
import { prepareTestOrder, type DevTestOrder } from './test-order-preparation'

type State =
  | { status: 'idle' | 'loading' | 'error'; message: string }
  | { status: 'ready'; order: DevTestOrder }
export default function TestOrderCheck({ widgets }: { widgets: TossPaymentsWidgets }) {
  const [state, setState] = useState<State>({ status: 'idle', message: '' })
  const pending = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.abort()
    }
  }, [])

  async function prepare() {
    if (pending.current) return
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
  // 타임아웃/언마운트 후에도 SDK 작업이 진행 중일 수 있어 동일 인스턴스의 후속 변경은 직렬화합니다.
  return (
    <section>
      <h2>개발 테스트 주문 준비</h2>
      <button type="button" disabled={state.status === 'loading'} onClick={prepare}>
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
      <p>
        테스트 주문은 30분 후 만료되며 서버 재시작 시 삭제됩니다. 실제 결제는 진행하지 않습니다.
      </p>
    </section>
  )
}
