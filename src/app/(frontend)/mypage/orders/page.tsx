'use client'

import Link from 'next/link'
import { MyOrderList } from '@/features/orders/my-order-list'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'

// 로그인 세션별로 주문 목록을 분리해 계정이 바뀌면 이전 회원의 화면 상태를 비웁니다.
export default function MyOrdersPage() {
  const session = useWithdrawalSession()

  return (
    <section className="mx-auto w-[92%] max-w-5xl py-10 sm:py-14">
      <p className="mb-2 text-xs text-neutral-500">마이페이지 / 주문 내역</p>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">주문 내역</h1>
      {session ? (
        <MyOrderList key={JSON.stringify([session.user.id, session.sessionVersion])} />
      ) : (
        <p className="text-sm">
          주문 내역을 보려면 <Link href="/?login=1" className="underline">로그인</Link>해 주세요.
        </p>
      )}
      <Link href="/mypage" className="mt-6 inline-block rounded-md border border-neutral-200 px-4 py-2 text-sm">
        마이페이지로 돌아가기
      </Link>
    </section>
  )
}
