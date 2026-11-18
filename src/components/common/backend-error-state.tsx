'use client'

import { useRouter } from 'next/navigation'

interface BackendErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function BackendErrorState({
  title = '상품을 불러오지 못했습니다',
  onRetry,
}: BackendErrorStateProps) {
  const router = useRouter()

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
      return
    }
    router.refresh()
  }

  return (
    <div
      className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center text-zinc-900"
      role="alert"
    >
      <h3 className="text-xl font-semibold tracking-[-0.03em] text-zinc-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        일시적인 오류로 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <div className="mt-6">
        <button
          className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-xs font-semibold tracking-wider text-white transition hover:bg-zinc-800"
          onClick={handleRetry}
          type="button"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
