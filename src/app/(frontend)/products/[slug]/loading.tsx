export default function ProductDetailLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="상품 상세 정보를 불러오는 중입니다"
      className="mx-auto w-[min(80%,1440px)] py-10 max-lg:w-[92%]"
    >
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] gap-12 max-lg:grid-cols-1">
        {/* 좌측 메인(상품 이미지 / 커스텀 키캡 에디터 공용 영역) */}
        <div className="flex min-h-[480px] items-center justify-center rounded-xl border border-[#E4E4E7] bg-[#F3F3F4] p-6 max-sm:min-h-[340px]">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              aria-hidden="true"
              className="h-6 w-6 animate-spin rounded-full border-2 border-[#D4D4D8] border-t-[#18181B]"
            />
            <span className="text-xs font-medium text-[#52525B]">상품 정보를 불러오는 중...</span>
          </div>
        </div>

        {/* 우측 상품 정보 / 구매 패널 스켈레톤 */}
        <div className="space-y-5 rounded-xl border border-[#E4E4E7] bg-white p-6">
          <div className="h-3.5 w-28 animate-pulse rounded bg-[#F4F4F5]" />
          <div className="h-9 w-3/4 animate-pulse rounded bg-[#F4F4F5]" />
          <div className="h-7 w-1/3 animate-pulse rounded bg-[#F4F4F5]" />
          <div className="h-36 w-full animate-pulse rounded-lg bg-[#F4F4F5]" />
          <div className="h-12 w-full animate-pulse rounded-md bg-[#E4E4E7]" />
        </div>
      </div>
    </section>
  )
}
