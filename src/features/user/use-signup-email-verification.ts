'use client'

import { useEffect, useRef, useState } from 'react'
import { sendSignupEmailCode, verifySignupEmailCode } from '@/features/user/api'
import { ApiRequestError } from '@/lib/api-client'

type Challenge = { id: string; expiresAt: number }
type Proof = { email: string; token: string; expiresAt: number }
type Feedback = { text: string; error?: boolean }
type Action = 'send' | 'verify'

const FALLBACK_WAIT_SECONDS = 60
const REQUEST_TIMEOUT_MS = 15_000

function secondsLeft(until: number, now: number) {
  return Math.max(0, Math.ceil((until - now) / 1000))
}

// 서버 오류 코드를 확인해 잘못된 번호, 인증 처리 중, 일시 장애를 서로 다르게 안내합니다.
function errorMessage(cause: unknown, action: Action) {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 400) {
      return cause.code === 'INVALID_OR_EXPIRED_CODE'
        ? '인증번호가 맞지 않거나 만료됐습니다. 번호를 확인해 주세요.'
        : '이메일 주소와 입력한 인증 정보를 확인해 주세요.'
    }
    if (cause.status === 403) return '이메일 인증을 진행할 수 없습니다. 이메일을 확인하고 다시 시도해 주세요.'
    if (cause.status === 409) return '이메일 인증을 사용한 요청을 처리 중입니다. 잠시 후 다시 확인해 주세요.'
    if (cause.status === 429) {
      return cause.retryAfterSeconds === undefined
        ? '요청 제한에 도달했습니다. 1분 뒤에 다시 시도해 주세요.'
        : '요청 제한에 도달했습니다. 표시된 대기 시간 뒤에 다시 시도해 주세요.'
    }
    if (cause.status === 503 && cause.code === 'EMAIL_VERIFICATION_UNAVAILABLE') {
      return '지금은 이메일 인증을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
    }
  }
  return action === 'send'
    ? '인증번호 발송 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    : '인증 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export function useSignupEmailVerification(email: string, available: boolean) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [code, setCode] = useState('')
  // 가입 증명은 이 화면의 React 메모리에만 두고 브라우저 저장소에 기록하지 않습니다.
  const [proof, setProof] = useState<Proof | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [verifyRetryAt, setVerifyRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const [pending, setPending] = useState<Action | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const request = useRef<AbortController | null>(null)

  // 상태가 아직 다시 그려지기 전의 중복 클릭도 막고, 화면을 떠날 때 진행 중인 요청을 취소합니다.
  useEffect(() => () => {
    request.current?.abort()
    request.current = null
  }, [])

  // 실제 시각과 만료 시각을 비교해 탭이 잠시 비활성화되어도 대기 시간이 밀리지 않게 합니다.
  useEffect(() => {
    const lastDeadline = Math.max(challenge?.expiresAt ?? 0, proof?.expiresAt ?? 0, resendAt, verifyRetryAt)
    if (!lastDeadline) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (proof && current >= proof.expiresAt) {
        setProof(null)
        setFeedback({ text: '가입 인증이 만료됐습니다. 인증번호를 다시 받아 주세요.', error: true })
      }
      if (current >= lastDeadline) window.clearInterval(timer)
    }, 250)
    return () => window.clearInterval(timer)
  }, [challenge, proof, resendAt, verifyRetryAt])

  const verified = proof?.email === email && proof.expiresAt > now
  const codeSeconds = secondsLeft(challenge?.expiresAt ?? 0, now)
  const resendSeconds = secondsLeft(resendAt, now)
  const verifyRetrySeconds = secondsLeft(verifyRetryAt, now)
  const canSend = available && !verified && pending === null && resendSeconds === 0
  const canVerify = available && !verified && pending === null && codeSeconds > 0
    && verifyRetrySeconds === 0 && /^[0-9]{6}$/.test(code)

  function reset() {
    // 취소 신호와 요청 객체 교체를 함께 사용해 취소 직전에 받은 응답도 새 이메일에 반영하지 않습니다.
    request.current?.abort()
    request.current = null
    setChallenge(null)
    setCode('')
    setProof(null)
    setResendAt(0)
    setVerifyRetryAt(0)
    setPending(null)
    setFeedback(null)
  }

  function clearProof(text: string) {
    setProof(null)
    setFeedback({ text, error: true })
  }

  function getValidToken() {
    // 타이머 간격과 무관하게 실제 제출 시점의 주소와 만료 시각을 다시 확인합니다.
    return proof?.email === email && proof.expiresAt > Date.now() ? proof.token : null
  }

  async function run(action: Action, operation: (signal: AbortSignal, startedAt: number) => Promise<void>) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setPending(action)
    setFeedback(null)
    try {
      await operation(AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]), Date.now())
    } catch (cause) {
      if (request.current !== controller) return
      const current = Date.now()
      setNow(current)
      if (cause instanceof ApiRequestError && cause.status === 429) {
        const until = current + (cause.retryAfterSeconds ?? FALLBACK_WAIT_SECONDS) * 1000
        const setRetryAt = action === 'send' ? setResendAt : setVerifyRetryAt
        setRetryAt((previous) => Math.max(previous, until))
      } else if (action === 'send' && (!(cause instanceof ApiRequestError)
          || cause.code === 'EMAIL_SEND_FAILED' || cause.status >= 500)) {
        // 발송 결과가 불확실하면 재발급 중 이전 번호가 폐기됐을 수 있어 사용하지 않습니다.
        setChallenge(null)
        setCode('')
        setResendAt((previous) => Math.max(previous, current + FALLBACK_WAIT_SECONDS * 1000))
      }
      setFeedback({ text: errorMessage(cause, action), error: true })
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(null)
      }
    }
  }

  function send() {
    if (!canSend || Date.now() < resendAt) return
    return run('send', async (signal, startedAt) => {
      const result = await sendSignupEmailCode(email, signal)
      if (signal.aborted) return
      // 서버는 메일을 보내기 전에 번호를 발급하므로 요청 시작을 기준으로 시간을 계산합니다.
      setNow(Date.now())
      setChallenge({ id: result.challengeId, expiresAt: startedAt + result.expiresInSeconds * 1000 })
      setResendAt(startedAt + result.resendAfterSeconds * 1000)
      setCode('')
      setFeedback({ text: '인증번호를 발송했습니다. 메일을 확인해 주세요.' })
    })
  }

  function verify() {
    if (!canVerify || !challenge || challenge.expiresAt <= Date.now() || Date.now() < verifyRetryAt) return
    return run('verify', async (signal, startedAt) => {
      const result = await verifySignupEmailCode(email, challenge.id, code, signal)
      if (signal.aborted) return
      setNow(Date.now())
      setProof({ email, token: result.verificationToken, expiresAt: startedAt + result.expiresInSeconds * 1000 })
      setChallenge(null)
      setCode('')
      setFeedback({ text: '이메일 인증이 완료되었습니다.' })
    })
  }

  return {
    canSend, canVerify, challenge, clearProof, code, codeSeconds, feedback, getValidToken, pending, resendSeconds,
    reset, send, setCode, verified, verify, verifyRetrySeconds,
  }
}
