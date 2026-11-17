import Link from 'next/link'
import { formatPrice, mediaFrom, type StoreProduct } from '@/lib/store-shared'
import { ProductImage } from '@/components/common/product-image'

export function ProductCard({ product }: { product: StoreProduct }) {
  const image = mediaFrom(product.images[0])
  return (
    <Link
      className="group flex aspect-[4/5] flex-col overflow-hidden bg-zinc-100"
      href={`/products/${product.id}`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ProductImage
          alt={image?.alt || product.name}
          className="absolute inset-0 h-full w-full object-cover grayscale transition duration-700 group-hover:scale-[1.035]"
          src={image?.url}
        />
      </div>
      <div className="flex min-h-24 items-end justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium tracking-[-0.025em]">{product.name}</h3>
          {product.brand && <p className="mt-1 text-[11px] text-zinc-400">{product.brand}</p>}
        </div>
        <span className="shrink-0 text-sm font-medium">{formatPrice(product.basePrice)}</span>
      </div>
    </Link>
  )
}
