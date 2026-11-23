'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getDevTestOrder } from './dev-test-orders'
import { confirmDevPayment } from './payment-confirmation-api'
import { PAYMENT_ATTEMPT_KEY, PAYMENT_RESULT_REVIEW_KEY, readFailure } from './payment-result'
import { confirmationReview, createResultFlow, phaseMessage, resultBusy, resultCanRetry, resultHeading, type ResultState } from './payment-result-flow'

const checkResult = createResultFlow(getDevTestOrder, confirmDevPayment)
// 성공·실패 페이지가 공유하는 결과 화면입니다. 성공 콜백은 서버 승인까지 확인하고 실패 콜백은 승인 API를 호출하지 않습니다.
export default function PaymentResultView({ outcome }: { outcome: 'success' | 'fail' }) {
  const [result, setResult] = useState<ResultState>({ phase: 'validating', message: phaseMessage('validating') })
  const [attempt, setAttempt] = useState(0)
  const [retryReady, setRetryReady] = useState(false)
  const retryPending = useRef(false)
  useEffect(() => {
    let active = true
    retryPending.current = true
    setResult({ phase: 'validating', message: phaseMessage('validating') })
    // 콜백 주소와 저장된 주문을 읽어 검증 흐름에 전달하고, 현재 화면에 연결된 경우에만 결과를 표시합니다.
    async function check() {
      try {
        const params = new URLSearchParams(window.location.search)
        if (outcome === 'fail') {
          const failure = readFailure(params)
          if (active) setResult({ phase: 'invalid-result', message: `${failure.message} (${failure.code})` })
          return
        }
        const requested = sessionStorage.getItem(PAYMENT_ATTEMPT_KEY)
        let review: string | null = null
        try { review = sessionStorage.getItem(PAYMENT_RESULT_REVIEW_KEY) } catch { /* 재확인용 기록을 읽지 못해도 서버 검증은 계속 필요합니다. */ }
        const checked = await checkResult(params, requested, {
          review,
          onProgress: (value) => { if (active) setResult(value) },
          onSubmitting: (order) => {
            try { sessionStorage.setItem(PAYMENT_RESULT_REVIEW_KEY, confirmationReview(order)) } catch { /* 이 기록에는 결제 키를 저장하지 않습니다. */ }
          },
        })
        if (active) setResult(checked)
      } catch {
        if (active) setResult({ phase: 'invalid-result', message: phaseMessage('invalid-result') })
      } finally { if (active) retryPending.current = false }
    }
    void check()
    // 화면이 사라져도 공유 승인 요청을 취소하거나 실패로 단정하지 않습니다.
    return () => { active = false }
  }, [outcome, attempt])

  useEffect(() => {
    setRetryReady(false)
    if (outcome !== 'success' || !resultCanRetry(result)) return
    // 최소 대기 후 수동 재확인만 허용하며 승인 요청을 자동으로 반복하지 않습니다.
    const timer = setTimeout(() => setRetryReady(true), 3000)
    return () => clearTimeout(timer)
  }, [outcome, result.phase, attempt])

  // 짧은 대기 후 같은 요청의 상태를 수동으로 확인합니다. 연속 클릭과 처리 중 재요청을 막습니다.
  function retry() {
    if (!retryReady || retryPending.current || resultBusy(result)) return
    retryPending.current = true
    setRetryReady(false)
    setAttempt((value) => value + 1)
  }
  const busy = resultBusy(result)
  return <section aria-busy={busy}>
    <h1>{resultHeading(outcome, result)}</h1>
    <p role={busy || result.phase === 'approved' || result.phase === 'waiting-for-deposit' ? 'status' : 'alert'} aria-live="polite">{result.message}</p>
    <p>이 화면의 URL 값만으로 결제 완료를 판단하지 않습니다. 서버에서 확인한 최종 승인 결과만 표시합니다.</p>
    {outcome === 'success' && resultCanRetry(result) && (
      <button type="button" disabled={!retryReady || busy} onClick={retry}>
        같은 요청 상태 다시 확인
      </button>
    )}
    <Link href="/dev/toss-order">테스트 주문 화면으로 돌아가기</Link>
  </section>
}
