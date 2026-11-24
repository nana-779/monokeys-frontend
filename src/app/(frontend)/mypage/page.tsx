'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/features/auth/api'
import { useWithdrawalSession } from '@/features/user/withdrawal-session'

// 메뉴용 페이지가 없는 항목은 주소를 비워 두고 같은 크기의 비활성 박스로 표시합니다.
const accountMenus: Array<{ label: string; href?: string }> = [
  { label: '회원 정보 수정' },
  { label: '주문 내역', href: '/mypage/orders' },
  { label: '배송 조회' },
  { label: '위시리스트' },
  { label: '나의 리뷰' },
  { label: '회원 탈퇴', href: '/user/delete-account' },
]

const menuBoxClass = 'rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9'
const menuItemClass = `block w-full text-left text-sm font-semibold ${menuBoxClass}`

export default function MyPage() {
  // 인증 연동에서 로그인한 사용자 상태를 전달받은 경우에만 탈퇴 화면으로 안내합니다.
  const session = useWithdrawalSession()
  const user = session?.user
  // 공통 세션이 이미 받은 이름을 사용하고, 이름이 없는 회원에게는 공통 인사말을 표시합니다.
  const name = user && 'name' in user && typeof user.name === 'string' ? user.name.trim() : ''

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      <h1 className="mb-8 text-center text-4xl font-medium tracking-[-0.06em] sm:text-5xl">마이페이지</h1>
      {session ? (
        <>
          <p className="mb-6 break-words text-center text-sm">
            {name ? <><strong className="font-bold">{name}</strong> 회원님, 안녕하세요.</> : '회원님, 안녕하세요.'}
          </p>
          <nav aria-label="마이페이지 메뉴" className="grid gap-4">
            {/* 각 링크를 같은 크기의 독립된 박스로 표시하고, 밑줄은 글자에 마우스를 올리거나 키보드로 링크에 접근할 때 표시합니다. */}
            {accountMenus.map(({ href, label }) => href ? (
              <Link key={label} href={href} className={`group ${menuItemClass}`}>
                <span className="underline-offset-4 hover:underline group-focus-visible:underline">{label}</span>
              </Link>
            ) : (
              <button key={label} type="button" disabled className={`${menuItemClass} cursor-not-allowed text-zinc-500`}>
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <AccountSessionNotice />
      )}
    </section>
  )
}

function AccountSessionNotice() {
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'error'>('loading')

  useEffect(() => {
    // 공통 세션이 비어 있을 때만 회원 조회로 비로그인과 조회 실패를 구분합니다.
    // 조회가 성공해도 공통 세션이 없으면 이전 계정의 메뉴를 표시하지 않습니다.
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
    <div className={menuBoxClass}>
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
          마이페이지를 이용하려면 로그인해 주세요.{' '}
          <Link className="font-semibold text-zinc-900 underline underline-offset-4" href="/?login=1">
            스토어에서 로그인
          </Link>
        </p>
      )}
    </div>
  )
}
