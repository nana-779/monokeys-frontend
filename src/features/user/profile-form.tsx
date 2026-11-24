'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCurrentUser, type ApiUser } from '@/features/auth/api'
import { updateMyProfile } from '@/features/user/api'
import { loadPostcode, postcodeError } from '@/features/user/postcode'
import type { WithdrawalSession } from '@/features/user/withdrawal-session'
import { ApiRequestError } from '@/lib/api-client'

// 회원가입 화면과 같은 입력칸·버튼 스타일을 씁니다.
const inputClass =
  'mt-2 h-12 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5 read-only:bg-zinc-50'
const outlineButton =
  'h-12 shrink-0 rounded-md border border-zinc-300 px-4 text-sm font-medium transition hover:border-zinc-950 hover:bg-zinc-50 disabled:opacity-60'
const primaryButton =
  'h-12 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40'
const dialogClass =
  'm-auto w-[min(92%,480px)] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-black/50'
const cardClass = 'space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9'

// 회원가입·백엔드와 같은 규칙입니다. 전화번호는 하이픈 없이 010으로 시작하는 숫자 11자리만 저장합니다.
const phonePattern = /^010[0-9]{8}$/
const postalPattern = /^[0-9]{5}$/

type ProfileValues = {
  name: string
  phoneNumber: string // 숫자만
  postalCode: string
  address: string
  detailAddress: string
}

function toValues(user: ApiUser): ProfileValues {
  return {
    name: user.name ?? '',
    phoneNumber: (user.phone ?? '').replace(/[^0-9]/g, ''),
    postalCode: user.postalCode ?? '',
    address: user.roadAddress ?? '',
    detailAddress: user.detailAddress ?? '',
  }
}

// 숫자만 저장하고 화면에는 010-1234-5678 형식으로 보여 줍니다.
function formatPhone(digits: string) {
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

// 서버로 보내기 전에 화면에서 먼저 확인합니다. 서버도 같은 규칙으로 다시 검사합니다.
function validate(values: ProfileValues) {
  if (!values.name.trim()) return '이름을 입력해 주세요.'
  if (values.name.length > 50) return '이름은 50자 이하로 입력해 주세요.'
  if (!phonePattern.test(values.phoneNumber)) return '010으로 시작하는 11자리 번호를 입력해 주세요.'
  if (!postalPattern.test(values.postalCode) || !values.address.trim()) return '주소 검색으로 기본 배송지를 선택해 주세요.'
  if (!values.detailAddress.trim()) return '상세 주소를 입력해 주세요.'
  if (values.address.length > 255 || values.detailAddress.length > 255) return '주소는 255자 이하로 입력해 주세요.'
  return ''
}

/** 이름·전화번호·기본 배송지를 수정하는 폼입니다. 이메일은 수정할 수 없어 읽기 전용으로 보여 줍니다. */
export function ProfileForm({ session }: { session: WithdrawalSession }) {
  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState<ProfileValues | null>(null) // 서버에 저장된 값 (변경 여부 비교용)
  const [values, setValues] = useState<ProfileValues | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [postcodeMessage, setPostcodeMessage] = useState('')
  const postcodeDialog = useRef<HTMLDialogElement>(null)
  const postcodeHost = useRef<HTMLDivElement>(null)
  const postcodeSession = useRef<symbol | null>(null)
  const detailInput = useRef<HTMLInputElement>(null)

  // 기존 로그인 상태 조회 API(GET /api/auth/me)로 현재 회원정보와 기본 배송지를 채웁니다.
  useEffect(() => {
    let active = true
    void getCurrentUser()
      .then(({ user }) => {
        if (!active) return
        if (!user) { setLoadError(true); return }
        setEmail(user.email)
        setSaved(toValues(user))
        setValues(toValues(user))
      })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])

  if (loadError) {
    return (
      <div className={cardClass}>
        <p role="alert" className="text-sm text-zinc-600">회원 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
      </div>
    )
  }
  if (!values || !saved) {
    return <div className={cardClass}><p role="status" className="text-sm text-zinc-600">회원 정보를 불러오고 있어요.</p></div>
  }

  const changed = (Object.keys(values) as Array<keyof ProfileValues>).some((key) => values[key] !== saved[key])

  function update(key: keyof ProfileValues, value: string) {
    setValues((current) => current && { ...current, [key]: value })
    setMessage(null)
  }

  function closeAddressSearch() {
    postcodeSession.current = null
    postcodeHost.current?.replaceChildren()
    postcodeDialog.current?.close()
    setPostcodeMessage('')
  }

  // 회원가입과 같은 카카오 우편번호 검색을 씁니다.
  async function searchAddress() {
    const dialog = postcodeDialog.current
    const host = postcodeHost.current
    if (!dialog || !host || dialog.open) return

    const current = Symbol()
    postcodeSession.current = current
    const isCurrent = () => dialog.isConnected && dialog.open && postcodeSession.current === current

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
          setValues((v) => v && { ...v, postalCode: zonecode, address: roadAddress, detailAddress: '' })
          setMessage(null)
          closeAddressSearch()
          detailInput.current?.focus()
        },
      }).embed(host, { autoClose: false })
    } catch {
      if (isCurrent()) setPostcodeMessage(postcodeError)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values || !changed || pending) return
    const error = validate(values)
    if (error) { setMessage({ type: 'error', text: error }); return }

    setPending(true)
    setMessage(null)
    try {
      const user = await updateMyProfile({
        name: values.name.trim(),
        phoneNumber: values.phoneNumber,
        postalCode: values.postalCode,
        address: values.address,
        detailAddress: values.detailAddress.trim(),
      })
      setSaved(toValues(user))
      setValues(toValues(user))
      // 헤더·마이페이지에 보이는 로그인 사용자 정보도 새로고침 없이 바로 바꿉니다.
      session.updateUser(user)
      setMessage({ type: 'success', text: '회원정보가 수정되었습니다.' })
    } catch (error) {
      // 실패하면 입력값은 그대로 두고 서버 메시지를 보여 줍니다.
      const text = error instanceof ApiRequestError && error.status === 401
        ? '로그인 정보를 다시 확인해 주세요.'
        : error instanceof Error && error.message ? error.message : '회원정보를 수정하지 못했습니다.'
      setMessage({ type: 'error', text })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <form className={cardClass} onSubmit={submit} noValidate>
        <h2 className="text-xl font-medium">회원정보</h2>

        <label className="block text-sm font-medium text-zinc-800">
          이메일
          <input className={inputClass} value={email} readOnly aria-describedby="profile-email-help" />
          <span id="profile-email-help" className="mt-1 block text-xs text-zinc-500">로그인에 사용하는 이메일은 변경할 수 없습니다.</span>
        </label>

        <label className="block text-sm font-medium text-zinc-800">
          이름
          <input className={inputClass} maxLength={50} autoComplete="name" value={values.name}
            onChange={(e) => update('name', e.target.value)} />
        </label>

        <label className="block text-sm font-medium text-zinc-800">
          연락처
          <input className={inputClass} inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000"
            value={formatPhone(values.phoneNumber)}
            onChange={(e) => update('phoneNumber', e.target.value.replace(/[^0-9]/g, '').slice(0, 11))} />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-800">기본 배송지</legend>
          <div className="flex gap-2">
            <input aria-label="우편번호" className={`${inputClass} mt-0 max-w-36`} value={values.postalCode} readOnly />
            <button className={outlineButton} onClick={searchAddress} type="button">주소 검색</button>
          </div>
          <input aria-label="기본 주소" className={`${inputClass} mt-0`} value={values.address} readOnly />
          <input aria-label="상세 주소" ref={detailInput} className={`${inputClass} mt-0`} maxLength={255}
            autoComplete="address-line2" placeholder="상세 주소 (동·호수 등)" value={values.detailAddress}
            onChange={(e) => update('detailAddress', e.target.value)} />
          <p className="text-xs leading-5 text-zinc-500">이름·연락처를 바꾸면 기본 배송지의 받는 사람 이름·연락처에도 함께 적용됩니다.</p>
        </fieldset>

        {message && (
          <p role={message.type === 'error' ? 'alert' : 'status'}
            className={`rounded-md px-4 py-3 text-sm leading-6 ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-800'}`}>
            {message.text}
          </p>
        )}

        <button className={primaryButton} disabled={!changed || pending} type="submit">
          {pending ? '저장 중…' : '저장'}
        </button>
      </form>

      <dialog aria-labelledby="profile-postcode-title" className={dialogClass} ref={postcodeDialog}
        onCancel={(event) => { event.preventDefault(); closeAddressSearch() }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-medium" id="profile-postcode-title">주소 검색</h2>
          <button className={outlineButton} onClick={closeAddressSearch} type="button">닫기</button>
        </div>
        {postcodeMessage && <p className="text-sm text-zinc-700" role="status">{postcodeMessage}</p>}
        <div className="h-[min(55vh,440px)]" ref={postcodeHost} />
      </dialog>
    </>
  )
}
