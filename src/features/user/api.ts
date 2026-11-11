import { apiRequest } from '@/lib/api-client'

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

/** 팀 화면의 평면 요청 형식을 전송하며, 계약된 201 응답을 받은 경우에만 가입 완료로 처리합니다. */
export async function signUpCustomer(input: CustomerSignupRequest): Promise<void> {
  await apiRequest('/api/users/signup', { method: 'POST', body: JSON.stringify(input) }, 201)
}

export async function deleteCustomerAccount(): Promise<void> {
  throw new Error('TODO: 회원탈퇴 API를 연결하세요.')
}
