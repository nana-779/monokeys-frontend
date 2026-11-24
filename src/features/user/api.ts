import { ApiRequestError, apiRequest } from '@/lib/api-client'
import { toApiUser, type ApiUser, type ServerUser } from '@/features/auth/api'

export type CustomerSignupRequest = {
  email: string
  password: string
  name: string
  phone: string
  postalCode: string
  address: string
  detailAddress: string
  termsConsent: { serviceTerms: boolean; privacyPolicy: boolean }
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
/** 현재 입력의 이메일 사용 가능 여부를 조회합니다. 가입 시에는 서버와 DB가 중복 여부를 다시 판단합니다. */
export async function checkSignupEmail(email: string, signal: AbortSignal): Promise<boolean> {
  const query = new URLSearchParams({ email })
  const result = await memberRequest<{ available?: unknown } | null>(
    `/api/auth/check-email?${query}`, { signal, cache: 'no-store' }, 200,
  )
  if (typeof result?.available !== 'boolean') {
    throw new Error('중복 확인 결과를 확인하지 못했습니다.')
  }
  return result.available
}

/** 팀 화면의 평면 요청 형식을 전송하며, 계약된 201 응답을 받은 경우에만 가입 완료로 처리합니다. */
export async function signUpCustomer(input: CustomerSignupRequest): Promise<void> {
  await memberRequest('/api/users/signup', { method: 'POST', body: JSON.stringify(input) }, 201)
}

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

/** 회원정보 수정 요청입니다. 이메일·회원 ID는 보내지 않고, 전화번호는 하이픈 없이 숫자만 보냅니다. */
export type ProfileUpdateRequest = {
  name: string
  phoneNumber: string
  postalCode: string
  address: string
  detailAddress: string
}

/** 이름·전화번호·기본 배송지를 수정하고, 서버가 돌려준 최신 회원정보를 화면 형식으로 반환합니다. */
export async function updateMyProfile(input: ProfileUpdateRequest): Promise<ApiUser> {
  const user = await memberRequest<ServerUser>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, 200)
  if (!user) {
    throw new Error('수정된 회원 정보를 확인하지 못했습니다.')
  }
  return toApiUser(user)
}

/** 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다. 성공하면 서버가 인증 쿠키를 만료시키므로 다시 로그인해야 합니다. */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  await memberRequest('/api/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  }, 200)
}
