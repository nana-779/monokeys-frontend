export type StoreMedia = {
  id: string | number
  url?: string | null
  alt?: string | null
  width?: number | null
  height?: number | null
}

export type StoreProduct = {
  id: string | number
  name: string
  slug: string
  basePrice: number
  category: 'keyboards' | 'switches' | 'keycaps' | 'housing'
  description: string
  stockQuantity: number
  shippingFee: number
  brand: string
  kcCertificationNumber?: string | null
  options?: Array<{
    id?: string | null
    label: string
    value: string
    priceAdjustment: number
  }> | null
  images: Array<string | number | StoreMedia>
}

export function mediaFrom(value: StoreProduct['images'][number]): StoreMedia | null {
  return typeof value === 'object' ? value : null
}

export function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
