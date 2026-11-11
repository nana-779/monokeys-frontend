'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkSignupEmail, signUpCustomer } from '@/features/user/api'
import { ApiRequestError } from '@/lib/api-client'

const inputBaseClass =
  'h-12 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5'
const inputClass = 'mt-2 ' + inputBaseClass
const outlineButton =
  'h-12 shrink-0 rounded-md border border-zinc-300 px-4 text-sm font-medium transition hover:border-zinc-950 hover:bg-zinc-50 disabled:opacity-60'
const dialogClass =
  'm-auto w-[min(92%,480px)] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-black/50'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^010[0-9]{8}$/

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

type EmailCheck = { email: string; available: boolean; message: string }
type FormError = { message: string }

// 서버와 같은 정책으로 제출 전에 안내합니다. 브라우저 검사는 우회할 수 있으므로 최종 검증은 서버가 다시 수행합니다.
function validPassword(password: string) {
  const length = Array.from(password).length
  return length >= 8 && length <= 20 && /[a-z]/i.test(password) && /[0-9]/.test(password)
    && new TextEncoder().encode(password).length <= 72
}

/** 가입 입력과 사전 확인, 주소 선택, 제출 결과를 관리합니다. HTTP 요청 형식과 오류 해석은 회원 API에 맡깁니다. */
export default function SignupPage() {
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
  const [error, setError] = useState<FormError | null>(null)
  const [pending, setPending] = useState(false)
  const emailRequest = useRef<AbortController | null>(null)
  const detailAddress = useRef<HTMLInputElement>(null)
  const normalizedEmail = email.trim()
  const currentEmailCheck = emailCheck?.email === normalizedEmail ? emailCheck : null
  const available = currentEmailCheck?.available === true
  const emailValid = emailPattern.test(normalizedEmail) && normalizedEmail.length <= 100
  const disabled = pending
  // 재입력 칸에서 벗어나거나 가입을 시도하면 불일치를 표시합니다.
  // 그 뒤에는 두 칸의 현재 값을 비교해 어느 쪽을 수정해도 안내를 갱신합니다.
  const passwordsMatch = password === passwordConfirm
  const showPasswordMismatch = passwordConfirmTouched && !passwordsMatch
  const passwordValid = validPassword(password)
  const phoneValid = phonePattern.test(phone)
  const hasRequiredFields = !!(name.trim() && postalCode.trim() && address.trim() && detail.trim())
  const canSubmit = available && passwordValid && phoneValid
    && hasRequiredFields && termsConsent.serviceTerms && termsConsent.privacyPolicy

  // 형식이 맞는 이메일의 입력이 500ms 동안 멈추면 중복을 확인합니다.
  // 이메일을 바꾸면 이전 결과를 지우고 요청을 취소해 현재 주소의 결과만 사용합니다.
  useEffect(() => {
    const addressToCheck = email.trim()
    if (!emailPattern.test(addressToCheck) || addressToCheck.length > 100) return

    // 이전 이메일의 응답이 나중에 도착해도 현재 입력의 중복 확인 결과를 덮어쓰지 않도록 요청마다 취소 신호를 둡니다.
    const request = new AbortController()
    emailRequest.current = request
    const timer = window.setTimeout(async () => {
      try {
        const available = await checkSignupEmail(addressToCheck, request.signal)
        if (!request.signal.aborted) {
          setEmailCheck({
            email: addressToCheck,
            available,
            message: available ? '사용 가능한 이메일입니다.' : '중복된 이메일입니다.',
          })
        }
      } catch (error) {
        if (!request.signal.aborted) {
          setEmailCheck({
            email: addressToCheck,
            available: false,
            message: error instanceof ApiRequestError && error.status === 400
              ? error.message
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

  function searchAddress() {
    setError({ message: '주소 검색 기능은 아직 연결되지 않았습니다. 우편번호와 주소를 직접 입력해 주세요.' })
  }

  function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordConfirmTouched(true)
    if (!passwordsMatch || !canSubmit) return
    setError({ message: '회원가입 기능은 아직 연결되지 않았습니다.' })
  }

  const emailFeedback = (email && !emailValid ? '올바른 이메일 형식으로 입력해 주세요.'
    : currentEmailCheck?.message || (emailValid ? '이메일 중복을 확인하고 있습니다.' : ''))

  return (
    <section className="mx-auto w-[min(92%,560px)] py-14 sm:py-20">
      <div className="mb-8 text-center">
        <p className="text-[10px] font-semibold tracking-[0.24em] text-zinc-500">
          MONO / KEYS · ACCOUNT
        </p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.06em] sm:text-5xl">회원가입</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          계정을 만들고 더 편안한 쇼핑을 시작해 보세요.
        </p>
      </div>

      <form className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9" onSubmit={submitSignup}>
        <label className="block text-sm font-medium text-zinc-800">
          이메일
          <input
            aria-describedby="signup-email-feedback"
            autoComplete="email"
            className={inputClass}
            disabled={disabled}
            maxLength={100}
            name="email"
            onChange={(event) => {
              emailRequest.current?.abort()
              setEmail(event.target.value)
              setEmailCheck(null)
              setError(null)
            }}
            placeholder="example@email.com"
            required
            type="email"
            value={email}
          />
          <span className="mt-1 block text-xs text-zinc-600" id="signup-email-feedback" role="status">
            {emailFeedback}
          </span>
        </label>

        <label className="block text-sm font-medium text-zinc-800">
          비밀번호
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
          <span className="mt-1 block text-xs text-zinc-600" id="signup-password-feedback">
            {(password && !passwordValid ? '8~20자이며 영문과 숫자를 포함해야 합니다.' : '')}
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-zinc-800" htmlFor="signup-password-confirm">비밀번호 확인</label>
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
          <p className="mt-1 text-xs text-red-700" id="signup-password-confirm-feedback" role="status">
            {showPasswordMismatch && '비밀번호가 일치하지 않습니다.'}
          </p>
        </div>

        <label className="block text-sm font-medium text-zinc-800">
          이름
          <input autoComplete="name" className={inputClass} disabled={disabled} maxLength={50}
            name="name" onChange={(event) => setName(event.target.value)} placeholder="이름을 입력해 주세요"
            required value={name} />
        </label>

        <label className="block text-sm font-medium text-zinc-800">
          전화번호
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
            value={[phone.slice(0, 3), phone.slice(3, 7), phone.slice(7)].filter(Boolean).join('-')}
          />
          {(phoneTouched && !phoneValid) && (
            <span className="mt-1 block text-xs text-red-700">
              {'010으로 시작하는 11자리 연락처를 입력해 주세요.'}
            </span>
          )}
        </label>

        <fieldset className="space-y-3 border-t border-zinc-200 pt-5" disabled={disabled}>
          <legend className="text-sm font-medium text-zinc-800">기본배송지</legend>
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
            value={detail}
            placeholder="상세 주소 (동·호수 등)"
            ref={detailAddress}
            required
          />
        </fieldset>

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
              </label>
              <details className="pl-6 text-xs leading-5 text-zinc-600">
                <summary className="cursor-pointer">{label} 내용 보기</summary>
                <p>{description}</p>
              </details>
            </div>
          ))}
        </fieldset>

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">{error.message}</p>
        )}

        <button
          className="h-13 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50"
          disabled={disabled || !canSubmit}
          type="submit"
        >
          {pending ? '가입 요청 중…' : '회원가입'}
        </button>

        <p className="text-center text-sm text-zinc-500">
          이미 계정이 있으신가요?{' '}
          <Link className="font-semibold text-zinc-900 underline underline-offset-4" href="/">
            스토어에서 로그인
          </Link>
        </p>
      </form>

      <div className="mt-7 text-center">
        <Link className="text-xs font-medium tracking-[0.1em] text-zinc-500 hover:text-black" href="/">
          ← BACK TO STORE
        </Link>
      </div>
    </section>
  )
}
