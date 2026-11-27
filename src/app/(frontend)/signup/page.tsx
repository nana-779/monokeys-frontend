'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkSignupEmail, signUpCustomer } from '@/features/user/api'
import { loadPostcode, postcodeError } from '@/features/user/postcode'
import { useSignupEmailVerification } from '@/features/user/use-signup-email-verification'
import { ApiRequestError } from '@/lib/api-client'

// =============================================================================
// 스타일 및 고정 상수 정의
// =============================================================================
const inputBaseClass =
  'h-12 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5'
const inputClass = 'mt-2 ' + inputBaseClass
const outlineButton =
  'h-12 shrink-0 rounded-md border border-zinc-300 px-4 text-sm font-medium transition hover:border-zinc-950 hover:bg-zinc-50 disabled:opacity-60'
// 좁은 화면에서는 버튼을 입력 아래에 배치해 주소와 번호 입력 공간을 확보합니다.
const verificationRow = 'grid gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_auto]'
const dialogClass =
  'm-auto w-[min(92%,480px)] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-black/50'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^010[0-9]{8}$/

// 회원가입 필수 약관 목록
const terms = [
  {
    name: 'serviceTerms',
    label: '서비스 이용약관',
    description: '회원은 정확한 가입 정보를 제공하며 계정을 안전하게 관리합니다.',
  },
  {
    name: 'privacyPolicy',
    label: '개인정보 수집·이용',
    description: '이메일, 이름, 연락처, 배송지는 회원 관리와 주문 배송에 사용됩니다. 비밀번호는 해시로 저장됩니다.',
  },
] as const

// 주소 관련 서버 검증 에러 키 목록
const ADDRESS_ERROR_FIELDS = [
  'defaultAddress',
  'defaultAddress.zonecode',
  'defaultAddress.roadAddress',
  'defaultAddress.detailAddress',
] as const

type EmailCheck = { email: string; available: boolean; message: string }
type FormError = { message: string; fields?: Record<string, string> }

// =============================================================================
// 유효성 검사 및 포맷터 헬퍼 함수
// =============================================================================

/**
 * 비밀번호 정책 검증 (서버 정책과 동일)
 * - 8자 이상 20자 이하
 * - 영문 대/소문자 및 숫자 반드시 포함
 * - UTF-8 인코딩 기준 최대 72바이트 이하 (bcrypt 한계 보호)
 */
function validPassword(password: string): boolean {
  const length = Array.from(password).length
  return (
    length >= 8 &&
    length <= 20 &&
    /[a-z]/i.test(password) &&
    /[0-9]/.test(password) &&
    new TextEncoder().encode(password).length <= 72
  )
}

/**
 * 전화번호 문자열을 '010-XXXX-XXXX' 형식으로 포맷팅
 */
function formatPhoneNumber(digitsOnly: string): string {
  const p1 = digitsOnly.slice(0, 3)
  const p2 = digitsOnly.slice(3, 7)
  const p3 = digitsOnly.slice(7, 11)
  return [p1, p2, p3].filter(Boolean).join('-')
}

// 남은 초를 MM:SS 형식으로 표시합니다.
function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

// =============================================================================
// 회원가입 페이지 메인 컴포넌트
// =============================================================================
export default function SignupPage() {
  const router = useRouter()

  // ---------------------------------------------------------------------------
  // 1. 입력 필드 상태 관리
  // ---------------------------------------------------------------------------
  const [email, setEmail] = useState('')
  const [emailCheck, setEmailCheck] = useState<EmailCheck | null>(null)

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordConfirmTouched, setPasswordConfirmTouched] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)

  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [detail, setDetail] = useState('')

  const [termsConsent, setTermsConsent] = useState({ serviceTerms: false, privacyPolicy: false })

  // ---------------------------------------------------------------------------
  // 2. 제출 및 UI 상태 관리
  // ---------------------------------------------------------------------------
  const [postcodeMessage, setPostcodeMessage] = useState('')
  const [error, setError] = useState<FormError | null>(null)
  const [pending, setPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [signupRetryUntil, setSignupRetryUntil] = useState(0)

  // ---------------------------------------------------------------------------
  // 3. 비동기 요청 제어 및 DOM 참조 (Ref)
  // ---------------------------------------------------------------------------
  const submitRequest = useRef<AbortController | null>(null)
  const emailRequest = useRef<AbortController | null>(null)
  const postcodeDialog = useRef<HTMLDialogElement>(null)
  const postcodeHost = useRef<HTMLDivElement>(null)
  const postcodeSession = useRef<symbol | null>(null)
  const detailAddress = useRef<HTMLInputElement>(null)
  const successDialog = useRef<HTMLDialogElement>(null)

  // ---------------------------------------------------------------------------
  // 4. 유효성 검사 및 제출 가능 여부 연산
  // ---------------------------------------------------------------------------
  const normalizedEmail = email.trim()
  const currentEmailCheck = emailCheck?.email === normalizedEmail ? emailCheck : null
  const available = currentEmailCheck?.available === true
  const emailValid = emailPattern.test(normalizedEmail) && normalizedEmail.length <= 50
  const disabled = pending || completed
  const verification = useSignupEmailVerification(normalizedEmail, available && emailValid)

  const passwordsMatch = password === passwordConfirm
  const showPasswordMismatch = passwordConfirmTouched && !passwordsMatch
  const passwordValid = validPassword(password)
  const phoneValid = phonePattern.test(phone)

  const hasRequiredFields = Boolean(name.trim() && postalCode.trim() && address.trim() && detail.trim())
  const canSubmit =
    available &&
    verification.verified &&
    passwordValid &&
    phoneValid &&
    hasRequiredFields &&
    termsConsent.serviceTerms &&
    termsConsent.privacyPolicy

  // 가입 요청도 즉시 잠그고, 화면을 떠난 뒤에 도착한 결과는 무시합니다.
  useEffect(() => () => {
    submitRequest.current?.abort()
    submitRequest.current = null
  }, [])

  useEffect(() => {
    if (!signupRetryUntil) return
    let timer: number | undefined
    const unlockWhenElapsed = () => {
      const remaining = signupRetryUntil - Date.now()
      if (remaining <= 0) {
        setSignupRetryUntil(0)
        return
      }
      timer = window.setTimeout(unlockWhenElapsed, Math.min(2_147_483_647, remaining))
    }
    unlockWhenElapsed()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [signupRetryUntil])

  // ---------------------------------------------------------------------------
  // 5. 이메일 중복 확인 (500ms 디바운스 적용)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const addressToCheck = email.trim()
    if (!emailPattern.test(addressToCheck) || addressToCheck.length > 50) return

    // 이전 이메일 응답이 현재 입력을 덮어쓰지 않도록 요청 취소 컨트롤러 사용
    const request = new AbortController()
    emailRequest.current = request

    const timer = window.setTimeout(async () => {
      try {
        const isAvailable = await checkSignupEmail(addressToCheck, request.signal)
        if (!request.signal.aborted) {
          setEmailCheck({
            email: addressToCheck,
            available: isAvailable,
            message: isAvailable ? '사용 가능한 이메일입니다.' : '중복된 이메일입니다.',
          })
        }
      } catch (err) {
        if (!request.signal.aborted) {
          setEmailCheck({
            email: addressToCheck,
            available: false,
            message:
              err instanceof ApiRequestError && err.status === 400
                ? err.message
                : '이메일을 확인하지 못했습니다. 입력을 수정한 뒤 다시 시도해 주세요.',
          })
        }
      }
    }, 500)

    return () => {
      window.clearTimeout(timer)
      request.abort()
    }
  }, [email])

  // ---------------------------------------------------------------------------
  // 6. 다음(카카오) 우편번호 검색 모달
  // ---------------------------------------------------------------------------
  function closeAddressSearch() {
    postcodeSession.current = null
    postcodeHost.current?.replaceChildren()
    postcodeDialog.current?.close()
    setPostcodeMessage('')
  }

  async function searchAddress() {
    const dialog = postcodeDialog.current
    const host = postcodeHost.current
    if (!dialog || !host || dialog.open) return

    const session = Symbol()
    postcodeSession.current = session
    const isCurrent = () => dialog.isConnected && dialog.open && postcodeSession.current === session

    dialog.showModal()
    setPostcodeMessage('주소 검색을 불러오는 중입니다.')

    try {
      const Postcode = await loadPostcode()
      if (!isCurrent()) return
      setPostcodeMessage('')

      new Postcode({
        width: '100%',
        height: '100%',
        minWidth: 240,
        oncomplete({ zonecode, roadAddress }) {
          if (!isCurrent()) return
          if (!zonecode || !roadAddress) {
            setPostcodeMessage('도로명 주소가 포함된 검색 결과를 선택해 주세요.')
            return
          }

          // 주소 자동 입력 후 상세주소 입력칸으로 포커스 이동
          setPostalCode(zonecode)
          setAddress(roadAddress)
          setDetail('')
          setError(null)
          closeAddressSearch()
          detailAddress.current?.focus()
        },
      }).embed(host, { autoClose: false })
    } catch {
      if (isCurrent()) setPostcodeMessage(postcodeError)
    }
  }

  // ---------------------------------------------------------------------------
  // 7. 가입 양식 제출 핸들러
  // ---------------------------------------------------------------------------
  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitRequest.current || completed || signupRetryUntil > Date.now()) return

    setPasswordConfirmTouched(true)
    const verificationToken = verification.getValidToken()
    if (!passwordsMatch || !canSubmit || !verificationToken) return

    setError(null)
    const request = new AbortController()
    submitRequest.current = request
    setPending(true)

    try {
      await signUpCustomer({
        email: normalizedEmail,
        password,
        name: name.trim(),
        phone,
        postalCode: postalCode.trim(),
        address: address.trim(),
        detailAddress: detail.trim(),
        termsConsent,
        verificationToken,
      }, request.signal)
      if (submitRequest.current !== request) return
      verification.reset()

      setPassword('')
      setPasswordConfirm('')
      setCompleted(true)
      successDialog.current?.showModal()
    } catch (cause) {
      if (submitRequest.current !== request) return
      if (cause instanceof ApiRequestError) {
        if (cause.status === 403 && cause.code === 'VERIFICATION_REQUIRED') {
          verification.clearProof('가입 인증이 유효하지 않습니다. 인증번호를 다시 받아 주세요.')
        } else if (cause.status === 409 && cause.code === 'VERIFICATION_IN_USE') {
          setError({ message: '이메일 인증을 사용한 가입 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.' })
        } else if (cause.status === 429) {
          const seconds = cause.retryAfterSeconds ?? 60
          setSignupRetryUntil(Date.now() + seconds * 1000)
          setError({ message: seconds > 0 ? `가입 요청이 많습니다. ${seconds}초 뒤 다시 시도해 주세요.` : cause.message })
        } else if (cause.status === 503) {
          setError({ message: '지금은 회원가입을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.' })
        } else {
          setError({ message: cause.message, fields: cause.fieldErrors })
          // 기존 중복 오류는 전용 코드 없이 이 문구를 반환합니다. 다른 409는 중복으로 표시하지 않습니다.
          if (cause.status === 409 && !cause.code && cause.message === '이미 사용 중인 이메일입니다.') {
            verification.reset()
            setEmailCheck({ email: normalizedEmail, available: false, message: cause.message })
          }
        }
      } else {
        setError({ message: '서버 연결에 실패했습니다. 다시 시도해 주세요.' })
      }
    } finally {
      if (submitRequest.current === request) {
        submitRequest.current = null
        setPending(false)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. 피드백 메시지 처리
  // ---------------------------------------------------------------------------
  const fields = error?.fields
  // 1) 이메일 피드백 (에러: 빨강 / 확인중: 회색 / 사용가능: 초록)
  const getEmailFeedback = () => {
    if (fields?.email) {
      return { text: fields.email, color: 'text-red-700' }
    }
    if (email && !emailValid) {
      return { text: '올바른 이메일 형식으로 입력해 주세요.', color: 'text-red-700' }
    }
    if (currentEmailCheck) {
      return {
        text: currentEmailCheck.message,
        color: currentEmailCheck.available ? 'text-green-600' : 'text-red-700',
      }
    }
    if (emailValid) {
      return { text: '이메일 중복을 확인하고 있습니다.', color: 'text-zinc-500' }
    }
    return { text: '', color: '' }
  }
  const emailFeedback = getEmailFeedback()
  // 2) 비밀번호 피드백 (미충족: 빨강 / 사용가능: 초록)
  const getPasswordFeedback = () => {
    if (fields?.password) {
      return { text: fields.password, color: 'text-red-700' }
    }
    if (password && !passwordValid) {
      return { text: '8~20자이며 영문과 숫자를 포함해야 합니다.', color: 'text-red-700' }
    }
    if (password && passwordValid) {
      return { text: '사용 가능한 비밀번호입니다.', color: 'text-green-600' }
    }
    return { text: '', color: '' }
  }
  const passwordFeedback = getPasswordFeedback()
  // 3) 비밀번호 확인 피드백 (입력하는 즉시 불일치: 빨강 / 일치: 초록)
  const getPasswordConfirmFeedback = () => {
    if (!passwordConfirm) {
      return { text: '', color: '' }
    }
    if (password !== passwordConfirm) {
      return { text: '비밀번호가 일치하지 않습니다.', color: 'text-red-700' }
    }
    return { text: '비밀번호가 일치합니다.', color: 'text-green-600' }
  }
  const passwordConfirmFeedback = getPasswordConfirmFeedback()
  // 4) 전화번호 피드백 (미충족: 빨강 / 형식 일치: 초록)
  const getPhoneFeedback = () => {
    if (fields?.phoneNumber) {
      return { text: fields.phoneNumber, color: 'text-red-700' }
    }
    if (phone && !phoneValid) {
      return { text: '010으로 시작하는 11자리 연락처를 입력해 주세요.', color: 'text-red-700' }
    }
    return { text: '', color: '' }
  }
  const phoneFeedback = getPhoneFeedback()

  // 5) 상세 주소 피드백 (기본 주소가 입력되었으나 상세 주소가 비었을 때: 빨강 / 입력 완료 시: 초록)
  const getDetailAddressFeedback = () => {
    if (fields?.['defaultAddress.detailAddress']) {
      return { text: fields['defaultAddress.detailAddress'], color: 'text-red-700' }
    }
    // 기본 주소를 검색해 입력했으나 상세 주소가 비어있는 경우
    if (address && !detail.trim()) {
      return { text: '상세 주소를 입력해 주세요 (동·호수 등).', color: 'text-red-700' }
    }
    return { text: '', color: '' }
  }
  const detailAddressFeedback = getDetailAddressFeedback()

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      {/* 상단 헤더 */}
      <div className="mb-8 text-center">
        <p className="text-[10px] font-semibold tracking-[0.24em] text-zinc-500">
          MONO / KEYS · ACCOUNT
        </p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.06em] sm:text-5xl">회원가입</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          계정을 만들고 더 편안한 쇼핑을 시작해 보세요.
        </p>
      </div>

      {/* 가입 폼 */}
      <form className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9" onSubmit={submitSignup}>
        {/* 중복 확인 뒤 번호를 발송하고, 같은 자리에서 남은 대기 시간과 재발송 버튼을 보여줍니다. */}
        <div>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="signup-email">이메일 *</label>
          <div className={`mt-2 ${verificationRow}`}>
            <input
              aria-describedby="signup-email-feedback"
              autoComplete="email"
              className={inputBaseClass + ' min-w-0'}
              disabled={disabled}
              id="signup-email"
              maxLength={50}
              name="email"
              onChange={(event) => {
                if (submitRequest.current) return
                emailRequest.current?.abort()
                verification.reset()
                setEmail(event.target.value)
                setEmailCheck(null)
                setError(null)
              }}
              placeholder="example@email.com"
              required
              type="email"
              value={email}
            />
            {!verification.verified && (
              <button
                className={outlineButton}
                disabled={disabled || !verification.canSend}
                onClick={() => void verification.send()}
                type="button"
              >
                {verification.pending === 'send' ? '발송 중…'
                  : verification.resendSeconds > 0 ? `재발송 ${formatCountdown(verification.resendSeconds)}`
                    : verification.challenge ? '인증번호 재발송' : '인증번호 발송'}
              </button>
            )}
          </div>
          <span className={`mt-1 block text-xs ${emailFeedback.color}`} id="signup-email-feedback" role="status">
            {emailFeedback.text}
          </span>
          {verification.challenge && (
            <div className="mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <label className="font-medium text-zinc-800" htmlFor="signup-email-code">이메일 인증번호</label>
                <span aria-label="인증번호 남은 시간" className="text-xs tabular-nums text-zinc-600">
                  {verification.codeSeconds > 0 ? formatCountdown(verification.codeSeconds) : '만료'}
                </span>
              </div>
              <div className={`mt-2 ${verificationRow}`}>
                <input
                  aria-describedby="signup-verification-feedback"
                  autoComplete="one-time-code"
                  className={inputBaseClass + ' min-w-0'}
                  disabled={disabled || verification.pending !== null || verification.codeSeconds === 0}
                  id="signup-email-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => verification.setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  onKeyDown={(event) => {
                    // 인증번호에서 Enter를 눌러도 회원가입 대신 번호 확인만 실행합니다.
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      if (!disabled) void verification.verify()
                    }
                  }}
                  placeholder="인증번호 6자리"
                  type="text"
                  value={verification.code}
                />
                <button
                  className={outlineButton}
                  disabled={disabled || !verification.canVerify}
                  onClick={() => void verification.verify()}
                  type="button"
                >
                  {verification.pending === 'verify' ? '확인 중…'
                    : verification.verifyRetrySeconds > 0 ? `다시 확인 ${formatCountdown(verification.verifyRetrySeconds)}`
                      : '인증 확인'}
                </button>
              </div>
            </div>
          )}
          <div id="signup-verification-feedback" role="status">
            {verification.challenge && verification.codeSeconds === 0 && (
              <p className="mt-2 text-xs text-red-700">인증번호가 만료됐습니다. 새 번호를 받아 주세요.</p>
            )}
            {/* 번호가 만료된 뒤 재발송도 제한됐다면 만료와 요청 제한을 함께 안내합니다. */}
            {verification.feedback && (verification.feedback.error || !verification.challenge || verification.codeSeconds > 0) && (
              <p className={`mt-2 text-xs ${verification.feedback.error ? 'text-red-700' : 'text-green-700'}`}>
                {verification.feedback.text}
              </p>
            )}
          </div>
        </div>

        {/* 비밀번호 입력 */}
        <label className="block text-sm font-medium text-zinc-800">
          비밀번호 *
          <input
            aria-describedby="signup-password-feedback"
            autoComplete="new-password"
            className={inputClass}
            disabled={disabled}
            maxLength={40}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value)
              setError(null)
            }}
            placeholder="8~20자, 영문과 숫자 포함"
            required
            type="password"
            value={password}
          />
          <span className={`mt-1 block text-xs ${passwordFeedback.color}`} id="signup-password-feedback">
            {passwordFeedback.text}
          </span>
        </label>

        {/* 비밀번호 확인 */}
        <div>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="signup-password-confirm">
            비밀번호 확인 *
          </label>
          <input
            aria-describedby="signup-password-confirm-feedback"
            aria-invalid={showPasswordMismatch}
            autoComplete="new-password"
            className={inputClass}
            disabled={disabled}
            id="signup-password-confirm"
            maxLength={40}
            name="passwordConfirm"
            onBlur={() => setPasswordConfirmTouched(true)}
            onChange={(event) => {
              setPasswordConfirm(event.target.value)
              setError(null)
            }}
            onInvalid={(event) => {
              if (!passwordsMatch) {
                event.preventDefault()
                setPasswordConfirmTouched(true)
              }
            }}
            placeholder="비밀번호를 다시 입력해 주세요"
            required
            type="password"
            value={passwordConfirm}
          />
          <p className={`mt-1 text-xs ${passwordConfirmFeedback.color}`} id="signup-password-confirm-feedback" role="status">
            {passwordConfirmFeedback.text}
          </p>
        </div>

        {/* 이름 입력 */}
        <label className="block text-sm font-medium text-zinc-800">
          이름 *
          <input
            autoComplete="name"
            className={inputClass}
            disabled={disabled}
            maxLength={50}
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="이름을 입력해 주세요"
            required
            value={name}
          />
          {fields?.name && <span className="mt-1 block text-xs text-red-700">{fields.name}</span>}
        </label>

        {/* 전화번호 입력 (숫자 입력 시 자동 하이픈 포맷 적용) */}
        <label className="block text-sm font-medium text-zinc-800">
          전화번호 *
          <input
            autoComplete="tel-national"
            className={inputClass}
            disabled={disabled}
            inputMode="numeric"
            maxLength={13}
            name="phone"
            onBlur={() => setPhoneTouched(true)}
            onChange={(event) => setPhone(event.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
            placeholder="010-0000-0000"
            required
            type="tel"
            value={formatPhoneNumber(phone)}
          />
          {(fields?.phoneNumber || (phoneTouched && !phoneValid)) && (
            <span className={`mt-1 block text-xs ${phoneFeedback.color}`}>
              {phoneFeedback.text}
            </span>
          )}
        </label>

        {/* 기본 배송지 (우편번호 검색 연동) */}
        <fieldset className="space-y-3 border-t border-zinc-200 pt-5" disabled={disabled}>
          <legend className="text-sm font-medium text-zinc-800">기본배송지 *</legend>
          <div className="flex items-center gap-2">
            <input
              aria-label="우편번호"
              className={inputBaseClass + ' max-w-36 bg-zinc-50'}
              maxLength={10}
              name="postalCode"
              onChange={(event) => setPostalCode(event.target.value)}
              placeholder="우편번호"
              required
              value={postalCode}
            />
            <button aria-haspopup="dialog" className={outlineButton} onClick={searchAddress} type="button">
              주소 검색
            </button>
          </div>
          <input
            aria-label="기본 주소"
            className={inputClass + ' mt-0 bg-zinc-50'}
            maxLength={255}
            name="address"
            onChange={(event) => setAddress(event.target.value)}
            required
            value={address}
          />
          <input
            aria-label="상세 주소"
            autoComplete="address-line2"
            className={inputClass + ' mt-0'}
            maxLength={255}
            name="detailAddress"
            onChange={(event) => setDetail(event.target.value)}
            placeholder="상세 주소 (동·호수 등)"
            ref={detailAddress}
            required
            value={detail}
          />
          {/* 상세 주소 피드백 메시지 추가 */}
          <span className={`mt-1 block text-xs ${detailAddressFeedback.color}`}>
            {detailAddressFeedback.text}
          </span>
          {ADDRESS_ERROR_FIELDS.filter((f) => f !== 'defaultAddress.detailAddress').map(
            (field) => fields?.[field] && <p className="text-xs text-red-700" key={field}>{fields[field]}</p>,
          )}
        </fieldset>

        {/* 필수 약관 동의 */}
        <fieldset className="space-y-3 border-t border-zinc-200 pt-5" disabled={disabled}>
          <legend className="text-sm font-medium text-zinc-800">약관 동의</legend>
          {terms.map(({ name, label, description }) => (
            <div className="space-y-1" key={name}>
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  checked={termsConsent[name]}
                  className="size-4 accent-zinc-950"
                  name={name}
                  onChange={(event) => {
                    setTermsConsent({ ...termsConsent, [name]: event.target.checked })
                    setError(null)
                  }}
                  required
                  type="checkbox"
                />
                {label} (필수)
                {!termsConsent[name] &&
                  <span className="text-xs text-red-700">체크해 주세요</span>
                }
              </label>
              <details className="pl-6 text-xs leading-5 text-zinc-600">
                <summary className="cursor-pointer">{label} 내용 보기</summary>
                <p>{description}</p>
              </details>
            </div>
          ))}
          {fields?.termsConsent && <p className="text-xs text-red-700">{fields.termsConsent}</p>}
        </fieldset>

        {/* 일반 에러 메시지 */}
        {error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">
            {error.message}
          </p>
        )}

        {/* 제출 버튼 */}
        <button
          className="h-13 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || !canSubmit || signupRetryUntil > 0}
          type="submit"
        >
          {pending ? '가입 요청 중…' : '회원가입'}
        </button>

        {/* 로그인 링크 */}
        <p className="text-center text-sm text-zinc-500">
          이미 계정이 있으신가요?{' '}
          <Link className="font-semibold text-zinc-900 underline underline-offset-4" href="/?login=1">
            스토어에서 로그인
          </Link>
        </p>
      </form>

      {/* 스토어 복귀 링크 */}
      <div className="mt-7 text-center">
        <Link className="text-xs font-medium tracking-[0.1em] text-zinc-500 hover:text-black" href="/">
          ← BACK TO STORE
        </Link>
      </div>

      {/* 주소 검색 다이얼로그 모달 */}
      <dialog
        aria-labelledby="signup-postcode-title"
        className={dialogClass}
        onCancel={(event) => {
          event.preventDefault()
          closeAddressSearch()
        }}
        ref={postcodeDialog}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-medium" id="signup-postcode-title">주소 검색</h2>
          <button className={outlineButton} onClick={closeAddressSearch} type="button">닫기</button>
        </div>
        {postcodeMessage && <p className="text-sm text-zinc-700" role="status">{postcodeMessage}</p>}
        <div className="h-[min(55vh,440px)]" ref={postcodeHost} />
      </dialog>

      {/* 가입 완료 안내 모달 */}
      <dialog
        aria-labelledby="signup-success"
        className={dialogClass}
        onCancel={(event) => event.preventDefault()}
        ref={successDialog}
      >
        <h2 className="text-xl font-medium" id="signup-success">회원가입이 완료되었습니다.</h2>
        <button
          className="mt-5 h-12 rounded-md bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
          onClick={() => router.replace('/?login=1')}
          type="button"
        >
          확인
        </button>
      </dialog>
    </section>
  )
}
