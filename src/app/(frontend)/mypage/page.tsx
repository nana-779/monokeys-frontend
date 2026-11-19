'use client'

import Link from 'next/link'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'

export default function MyPage() {
  // 인증 연동에서 로그인한 사용자 상태를 전달받은 경우에만 탈퇴 화면으로 안내합니다.
  const session = useWithdrawalSession()

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      <h1 className="mb-8 text-center text-4xl font-medium tracking-[-0.06em] sm:text-5xl">마이페이지</h1>
      <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9">
        {session ? (
          <Link className="text-sm font-semibold underline underline-offset-4" href="/user/delete-account">
            회원탈퇴
          </Link>
        ) : (
          <p className="text-sm text-zinc-600">
            마이페이지를 이용하려면 로그인해 주세요.{' '}
            <Link className="font-semibold text-zinc-900 underline underline-offset-4" href="/?login=1">
              스토어에서 로그인
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}
