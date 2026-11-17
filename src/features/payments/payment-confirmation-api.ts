'use client'

import { API_BASE_URL } from '@/lib/api-client'
import { createPaymentConfirmationClient } from './payment-confirmation'

// 기존 서버 주소와 쿠키 전송 정책을 쓰며 회원 API의 오류 처리는 변경하지 않습니다.
// 공통 백엔드 주소에 승인 전용 통신 함수를 연결합니다. 현재 응답은 메모리 처리 결과이며 실제 주문 DB 저장 연결은 11단계에 남아 있습니다.
export const confirmDevPayment = createPaymentConfirmationClient(API_BASE_URL,
  (url, init) => fetch(url, init))
