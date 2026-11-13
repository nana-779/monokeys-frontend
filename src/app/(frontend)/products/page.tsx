import { ProductGrid } from '@/features/products/product-grid'
import { getProducts } from '@/features/products/api'
import type { StoreProduct } from '@/lib/store-shared'

export default async function ProductsPage() {
  let products: StoreProduct[] = []
  try {
    products = await getProducts()
  } catch {
    // 백엔드가 실행 중이지 않아도 카탈로그 화면은 열리도록 빈 목록을 표시합니다.
  }

  return (
    <section className="mx-auto w-[min(80%,1440px)] py-20 max-lg:w-[92%]">
      <div className="mb-16 max-w-3xl">
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-zinc-500">
          THE FULL COLLECTION
        </p>
        <h1 className="text-6xl font-medium tracking-[-0.065em] max-md:text-4xl">
          Everything for a more considered desk.
        </h1>
      </div>
      <ProductGrid products={products} />
    </section>
  )
}
