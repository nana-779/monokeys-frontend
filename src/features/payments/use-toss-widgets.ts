'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import { initializeTossWidgets } from './toss-sdk'
import { WidgetsInitializationError } from './widgets-initializer'

type WidgetsState =
  | { status: 'loading'; widgets: null; message: null }
  | { status: 'ready'; widgets: TossPaymentsWidgets; message: null }
  | { status: 'error'; widgets: null; message: string }

// 공유 SDK 초기화 결과를 화면 상태로 바꾸는 훅입니다. 화면이 사라진 뒤에는 이전 비동기 응답으로 상태를 갱신하지 않습니다.
export function useTossWidgets() {
  const [state, setState] = useState<WidgetsState>({
    status: 'loading',
    widgets: null,
    message: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    initializeTossWidgets().then(
      (widgets) => {
        if (active) setState({ status: 'ready', widgets, message: null })
      },
      (error: unknown) => {
        if (!active) return
        const message =
          error instanceof WidgetsInitializationError
            ? error.message
            : 'SDK 초기화 상태를 확인하지 못했습니다. 다시 시도해 주세요.'
        setState({ status: 'error', widgets: null, message })
      },
    )
    // 공유 초기화는 유지하되 이전 마운트의 상태 갱신은 차단합니다.
    return () => {
      active = false
    }
  }, [attempt])

  // 사용자가 재시도를 선택하면 로딩 상태로 되돌리고 초기화 흐름을 다시 시작합니다.
  const retry = useCallback(() => {
    setState({ status: 'loading', widgets: null, message: null })
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
