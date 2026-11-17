'use client'

import { useTossWidgets } from './use-toss-widgets'
import TestOrderCheck from './test-order-check'

// 초기화 상태와 재시도 버튼을 표시하며, 위젯 준비가 끝난 경우에만 개발 주문 화면을 엽니다.
export default function SdkInitializationCheck({
  includeTestOrder = false,
}: {
  includeTestOrder?: boolean
}) {
  const state = useTossWidgets()
  return (
    <section>
      <h1>토스 SDK 초기화 확인</h1>
      <p role="status">
        {state.status === 'loading' && 'SDK 초기화 중입니다.'}
        {state.status === 'ready' && 'SDK 로드 및 비회원 위젯 인스턴스 생성에 성공했습니다.'}
        {state.status === 'error' && state.message}
      </p>
      {state.status === 'error' && (
        <button onClick={state.retry} type="button">
          다시 시도
        </button>
      )}
      {includeTestOrder && state.status === 'ready' && <TestOrderCheck widgets={state.widgets} />}
    </section>
  )
}
