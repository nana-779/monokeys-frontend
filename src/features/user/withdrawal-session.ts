'use client'

import { createContext, useContext } from 'react'
import type { ApiUser } from '@/features/auth/api'

export type WithdrawalSession = {
  user: Pick<ApiUser, 'id'>
  // 같은 회원이 다시 로그인해도 바뀌는 화면용 식별자입니다. 쿠키나 JWT 값은 담지 않습니다.
  sessionVersion: string | number
  // 인증 연동에서 로그인 상태와 해당 회원의 장바구니를 정리합니다.
  clearAfterWithdrawal: () => void | Promise<void>
  // 회원정보 수정 후 서버가 돌려준 최신 정보로 화면의 로그인 사용자 정보(헤더·마이페이지 이름 등)를 바꿉니다.
  updateUser: (user: ApiUser) => void
  // 비밀번호 변경 후 서버가 인증 쿠키를 만료시키므로 화면을 로그아웃 상태로 바꾸고 로그인 창을 엽니다.
  // 장바구니는 로그아웃과 같이 화면 표시만 비우고 서버에 저장된 장바구니는 지우지 않습니다.
  signOutAfterPasswordChange: () => void
}

// 실제 로그인에서 이 컨텍스트로 사용자 상태와 정리 함수를 전달하는 연결은 아직 없습니다.
// 연결 전에는 기본값이 null이므로 탈퇴 화면에 로그인 안내가 표시됩니다.
export const WithdrawalSessionContext = createContext<WithdrawalSession | null>(null)

export function useWithdrawalSession() {
  return useContext(WithdrawalSessionContext)
}
