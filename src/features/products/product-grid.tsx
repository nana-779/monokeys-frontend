'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BackendErrorState } from '@/components/common/backend-error-state'
import { ProductCard } from '@/components/common/product-card'
import { getCategories, getPaginatedProducts } from '@/features/products/api'
import type { Category } from '@/features/products/types'
import type { StoreProduct } from '@/lib/store-shared'

const CATEGORY_LABELS: Record<string, string> = {
  all: '전체 상품',
  housing: '하우징',
  pcb: '기판 (PCB)',
  keyboards: '기판 (PCB)',
  switches: '스위치',
  keycaps: '키캡',
}

const SUBCATEGORY_LABELS: Record<string, { label: string; parentId: string }> = {
  'housing-alu': { label: '알루미늄', parentId: 'housing' },
  'housing-pc': { label: '폴리카보네이트', parentId: 'housing' },
  'housing-wood': { label: '목재', parentId: 'housing' },
  'housing-acrylic': { label: '아크릴', parentId: 'housing' },
  'housing-plastic': { label: '플라스틱', parentId: 'housing' },
  'housing-abs': { label: '플라스틱', parentId: 'housing' },
  'kb-65': { label: '65%', parentId: 'pcb' },
  'kb-75': { label: '75%', parentId: 'pcb' },
  'kb-tkl': { label: '텐키리스', parentId: 'pcb' },
  'pcb-hotswap': { label: '핫스왑', parentId: 'pcb' },
  'pcb-solder': { label: '솔더링', parentId: 'pcb' },
  'pcb-wireless': { label: '유무선/블루투스', parentId: 'pcb' },
  'switch-linear': { label: '리니어', parentId: 'switches' },
  'switch-tactile': { label: '택타일', parentId: 'switches' },
  'switch-silent': { label: '저소음', parentId: 'switches' },
  'switch-click': { label: '클릭', parentId: 'switches' },
  'keycap-pbt': { label: 'PBT', parentId: 'keycaps' },
  'keycap-abs': { label: 'ABS', parentId: 'keycaps' },
  'keycap-pom': { label: 'POM', parentId: 'keycaps' },
  'keycap-custom': { label: '커스텀 풀 컬러 키캡', parentId: 'keycaps' },
}

function resolveCategoryBadge(
  rawCategory: string,
  rawSubcategory: string,
  categories: Category[],
): { text: string; clearType: 'none' | 'category' | 'subcategory' } {
  const normCategory = rawCategory.trim().toLowerCase()
  const normSubcategory = rawSubcategory.trim().toLowerCase()
  const effectiveCategory = normCategory === 'keyboards' ? 'pcb' : normCategory
  const effectiveSubcategory = normSubcategory === 'housing-abs' ? 'housing-plastic' : normSubcategory

  const findParentLabel = (catId: string): string => {
    const dynamic = categories.find((c) => c.id.toLowerCase() === catId)
    if (dynamic) return dynamic.label
    return CATEGORY_LABELS[catId] || catId
  }

  if (effectiveSubcategory) {
    let parentId = effectiveCategory && effectiveCategory !== 'all' ? effectiveCategory : ''
    let subLabel = ''

    for (const cat of categories) {
      const matched = cat.subcategories?.find((s) => s.id.toLowerCase() === effectiveSubcategory)
      if (matched) {
        subLabel = matched.name
        if (!parentId && cat.id !== 'all') parentId = cat.id
        break
      }
    }

    const fallbackSub = SUBCATEGORY_LABELS[effectiveSubcategory]
    if (!subLabel) subLabel = fallbackSub?.label || rawSubcategory
    if (!parentId && fallbackSub) parentId = fallbackSub.parentId

    const parentLabel = parentId ? findParentLabel(parentId) : ''
    return {
      text: parentLabel ? `${parentLabel}-${subLabel}` : subLabel,
      clearType: 'subcategory',
    }
  }

  if (effectiveCategory && effectiveCategory !== 'all') {
    return {
      text: findParentLabel(effectiveCategory),
      clearType: 'category',
    }
  }

  return { text: '전체 상품', clearType: 'none' }
}

const SORT_OPTIONS = [
  { value: 'default', label: '기본순' },
  { value: 'price_asc', label: '낮은 가격순' },
  { value: 'price_desc', label: '높은 가격순' },
  { value: 'latest', label: '최신 등록순' },
  { value: 'name_asc', label: '이름순' },
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

  const [products, setProducts] = useState<StoreProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let ignore = false
    getCategories()
      .then((list) => {
        if (!ignore && Array.isArray(list)) setCategories(list)
      })
      .catch(() => {
        // 카테고리 조회 실패 시 정적 한글 매핑으로 안전 fallback
      })
    return () => {
      ignore = true
    }
  }, [])

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
    category?: string | null
    subcategory?: string | null
    keyword?: string | null
    sort?: string | null
    page?: number | null
  }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (patch.category !== undefined) {
      if (patch.category) params.set('category', patch.category)
      else params.delete('category')
    }
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

  // 대분류 제거 (전체 상품으로 복귀)
  const handleClearCategory = () => {
    pushQueryUpdate({ category: null, subcategory: null, page: 0 })
  }

  // 서브카테고리 제거 (상위 대분류로 복귀)
  const handleClearSubcategory = () => {
    pushQueryUpdate({ subcategory: null, page: 0 })
  }

  const categoryBadge = resolveCategoryBadge(currentCategory, currentSubcategory, categories)

  // 검색어 제거
  const handleClearKeyword = () => {
    pushQueryUpdate({ keyword: null, page: 0 })
  }

  // 페이지 이동
  const handlePageChange = (newPage: number) => {
    pushQueryUpdate({ page: newPage })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* 상단 활성 필터 · 정렬 · 총 개수 바 (검색 입력은 헤더 SEARCH에만 위치) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded bg-zinc-100 px-2.5 py-1 font-medium text-zinc-800">
            <span>{categoryBadge.text}</span>
            {categoryBadge.clearType !== 'none' && (
              <button
                aria-label={
                  categoryBadge.clearType === 'subcategory'
                    ? '소분류 필터 제거'
                    : '카테고리 필터 제거'
                }
                className="font-bold hover:text-black"
                onClick={
                  categoryBadge.clearType === 'subcategory'
                    ? handleClearSubcategory
                    : handleClearCategory
                }
                type="button"
              >
                ×
              </button>
            )}
          </span>
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

        <div className="flex items-center gap-3">
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
          <span>총 {totalElements}개 상품</span>
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
                className={`h-8 w-8 rounded text-xs font-medium transition ${currentPage === idx
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
