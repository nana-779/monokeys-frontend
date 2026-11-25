'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/features/auth/api'
import { PasswordForm } from '@/features/user/password-form'
import { ProfileForm } from '@/features/user/profile-form'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'

const cardClass = 'rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9'

/** 회원정보 수정(AUTH-006) 화면입니다. 회원정보 수정과 비밀번호 변경을 한 페이지에서 처리합니다. */
export default function ProfilePage() {
  const session = useWithdrawalSession()
  // 비밀번호 변경 후에는 로그아웃 상태가 되므로, 로그인 안내 대신 변경 완료 안내를 보여 줍니다.
  const [passwordChanged, setPasswordChanged] = useState(false)

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      <h1 className="mb-8 text-center text-4xl font-medium tracking-[-0.06em] sm:text-5xl">회원 정보 수정</h1>
      {session ? (
        // 다른 계정으로 바뀌거나 다시 로그인하면 입력 중이던 값이 남지 않도록 영역 전체를 새로 그립니다.
        <div key={`${session.user.id}-${session.sessionVersion}`} className="grid gap-6">
          <ProfileForm session={session} />
          <PasswordForm onChanged={() => {
            setPasswordChanged(true)
            // 화면을 로그아웃 상태로 바꾸고 로그인 창을 엽니다.
            session.signOutAfterPasswordChange()
          }} />
        </div>
      ) : passwordChanged ? (
        <div className={cardClass}>
          <p role="status" className="text-sm text-zinc-700">비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.</p>
        </div>
      ) : (
        <SignedOutNotice />
      )}
      <p className="mt-7 text-center">
        <Link className="text-sm underline underline-offset-4" href="/mypage">마이페이지로 돌아가기</Link>
      </p>
    </section>
  )
}

/** 로그인 정보가 아직 없을 때 비로그인과 조회 실패를 구분해 안내합니다. (마이페이지와 같은 방식) */
function SignedOutNotice() {
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'error'>('loading')

  useEffect(() => {
    let active = true
    void getCurrentUser()
      .then(({ user }) => {
        if (active) setStatus(user ? 'error' : 'signed-out')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => { active = false }
  }, [])

  return (
    <div className={cardClass}>
      {status === 'loading' && <p role="status" className="text-sm text-zinc-600">회원 정보를 확인하고 있어요.</p>}
      {status === 'error' && (
        <div className="space-y-2 text-sm text-zinc-600">
          <p role="alert">회원 정보를 확인하지 못했습니다.</p>
          <button type="button" onClick={() => window.location.reload()} className="font-semibold text-zinc-900 underline underline-offset-4">
            다시 확인
          </button>
        </div>
      )}
      {status === 'signed-out' && (
        <p className="text-sm text-zinc-600">
          회원 정보를 수정하려면 로그인해 주세요.{' '}
          <Link className="font-semibold text-zinc-900 underline underline-offset-4" href="/?login=1">
            스토어에서 로그인
          </Link>
        </p>
      )}
    </div>
  )
}
