'use client'

import {
  ANONYMOUS,
  clearTossPayments,
  loadTossPayments,
  type TossPaymentsWidgets,
} from '@tosspayments/tosspayments-sdk'
import { createWidgetsInitializer } from './widgets-initializer'

// 동적 키 접근을 사용하지 않아 Next.js가 공개 환경변수를 클라이언트 번들에 주입할 수 있습니다.
// 공개 클라이언트 키로 비회원 결제 위젯을 준비합니다. 시크릿 키는 프론트에 전달하지 않고 백엔드에서만 사용합니다.
export const initializeTossWidgets = createWidgetsInitializer<TossPaymentsWidgets>({
  isClient: () => typeof window !== 'undefined',
  readClientKey: () => process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY,
  load: (clientKey) => loadTossPayments(clientKey),
  anonymousCustomerKey: ANONYMOUS,
  clear: clearTossPayments,
})
