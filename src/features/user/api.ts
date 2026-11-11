import { ApiRequestError, apiRequest } from '@/lib/api-client'

export type CustomerSignupRequest = {
  email: string
  password: string
  name: string
  phone: string
  postalCode: string
  address: string
  detailAddress: string
}

export async function signUpCustomer(_input: CustomerSignupRequest): Promise<void> {
  throw new Error('TODO: 회원가입 API를 연결하세요.')
}

// 비밀번호 확인과 최종 탈퇴의 요청·응답 형식만 연결합니다.
// JWT 전달과 실제 인증은 아직 미연동이며, 여기서 토큰을 만들거나 인증을 우회하지 않습니다.
async function requestWithdrawal<T>(
  path: string, method: 'POST' | 'DELETE', password: string, status: number, signal: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, {
    method,
    signal,
    body: JSON.stringify({ password }),
  }, status)
}

// POST는 비밀번호 일치 여부를 받고, 실제 계정 처리는 아래 DELETE에서 수행합니다.
export async function verifyWithdrawalPassword(password: string, signal: AbortSignal): Promise<boolean> {
  const result = await requestWithdrawal<{ verified?: unknown } | null>(
    '/api/users/me/verify-password', 'POST', password, 200, signal,
  )
  if (typeof result?.verified !== 'boolean') {
    throw new Error('비밀번호 확인 결과를 확인하지 못했습니다.')
  }
  return result.verified
}

// 최종 탈퇴는 본문 없는 204를 성공으로 처리합니다.
export function deleteCustomerAccount(password: string, signal: AbortSignal): Promise<void> {
  return requestWithdrawal('/api/users/me', 'DELETE', password, 204, signal)
}
