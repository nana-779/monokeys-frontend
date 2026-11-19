'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BackendErrorState } from '@/components/common/backend-error-state'
import { ProductCard } from '@/components/common/product-card'
import { getPaginatedProducts } from '@/features/products/api'
import type { StoreProduct } from '@/lib/store-shared'

const SORT_OPTIONS = [
  { value: 'default', label: '기본순' },
  { value: 'price_asc', label: '낮은 가격순' },
  { value: 'price_desc', label: '높은 가격순' },
  { value: 'latest', label: '최신 등록순' },
] as const

export function ProductGrid() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get('category') || 'all'
  const currentSubcategory = searchParams.get('subcategory') || ''
  const currentKeyword = searchParams.get('keyword') || ''
  const currentSort = searchParams.get('sort') || 'default'
  const pageParam = parseInt(searchParams.get('page') || '0', 10)
  const currentPage = isNaN(pageParam) ? 0 : pageParam

  const [keywordInput, setKeywordInput] = useState(currentKeyword)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    setKeywordInput(currentKeyword)
  }, [currentKeyword])

  // URL 파라미터가 바뀔 때마다 백엔드 API에서 실시간 데이터 로드
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)

    getPaginatedProducts({
      categoryId: currentCategory === 'all' ? undefined : currentCategory,
      subcategoryId: currentSubcategory || undefined,
      keyword: currentKeyword || undefined,
      sort: currentSort === 'default' ? undefined : currentSort,
      page: currentPage,
      size: 16,
    })
      .then((res) => {
        if (!ignore) {
          setProducts(res.content)
          setTotalPages(res.totalPages)
          setTotalElements(res.totalElements)
        }
      })
      .catch((err) => {
        console.error('Failed to load products:', err)
        if (!ignore) {
          setProducts([])
          setTotalPages(1)
          setTotalElements(0)
          setError(err instanceof Error ? err.message : '상품 목록을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [currentCategory, currentSubcategory, currentKeyword, currentSort, currentPage, retryCount])

  const pushQueryUpdate = (patch: {
    subcategory?: string | null
    keyword?: string | null
    sort?: string | null
    page?: number | null
  }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (patch.subcategory !== undefined) {
      if (patch.subcategory) params.set('subcategory', patch.subcategory)
      else params.delete('subcategory')
    }
    if (patch.keyword !== undefined) {
      const clean = patch.keyword?.trim()
      if (clean) params.set('keyword', clean)
      else params.delete('keyword')
    }
    if (patch.sort !== undefined) {
      if (patch.sort && patch.sort !== 'default') params.set('sort', patch.sort)
      else params.delete('sort')
    }
    if (patch.page !== undefined) {
      if (patch.page && patch.page > 0) params.set('page', String(patch.page))
      else params.delete('page')
    }
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`)
    })
  }

  // 서브카테고리 제거
  const handleClearSubcategory = () => {
    pushQueryUpdate({ subcategory: null, page: 0 })
  }

  // 검색어 제거
  const handleClearKeyword = () => {
    setKeywordInput('')
    pushQueryUpdate({ keyword: null, page: 0 })
  }

  // 인라인 검색 실행
  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    pushQueryUpdate({ keyword: keywordInput, page: 0 })
  }

  // 페이지 이동
  const handlePageChange = (newPage: number) => {
    pushQueryUpdate({ page: newPage })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* 상단 검색 · 정렬 · 활성 필터 바 */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <form
          className="flex min-w-[240px] flex-1 max-w-md items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-within:border-zinc-950"
          onSubmit={handleSearchSubmit}
        >
          <input
            aria-label="상품 목록 내 검색"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="상품명, 스위치, 재질(PBT/알루미늄), 배열(65%) 검색"
            type="search"
            value={keywordInput}
          />
          {keywordInput && (
            <button
              aria-label="입력한 검색어 지우기"
              className="text-xs text-zinc-400 hover:text-zinc-900"
              onClick={handleClearKeyword}
              type="button"
            >
              지우기
            </button>
          )}
          <button
            className="rounded bg-zinc-950 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
            type="submit"
          >
            검색
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-2">
            {currentSubcategory && (
              <span className="inline-flex items-center gap-1.5 rounded bg-zinc-100 px-2.5 py-1 text-zinc-800">
                <span>서브: {currentSubcategory}</span>
                <button
                  aria-label="서브카테고리 필터 제거"
                  className="font-bold hover:text-black"
                  onClick={handleClearSubcategory}
                  type="button"
                >
                  ×
                </button>
              </span>
            )}
            {currentKeyword && (
              <span className="inline-flex items-center gap-1.5 rounded bg-zinc-950 px-2.5 py-1 font-medium text-white">
                <span>검색: &ldquo;{currentKeyword}&rdquo;</span>
                <button
                  aria-label="검색어 필터 제거"
                  className="font-bold text-zinc-300 hover:text-white"
                  onClick={handleClearKeyword}
                  type="button"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          <select
            aria-label="상품 정렬"
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 outline-none focus:border-zinc-950"
            onChange={(e) => pushQueryUpdate({ sort: e.target.value, page: 0 })}
            value={currentSort}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="font-medium text-zinc-700">총 {totalElements}개 상품</span>
        </div>
      </div>

      {/* 상품 그리드 목록 */}
      {loading ? (
        <div className="py-24 text-center text-sm text-zinc-400">
          상품 목록을 불러오는 중입니다...
        </div>
      ) : error ? (
        <BackendErrorState
          message={error}
          onRetry={() => setRetryCount((prev) => prev + 1)}
          title="상품 목록을 불러오지 못했습니다"
        />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-24 text-center text-zinc-500">
          {currentKeyword ? (
            <div className="space-y-4">
              <p className="text-sm">
                &ldquo;<span className="font-semibold text-zinc-900">{currentKeyword}</span>&rdquo;에
                대한 검색 결과가 없습니다.
              </p>
              <button
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={handleClearKeyword}
                type="button"
              >
                검색 초기화 및 전체 보기
              </button>
            </div>
          ) : (
            '해당 조건에 등록된 상품이 없습니다.'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {products.map((product, idx) => (
            <ProductCard key={product.id} priority={idx < 4} product={product} />
          ))}
        </div>
      )}

      {/* 페이지네이션 (1페이지 이상일 때 표시) */}
      {totalPages > 1 && (
        <div className="mt-14 flex items-center justify-center gap-2">
          <button
            className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage === 0 || loading || isPending}
            onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
            type="button"
          >
            이전
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                className={`h-8 w-8 rounded text-xs font-medium transition ${
                  currentPage === idx
                    ? 'bg-zinc-950 text-white'
                    : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
                disabled={loading || isPending}
                key={idx}
                onClick={() => handlePageChange(idx)}
                type="button"
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <button
            className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage >= totalPages - 1 || loading || isPending}
            onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))}
            type="button"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
