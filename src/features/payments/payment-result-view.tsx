'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDevTestOrder } from './dev-test-orders'
import { PAYMENT_ATTEMPT_KEY, readFailure, readSuccess } from './payment-result'

export default function PaymentResultView({ outcome }: { outcome: 'success' | 'fail' }) {
  const [message, setMessage] = useState('인증 결과를 확인하고 있습니다.')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function check() {
      try {
        const params = new URLSearchParams(window.location.search)
        if (outcome === 'fail') {
          const failure = readFailure(params)
          if (active) setMessage(`${failure.message} (${failure.code})`)
          return
        }
        const expected = readSuccess(params, sessionStorage.getItem(PAYMENT_ATTEMPT_KEY))
        const saved = await getDevTestOrder(expected.orderId, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
        if (saved.amount !== expected.amount || saved.orderName !== expected.orderName || saved.orderId !== expected.orderId)
          throw new Error('Order mismatch')
        if (active) setMessage('인증 성공 URL에 도착했고 서버 주문과 금액이 일치합니다. 최종 승인은 실행하지 않았습니다. 결제 완료가 아닙니다.')
      } catch {
        if (active) setMessage('인증 결과를 확인할 수 없습니다. 주문 만료·누락·금액 불일치 또는 네트워크 오류를 확인하세요. 최종 승인은 실행하지 않았습니다.')
      }
    }
    void check()
    return () => { active = false; controller.abort() }
  }, [outcome])
  return <section>
    <h1>{outcome === 'success' ? '테스트 결제 인증 결과' : '테스트 결제 인증 실패'}</h1>
    <p role="status">{message}</p>
    <p>이 화면의 URL 값만으로 토스 인증의 진위를 확정하거나 주문을 결제 완료로 변경하지 않습니다.</p>
    <Link href="/dev/toss-order">테스트 주문 화면으로 돌아가기</Link>
  </section>
}
