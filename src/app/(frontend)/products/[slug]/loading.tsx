export default function ProductDetailLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="상품 상세 정보를 불러오는 중입니다"
      className="mx-auto w-[min(80%,1440px)] py-10 max-lg:w-[92%]"
    >
      <div className="space-y-5">
        <div className="h-8 w-44 animate-pulse rounded-[4px] bg-[#F4F4F5]" />

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 max-xl:grid-cols-1">
          {/* 좌측 에디터 / 갤러리 스켈레톤 */}
          <div className="rounded-lg border border-[#E4E4E7] bg-white p-6 max-sm:p-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E4E7] pb-3.5">
              <div className="mr-3 h-4 w-14 animate-pulse rounded bg-[#F4F4F5]" />
              {Array.from({ length: 7 }).map((_, idx) => (
                <div className="h-8 w-20 animate-pulse rounded-[4px] bg-[#F4F4F5]" key={idx} />
              ))}
            </div>

            <div className="flex items-center justify-between border-b border-[#E4E4E7] py-3">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div className="h-9 w-16 animate-pulse rounded-[4px] bg-[#F4F4F5]" key={idx} />
                ))}
              </div>
              <div className="h-5 w-20 animate-pulse rounded bg-[#F4F4F5]" />
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_288px] gap-6 max-lg:grid-cols-[minmax(0,1fr)_260px] max-md:grid-cols-1">
              <div className="flex min-h-[420px] items-center justify-center rounded-[4px] bg-[#F3F3F4] p-6 max-sm:min-h-[320px]">
                <div className="flex flex-col items-center gap-3 text-center">
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 animate-spin rounded-full border-2 border-[#D4D4D8] border-t-[#18181B]"
                  />
                  <span className="text-xs font-medium text-[#52525B]">
                    상품 데이터를 불러오는 중...
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="h-10 w-full animate-pulse rounded bg-[#F4F4F5]" />
                <div className="h-11 w-full animate-pulse rounded-[6px] bg-[#E4E4E7]" />
                <div className="h-28 w-full animate-pulse rounded-[6px] bg-[#F4F4F5]" />
              </div>
            </div>
          </div>

          {/* 우측 구매 패널 스켈레톤 */}
          <div className="space-y-4 rounded-lg border border-[#E4E4E7] bg-white p-6 max-sm:p-4">
            <div className="h-3.5 w-32 animate-pulse rounded bg-[#F4F4F5]" />
            <div className="h-8 w-4/5 animate-pulse rounded bg-[#F4F4F5]" />
            <div className="h-7 w-28 animate-pulse rounded bg-[#F4F4F5]" />
            <div className="h-40 w-full animate-pulse rounded-[6px] bg-[#F4F4F5]" />
            <div className="h-12 w-full animate-pulse rounded-[6px] bg-[#E4E4E7]" />
          </div>
        </div>
      </div>
    </section>
  )
}
