'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import type { ApiUser } from '@/features/auth/api'
import { getPaginatedProducts, getSearchSuggestions } from '@/features/products/api'
import { formatPrice, mediaFrom, type StoreProduct } from '@/lib/store-shared'

const RECENT_SEARCH_KEY = 'monokeys_recent_searches'

function highlightMatches(text: string, query: string): ReactNode {
  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5),
    ),
  )
  if (tokens.length === 0 || !text) return text
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  return text.split(regex).map((part, idx) =>
    idx % 2 === 1 ? (
      <mark className="rounded-xs bg-amber-100 px-0.5 font-semibold text-zinc-950" key={idx}>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

type SubCategoryItem = {
  name: string
  href: string
}

type CategoryItem = {
  label: string
  href: string
  children: SubCategoryItem[]
}

const categories: CategoryItem[] = [
  { label: '전체상품', href: '/products', children: [] },
  {
    label: 'HOUSING',
    href: '/products?category=housing',
    children: [
      { name: '알루미늄', href: '/products?category=housing&subcategory=housing-alu' },
      { name: '폴리카보네이트', href: '/products?category=housing&subcategory=housing-pc' },
      { name: '목재', href: '/products?category=housing&subcategory=housing-wood' },
      { name: '아크릴', href: '/products?category=housing&subcategory=housing-acrylic' },
      { name: '플라스틱', href: '/products?category=housing&subcategory=housing-plastic' },
    ],
  },
  {
    label: 'PCB',
    href: '/products?category=pcb',
    children: [
      { name: '65%', href: '/products?category=pcb&subcategory=kb-65' },
      { name: '75%', href: '/products?category=pcb&subcategory=kb-75' },
      { name: '텐키리스', href: '/products?category=pcb&subcategory=kb-tkl' },
      { name: '핫스왑', href: '/products?category=pcb&subcategory=pcb-hotswap' },
      { name: '유무선/블루투스', href: '/products?category=pcb&subcategory=pcb-wireless' },
    ],
  },
  {
    label: 'SWITCHES',
    href: '/products?category=switches',
    children: [
      { name: '리니어', href: '/products?category=switches&subcategory=switch-linear' },
      { name: '택타일', href: '/products?category=switches&subcategory=switch-tactile' },
      { name: '저소음', href: '/products?category=switches&subcategory=switch-silent' },
      { name: '클릭', href: '/products?category=switches&subcategory=switch-click' },
    ],
  },
  {
    label: 'KEYCAPS',
    href: '/products?category=keycaps',
    children: [
      { name: 'PBT', href: '/products?category=keycaps&subcategory=keycap-pbt' },
      { name: 'ABS', href: '/products?category=keycaps&subcategory=keycap-abs' },
      { name: 'POM', href: '/products?category=keycaps&subcategory=keycap-pom' },
      { name: '커스텀 풀 컬러 키캡', href: '/products?category=keycaps&subcategory=keycap-custom' },
    ],
  },
  { label: 'CUSTOM', href: '/custom', children: [] },
]

type SiteHeaderProps = {
  cartCount: number
  user: ApiUser | null
  visible: boolean
  onOpenCart: () => void
  onOpenAccount: () => void
}

export function SiteHeader({
  cartCount,
  user,
  visible,
  onOpenCart,
  onOpenAccount,
}: SiteHeaderProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentKeywords, setRecentKeywords] = useState<string[]>([])
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([])
  const [previewItems, setPreviewItems] = useState<StoreProduct[]>([])
  const [previewTotal, setPreviewTotal] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const closeSearchOverlay = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_SEARCH_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentKeywords(
          parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 6),
        )
      }
    } catch {
      // 손상된 최근 검색어 무시
    }
  }, [])

  const saveRecentKeyword = useCallback((keyword: string) => {
    const clean = keyword.trim()
    if (!clean) return
    setRecentKeywords((prev) => {
      const next = [clean, ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6)
      try {
        window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next))
      } catch {
        // 스토리지 제한 환경에서는 메모리 상태만 유지
      }
      return next
    })
  }, [])

  const removeRecentKeyword = (keyword: string) => {
    setRecentKeywords((prev) => {
      const next = prev.filter((item) => item !== keyword)
      try {
        window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const clearRecentKeywords = () => {
    setRecentKeywords([])
    try {
      window.localStorage.removeItem(RECENT_SEARCH_KEY)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!searchOpen) return
    let ignore = false
    getSearchSuggestions(6)
      .then((list) => {
        if (!ignore && Array.isArray(list)) {
          setSuggestedKeywords(list)
        }
      })
      .catch(() => {
        if (!ignore) setSuggestedKeywords([])
      })
    return () => {
      ignore = true
    }
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSearchOverlay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeSearchOverlay, searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    setActiveIndex(-1)
    const trimmed = query.trim()
    if (!trimmed) {
      setPreviewItems([])
      setPreviewTotal(0)
      setPreviewLoading(false)
      setPreviewError(false)
      return
    }

    let ignore = false
    setPreviewLoading(true)
    setPreviewError(false)

    const timer = window.setTimeout(() => {
      getPaginatedProducts({ keyword: trimmed, page: 0, size: 6 })
        .then((res) => {
          if (ignore) return
          setPreviewItems(res.content)
          setPreviewTotal(res.totalElements)
        })
        .catch(() => {
          if (ignore) return
          setPreviewItems([])
          setPreviewTotal(0)
          setPreviewError(true)
        })
        .finally(() => {
          if (!ignore) setPreviewLoading(false)
        })
    }, 220)

    return () => {
      ignore = true
      window.clearTimeout(timer)
    }
  }, [query, searchOpen])

  const executeSearch = (rawKeyword: string) => {
    const trimmed = rawKeyword.trim()
    closeSearchOverlay()
    if (!trimmed) {
      router.push('/products')
      return
    }
    saveRecentKeyword(trimmed)
    router.push(`/products?keyword=${encodeURIComponent(trimmed)}`)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeIndex >= 0 && previewItems[activeIndex]) {
      const chosen = previewItems[activeIndex]
      saveRecentKeyword(query)
      closeSearchOverlay()
      router.push(`/products/${chosen.id}`)
      return
    }
    executeSearch(query)
  }

  const handleSearchInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || previewItems.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev < previewItems.length - 1 ? prev + 1 : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1))
    }
  }

  const button_interaction = "cursor-pointer origin-center transition-transform duration-300 hover:scale-[1.08]"

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-zinc-300 bg-white/95 backdrop-blur transition-transform duration-500 ${visible ? 'translate-y-0' : '-translate-y-full'}`}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <div className="relative mx-auto h-[123px] w-[min(80%,1184px)] max-lg:w-[92%] md:h-[150px]">
          <Link
            className={`absolute left-0 top-4 text-sm font-semibold tracking-[-0.04em] sm:text-base ${button_interaction}`}
            href="/"
          >
            <span className="sm:hidden">M/K</span>
            <span className="hidden sm:inline">MONO / KEYS</span>
          </Link>

          <nav
            aria-label="Utility navigation"
            className="absolute right-0 top-[18px] flex items-center gap-3 text-[10px] font-medium tracking-[-0.01em] text-[#34264b] sm:gap-5 sm:text-[12px] lg:gap-7 lg:text-[15px]"
          >
            <button className={`whitespace-nowrap ${button_interaction}`} onClick={() => setSearchOpen(true)} type="button">
              SEARCH
            </button>
            <button className={`whitespace-nowrap ${button_interaction}`} onClick={onOpenCart} type="button">
              CART <span aria-label={`${cartCount} items`}>({cartCount})</span>
            </button>
            <button className={`whitespace-nowrap ${button_interaction}`} onClick={onOpenAccount} type="button">
              {user ? (user.role === 'admin' ? 'ADMIN' : 'MYPAGE') : 'LOGIN'}
            </button>
          </nav>

          <nav
            aria-label="Main navigation"
            className="absolute inset-x-0 bottom-[18px] flex items-end justify-between gap-7 overflow-x-auto pb-1 md:bottom-[20px] md:grid md:grid-cols-6 md:gap-5 md:overflow-visible md:pb-0"
          >
            {categories.map((category) => (
              <Link
                className="shrink-0 origin-bottom text-[15px] font-bold leading-none tracking-[-0.055em] transition-transform duration-300 hover:scale-[1.08] md:justify-self-center md:text-[25px]"
                href={category.href}
                key={category.label}
                onMouseEnter={() => setMenuOpen(true)}
              >
                {category.label}
              </Link>
            ))}
          </nav>
        </div>
        <div
          className={`absolute inset-x-0 top-full overflow-hidden bg-zinc-200 transition-all duration-300 ${menuOpen ? 'max-h-80 opacity-100' : 'pointer-events-none max-h-0 opacity-0'}`}
        >
          <div className="mx-auto grid w-[min(80%,1184px)] grid-cols-6 gap-5 py-9 max-lg:w-[92%] max-md:grid-cols-2">
            {categories.map((category) => (
              <div className="text-center" key={category.label}>
                {category.children.length > 0 && (
                  <ul className="space-y-2.5 text-sm text-zinc-600">
                    {category.children.map((child) => (
                      <li key={child.name}>
                        <Link
                          className="transition-colors hover:text-black"
                          href={child.href}
                          onClick={() => setMenuOpen(false)}
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      {menuOpen && (
        <button
          aria-label="Close category menu"
          className="fixed inset-0 z-40 bg-black/50"
          onMouseEnter={() => setMenuOpen(false)}
          type="button"
        />
      )}

      {searchOpen && (
        <div
          className="fixed inset-0 z-[70] overflow-y-auto bg-white/95 px-6 pb-16 pt-[min(14vh,120px)] backdrop-blur"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSearchOverlay()
          }}
        >
          <button
            aria-label="검색 닫기"
            className="fixed right-8 top-8 rounded-full border border-zinc-200 bg-white p-2 shadow-xs hover:border-zinc-400"
            onClick={closeSearchOverlay}
            type="button"
          >
            <CloseIcon />
          </button>
          <div className="mx-auto max-w-3xl">
            <form
              className="flex items-center gap-4 border-b-2 border-zinc-950 pb-4"
              onSubmit={handleSearchSubmit}
            >
              <label className="sr-only" htmlFor="store-search">
                상품 검색
              </label>
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-2xl outline-none placeholder:text-zinc-300 sm:text-4xl"
                id="store-search"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder="찾으시는 상품을 검색하세요"
                type="search"
                value={query}
              />
              {query && (
                <button
                  className="shrink-0 text-sm text-zinc-500 hover:text-zinc-900"
                  onClick={() => {
                    setQuery('')
                    setActiveIndex(-1)
                  }}
                  type="button"
                >
                  지우기
                </button>
              )}
              <button
                className="shrink-0 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold tracking-wide text-white transition hover:bg-zinc-800"
                type="submit"
              >
                검색
              </button>
            </form>

            {!query.trim() ? (
              <div className="mt-8 space-y-7">
                {recentKeywords.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-wider text-zinc-500">
                        최근 검색어
                      </span>
                      <button
                        className="text-xs text-zinc-400 hover:text-zinc-700"
                        onClick={clearRecentKeywords}
                        type="button"
                      >
                        전체 삭제
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentKeywords.map((term) => (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-800"
                          key={term}
                        >
                          <button
                            className="hover:text-black"
                            onClick={() => executeSearch(term)}
                            type="button"
                          >
                            {term}
                          </button>
                          <button
                            aria-label={`${term} 삭제`}
                            className="text-zinc-400 hover:text-red-600"
                            onClick={() => removeRecentKeyword(term)}
                            type="button"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {suggestedKeywords.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold tracking-wider text-zinc-500">
                      실시간 추천 키워드
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedKeywords.map((term) => (
                        <button
                          className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white"
                          key={term}
                          onClick={() => executeSearch(term)}
                          type="button"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-7">
                {previewLoading ? (
                  <p className="py-10 text-center text-sm text-zinc-400">
                    &ldquo;{query.trim()}&rdquo; 검색 중입니다...
                  </p>
                ) : previewError ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-8 text-center">
                    <p className="text-sm text-zinc-600">
                      상품 목록을 바로 불러오지 못했습니다.
                    </p>
                    <button
                      className="mt-3 rounded-md bg-zinc-950 px-4 py-2 text-xs font-semibold text-white"
                      onClick={() => executeSearch(query)}
                      type="button"
                    >
                      전체 상품 페이지에서 검색
                    </button>
                  </div>
                ) : previewItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-12 text-center">
                    <p className="text-sm text-zinc-600">
                      &ldquo;<span className="font-semibold text-zinc-950">{query.trim()}</span>
                      &rdquo;와 일치하는 상품이 없습니다.
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-400">
                      상품명, 스위치 종류, 재질(PBT/알루미늄), 배열(65%/TKL) 등으로 검색해 보세요.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>총 {previewTotal}개의 검색 결과</span>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-[11px] text-zinc-400 sm:inline">
                          ↑↓ 이동 · Enter 선택 · ESC 닫기
                        </span>
                        <button
                          className="font-semibold text-zinc-900 underline-offset-4 hover:underline"
                          onClick={() => executeSearch(query)}
                          type="button"
                        >
                          전체 결과 보기 →
                        </button>
                      </div>
                    </div>
                    <ul className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                      {previewItems.map((item, idx) => {
                        const image = mediaFrom(item.images[0])
                        const isHighlighted = idx === activeIndex
                        return (
                          <li key={item.id}>
                            <Link
                              className={`flex items-center gap-3.5 rounded-xl border p-2.5 transition ${
                                isHighlighted
                                  ? 'border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950'
                                  : 'border-zinc-200 bg-white hover:border-zinc-950'
                              }`}
                              href={`/products/${item.id}`}
                              onClick={() => {
                                saveRecentKeyword(query)
                                closeSearchOverlay()
                              }}
                              onMouseEnter={() => setActiveIndex(idx)}
                            >
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                                {image?.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    alt={image.alt || item.name}
                                    className="h-full w-full object-cover"
                                    src={image.url}
                                  />
                                ) : (
                                  <div className="grid h-full w-full place-items-center text-[10px] text-zinc-400">
                                    NO IMG
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-zinc-950">
                                  {highlightMatches(item.name, query)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                                  {highlightMatches(item.subCategoryName || item.brand, query)}
                                </p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-zinc-900">
                                {formatPrice(item.basePrice)}
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
