'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import { initializeTossWidgets } from './toss-sdk'
import { WidgetsInitializationError } from './widgets-initializer'

type WidgetsState =
  | { status: 'loading'; widgets: null; message: null }
  | { status: 'ready'; widgets: TossPaymentsWidgets; message: null }
  | { status: 'error'; widgets: null; message: string }

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

  const retry = useCallback(() => {
    setState({ status: 'loading', widgets: null, message: null })
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
