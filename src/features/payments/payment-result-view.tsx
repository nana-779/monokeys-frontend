'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getDevTestOrder } from './dev-test-orders'
import { confirmDevPayment } from './payment-confirmation-api'
import { PAYMENT_ATTEMPT_KEY, PAYMENT_RESULT_REVIEW_KEY, readFailure } from './payment-result'
import { confirmationReview, createResultFlow, phaseMessage, resultBusy, resultCanRetry, resultHeading, type ResultState } from './payment-result-flow'

const checkResult = createResultFlow(getDevTestOrder, confirmDevPayment)
export default function PaymentResultView({ outcome }: { outcome: 'success' | 'fail' }) {
  const [result, setResult] = useState<ResultState>({ phase: 'validating', message: phaseMessage('validating') })
  const [attempt, setAttempt] = useState(0)
  const [retryReady, setRetryReady] = useState(false)
  const retryPending = useRef(false)
  useEffect(() => {
    let active = true
    retryPending.current = true
    setResult({ phase: 'validating', message: phaseMessage('validating') })
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
        try { review = sessionStorage.getItem(PAYMENT_RESULT_REVIEW_KEY) } catch { /* Optional retry hint. */ }
        const checked = await checkResult(params, requested, {
          review,
          onProgress: (value) => { if (active) setResult(value) },
          onSubmitting: (order) => {
            try { sessionStorage.setItem(PAYMENT_RESULT_REVIEW_KEY, confirmationReview(order)) } catch { /* Never store paymentKey. */ }
          },
        })
        if (active) setResult(checked)
      } catch {
        if (active) setResult({ phase: 'invalid-result', message: phaseMessage('invalid-result') })
      } finally { if (active) retryPending.current = false }
    }
    void check()
    // Unmounting a subscriber must not abort a shared approval or classify it as failed.
    return () => { active = false }
  }, [outcome, attempt])

  useEffect(() => {
    setRetryReady(false)
    if (outcome !== 'success' || !resultCanRetry(result)) return
    // Manual retry only, with a minimum pause; no automatic approval polling.
    const timer = setTimeout(() => setRetryReady(true), 3000)
    return () => clearTimeout(timer)
  }, [outcome, result.phase, attempt])

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
