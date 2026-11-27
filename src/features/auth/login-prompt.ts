export const REQUIRE_LOGIN_EVENT = 'monokeys:require-login'

export type RequireLoginDetail = {
  message?: string
}

/** 비로그인 상태에서 회원 전용 장바구니/담기 동작 시 헤더 로그인 패널을 안내 문구와 함께 엽니다. */
export function requestLoginPrompt(message = '로그인이 필요한 서비스입니다.') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<RequireLoginDetail>(REQUIRE_LOGIN_EVENT, { detail: { message } }))
}
