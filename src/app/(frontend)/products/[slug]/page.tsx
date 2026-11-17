import { notFound } from 'next/navigation'
import { AddToCart } from '@/features/products/add-to-cart'
import { getProductById } from '@/features/products/api'
import { formatPrice, mediaFrom, productCategoryLabels } from '@/lib/store-shared'
import { ProductImage } from '@/components/common/product-image'
import type { StoreProduct } from '@/lib/store-shared'

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let product: StoreProduct
  try {
    product = await getProductById(slug)
  } catch {
    notFound()
  }
  const images = product.images.map(mediaFrom).filter((image) => image?.url)
  const primaryImage = images[0]

  return (
    <section className="mx-auto w-[min(80%,1440px)] py-10 max-lg:w-[92%]">
      <div className="grid grid-cols-[1.25fr_.75fr] gap-16 max-lg:grid-cols-1">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">
            <ProductImage
              alt={primaryImage?.alt || product.name}
              className="absolute inset-0 h-full w-full object-cover grayscale"
              src={primaryImage?.url}
            />
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {images.slice(1, 5).map((image) => (
                <div
                  className="relative aspect-square overflow-hidden rounded-md bg-zinc-100"
                  key={image!.id}
                >
                  <ProductImage
                    alt={image!.alt || product.name}
                    className="absolute inset-0 h-full w-full object-cover grayscale"
                    src={image!.url}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {product.brand} / {productCategoryLabels[product.category]}
          </p>
          <h1 className="mt-5 text-5xl font-medium leading-none tracking-[-0.06em]">
            {product.name}
          </h1>
          <p className="mt-6 text-2xl font-medium">{formatPrice(product.basePrice)}</p>
          <p className="my-9 border-y border-zinc-200 py-7 text-base leading-7 text-zinc-600">
            {product.description}
          </p>
          <AddToCart image={primaryImage?.url ?? undefined} product={product} />
          <dl className="mt-10 grid grid-cols-2 gap-y-5 border-t border-zinc-200 pt-7 text-sm">
            <dt className="text-zinc-500">Stock</dt>
            <dd className="text-right">{product.stockQuantity} available</dd>
            <dt className="text-zinc-500">Shipping</dt>
            <dd className="text-right">
              {product.shippingFee ? formatPrice(product.shippingFee) : 'Complimentary'}
            </dd>
            <dt className="text-zinc-500">KC certification</dt>
            <dd className="text-right">{product.kcCertificationNumber || 'Not applicable'}</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}
