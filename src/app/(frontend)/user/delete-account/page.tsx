'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { deleteCustomerAccount, verifyWithdrawalPassword } from '@/features/user/api'
import { useWithdrawalSession, type WithdrawalSession } from '@/features/user/withdrawal-session'

const outlineButton = 'h-12 rounded-md border border-zinc-300 px-4 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-50'
const primaryButton = 'h-12 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50'

const cardClass = 'space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9'

/** 세션별 탈퇴 폼과 서버 처리 이후의 화면 정리를 관리합니다. 실제 로그인 상태는 인증 연동에서 공급해야 합니다. */
export default function DeleteAccountPage() {
  const router = useRouter()
  const session = useWithdrawalSession()
  const [completion, setCompletion] = useState<'cleaning' | 'done' | 'failed' | null>(null)
  // 계정이나 로그인 세션이 바뀌면 비밀번호, 확인 결과, 열린 모달을 함께 초기화합니다.
  const formKey = session ? JSON.stringify([session.user.id, session.sessionVersion]) : 'guest'

  async function completeWithdrawal(session: WithdrawalSession) {
    // 서버의 200 성공 응답을 확인한 뒤 인증 쪽에서 제공한 함수로 화면의 로그인 상태를 정리합니다.
    setCompletion('cleaning')
    try {
      await session.clearAfterWithdrawal()
      setCompletion('done')
    } catch {
      // 서버 탈퇴는 이미 성공했으므로 화면 정리 실패를 이유로 DELETE를 다시 요청하지 않습니다.
      setCompletion('failed')
    }
  }

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      <h1 className="mb-8 text-center text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
        {completion ? '회원탈퇴 완료' : '회원탈퇴'}
      </h1>
      {completion ? (
        <div className={cardClass}>
          <p role="status">회원탈퇴가 완료되었습니다.</p>
          {completion === 'failed' && <p role="alert">브라우저에 저장된 일부 정보를 정리하지 못했습니다.</p>}
          <button className={primaryButton} disabled={completion === 'cleaning'} onClick={() => router.replace('/')} type="button">
            확인
          </button>
        </div>
      ) : (
        <WithdrawalForm key={formKey} onComplete={completeWithdrawal} session={session} />
      )}
    </section>
  )
}

/** 사전 비밀번호 확인과 최종 탈퇴를 나눠 진행하며, 확인 결과는 이 폼의 현재 비밀번호·세션에서만 사용합니다. */
function WithdrawalForm({ onComplete, session }: {
  onComplete: (session: WithdrawalSession) => Promise<void>
  session: WithdrawalSession | null
}) {
  const [password, setPassword] = useState('')
  const [verified, setVerified] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const confirmation = useRef<HTMLDialogElement>(null)

  // 세션 변경이나 화면 이동으로 이전 폼이 사라지면 늦은 응답을 반영하지 않습니다.
  // 요청 취소는 브라우저의 응답 처리를 중단할 뿐, 서버에서 이미 진행된 탈퇴를 되돌리지는 않습니다.
  useLayoutEffect(() => () => activeRequest.current?.abort(), [])

  // 비밀번호 확인은 일치 여부만 조회하고, 일치하면 최종 확인 버튼을 활성화합니다.
  async function verifyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !password.trim() || activeRequest.current) return
    const request = new AbortController()
    activeRequest.current = request
    setPending(true)
    setVerified(false)
    setMessage('')
    try {
      const matches = await verifyWithdrawalPassword(password, request.signal)
      if (request.signal.aborted) return
      setVerified(matches)
      setMessage(matches ? '비밀번호를 확인했습니다.' : '비밀번호가 일치하지 않습니다.')
    } catch (error) {
      if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.')
    } finally {
      activeRequest.current = null
      if (!request.signal.aborted) setPending(false)
    }
  }

  // 모달에서 확정한 경우에만 최종 탈퇴를 요청합니다. 서버가 현재 비밀번호를 다시 확인합니다.
  async function withdraw() {
    if (!session || !verified || activeRequest.current) return
    const request = new AbortController()
    activeRequest.current = request
    setPending(true)
    setMessage('')
    try {
      await deleteCustomerAccount(password, request.signal)
      if (request.signal.aborted) return
      confirmation.current?.close()
      await onComplete(session)
    } catch (error) {
      if (request.signal.aborted) return
      confirmation.current?.close()
      setVerified(false)
      setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.')
    } finally {
      activeRequest.current = null
      if (!request.signal.aborted) setPending(false)
    }
  }

  return (
    <>
      <div className={cardClass}>
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>탈퇴 후에는 이 계정으로 서비스를 이용할 수 없습니다.</li>
          <li>보존 대상인 주문 및 결제 기록은 유지될 수 있습니다.</li>
          <li>탈퇴하면 해당 계정의 장바구니가 이 브라우저에서 정리됩니다.</li>
        </ul>
        {session ? (
          <>
            <form className="space-y-3" onSubmit={verifyPassword}>
              <label className="block text-sm font-medium" htmlFor="withdrawal-password">현재 비밀번호</label>
              <input
                autoComplete="current-password"
                className="h-12 w-full rounded-md border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
                disabled={pending}
                id="withdrawal-password"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setVerified(false)
                  setMessage('')
                }}
                required
                type="password"
                value={password}
              />
              <button className={outlineButton} disabled={pending || !password.trim()} type="submit">
                비밀번호 확인
              </button>
            </form>
            {message && <p className={verified ? 'text-sm' : 'text-sm text-red-700'} role={verified ? 'status' : 'alert'}>{message}</p>}
            <button
              className={primaryButton}
              disabled={!verified || pending}
              onClick={() => confirmation.current?.showModal()}
              type="button"
            >
              최종 탈퇴 확인
            </button>
          </>
        ) : (
          <p className="text-sm text-zinc-600">
            회원탈퇴는 로그인 후 이용할 수 있습니다.{' '}
            <Link className="font-semibold underline underline-offset-4" href="/?login=1">스토어에서 로그인</Link>
          </p>
        )}
        <p><Link className="text-sm underline underline-offset-4" href="/mypage">마이페이지로 돌아가기</Link></p>
      </div>
      <dialog
        aria-labelledby="withdrawal-confirm-title"
        className="m-auto w-[min(92%,420px)] rounded-xl border border-zinc-200 p-6 shadow-xl backdrop:bg-black/50"
        onCancel={(event) => { if (activeRequest.current) event.preventDefault() }}
        ref={confirmation}
      >
        <h2 className="text-xl font-medium" id="withdrawal-confirm-title">회원탈퇴 확인</h2>
        <p className="mt-3 text-sm text-zinc-600">회원탈퇴를 진행하시겠습니까?</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className={outlineButton} disabled={pending} onClick={() => confirmation.current?.close()} type="button">취소</button>
          <button className={primaryButton} disabled={pending || !verified} onClick={withdraw} type="button">
            {pending ? '처리 중…' : '탈퇴하기'}
          </button>
        </div>
      </dialog>
    </>
  )
}
