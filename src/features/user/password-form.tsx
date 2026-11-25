'use client'

import { useState, type FormEvent } from 'react'
import { changeMyPassword } from '@/features/user/api'
import { ApiRequestError } from '@/lib/api-client'

const inputClass =
  'mt-2 h-12 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/5'
const primaryButton =
  'h-12 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40'
const cardClass = 'space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9'

// 회원가입·백엔드와 같은 규칙: 8~20자, 영문과 숫자 포함, UTF-8 72바이트 이하
function meetsPasswordPolicy(password: string) {
  const length = Array.from(password).length
  return length >= 8 && length <= 20
    && /[A-Za-z]/.test(password)
    && /[0-9]/.test(password)
    && new TextEncoder().encode(password).length <= 72
}

// 서버로 보내기 전에 화면에서 먼저 확인합니다. 새 비밀번호 확인값은 서버로 보내지 않습니다.
function validate(current: string, next: string, confirm: string) {
  if (!current || !next || !confirm) return '모든 칸을 입력해 주세요.'
  if (!meetsPasswordPolicy(next)) return '비밀번호는 8~20자이며 영문과 숫자를 포함해야 합니다.'
  if (next !== confirm) return '새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.'
  if (next === current) return '현재와 다른 비밀번호를 입력해 주세요.'
  return ''
}

/** 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾸는 폼입니다. 성공하면 onChanged로 페이지에 알립니다. */
export function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const message = validate(currentPassword, newPassword, newPasswordConfirm)
    if (message) { setError(message); return }

    setPending(true)
    setError('')
    try {
      await changeMyPassword(currentPassword, newPassword)
      // 서버가 인증 쿠키를 만료시켰으므로 페이지에서 완료 안내 후 로그아웃 상태로 바꿉니다.
      onChanged()
    } catch (error) {
      // 실패하면 비밀번호 칸은 비우지 않고 서버 메시지를 보여 줍니다. (현재 비밀번호 불일치 403 등)
      setError(error instanceof ApiRequestError && error.status === 401
        ? '로그인 정보를 다시 확인해 주세요.'
        : error instanceof Error && error.message ? error.message : '비밀번호를 변경하지 못했습니다.')
      setPending(false)
    }
  }

  function input(setter: (value: string) => void) {
    return (event: { target: { value: string } }) => { setter(event.target.value); setError('') }
  }

  return (
    <form className={cardClass} onSubmit={submit} noValidate>
      <h2 className="text-xl font-medium">비밀번호 변경</h2>

      <label className="block text-sm font-medium text-zinc-800">
        현재 비밀번호
        <input className={inputClass} type="password" autoComplete="current-password" maxLength={20}
          value={currentPassword} onChange={input(setCurrentPassword)} />
      </label>

      <label className="block text-sm font-medium text-zinc-800">
        새 비밀번호
        <input className={inputClass} type="password" autoComplete="new-password" maxLength={20}
          placeholder="8~20자, 영문과 숫자 포함" value={newPassword} onChange={input(setNewPassword)} />
      </label>

      <label className="block text-sm font-medium text-zinc-800">
        새 비밀번호 확인
        <input className={inputClass} type="password" autoComplete="new-password" maxLength={20}
          value={newPasswordConfirm} onChange={input(setNewPasswordConfirm)} />
      </label>

      <p className="text-xs leading-5 text-zinc-500">비밀번호를 바꾸면 모든 기기에서 로그아웃되며, 새 비밀번호로 다시 로그인해야 합니다.</p>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>
      )}

      <button className={primaryButton} disabled={pending} type="submit">
        {pending ? '변경 중…' : '비밀번호 변경'}
      </button>
    </form>
  )
}
