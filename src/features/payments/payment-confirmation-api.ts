'use client'

import { API_BASE_URL } from '@/lib/api-client'
import { createPaymentConfirmationClient } from './payment-confirmation'

// Uses the existing origin and credential policy without changing shared member API errors.
export const confirmDevPayment = createPaymentConfirmationClient(API_BASE_URL,
  (url, init) => fetch(url, init))
