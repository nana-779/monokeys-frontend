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

type MemberApiResponse<T> = { success?: unknown; message?: unknown; data?: T }

// 팀 백엔드의 공통 응답은 회원 API에서만 풀어 다른 기능의 공용 요청 동작을 유지합니다.
async function memberRequest<T>(path: string, init: RequestInit, status: number): Promise<T | undefined> {
  const result = await apiRequest<MemberApiResponse<T> | null>(path, init, status)
  if (result?.success !== true) {
    const message = typeof result?.message === 'string' && result.message
      ? result.message : '서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.'
    throw new ApiRequestError(message, status)
  }
  return result.data
}
// 비밀번호 확인과 최종 탈퇴의 인증 쿠키는 공용 요청기를 통해 브라우저가 전송합니다.
// 쿠키 발급·JWT 검증을 이 함수가 구현하는 것은 아니며, 실제 인증 성공에는 팀 인증 연동이 필요합니다.
async function requestWithdrawal<T>(
  path: string, method: 'POST' | 'DELETE', password: string, status: number, signal: AbortSignal,
): Promise<T | undefined> {
  try {
    return await memberRequest<T>(path, {
      method,
      signal,
      body: JSON.stringify({ password }),
    }, status)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      throw new ApiRequestError('로그인 정보를 다시 확인해 주세요.', error.status)
    }
    if (error instanceof ApiRequestError && error.status === 403
      && error.message === 'API request failed (403)') {
      throw new ApiRequestError('요청 권한 또는 보안 인증을 확인하지 못했습니다. 다시 로그인 후 시도해 주세요.', error.status)
    }
    throw error
  }
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

// 최종 탈퇴는 팀 백엔드의 200과 success: true 응답을 확인합니다.
export async function deleteCustomerAccount(password: string, signal: AbortSignal): Promise<void> {
  await requestWithdrawal('/api/users/me', 'DELETE', password, 200, signal)
}
