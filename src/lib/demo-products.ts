import type { StoreProduct } from '@/lib/store-shared'

/** Presentation-only fixtures used when the Spring API is offline in development. */
export const demoProducts: StoreProduct[] = [
  {
    id: 'demo-slate-65',
    name: 'Slate 65 기판',
    slug: 'slate-65',
    basePrice: 189,
    category: 'pcb',
    description: '65% 배열의 커스텀 키보드용 기판 샘플입니다.',
    stockQuantity: 42,
    shippingFee: 0,
    brand: 'MONO',
    kcCertificationNumber: 'R-R-MKY-S65',
    options: [
      { id: 'slate-charcoal', label: 'Charcoal / Linear', value: 'charcoal-linear', priceAdjustment: 0 },
      { id: 'slate-bone', label: 'Bone / Tactile', value: 'bone-tactile', priceAdjustment: 12 },
    ],
    images: [{
      id: 'slate-image',
      url: '/product-placeholder.svg',
      alt: 'Slate 65 기판 샘플',
    }],
  },
  {
    id: 'demo-arc-tkl',
    name: 'Arc TKL 기판',
    slug: 'arc-tkl',
    basePrice: 229,
    category: 'pcb',
    description: '텐키리스 배열의 핫스왑 기판 샘플입니다.',
    stockQuantity: 18,
    shippingFee: 12,
    brand: 'MONO',
    kcCertificationNumber: 'R-R-MKY-ATK',
    options: [
      { id: 'arc-graphite', label: 'Graphite / Linear', value: 'graphite-linear', priceAdjustment: 0 },
      { id: 'arc-silver', label: 'Silver / Silent', value: 'silver-silent', priceAdjustment: 18 },
    ],
    images: [{
      id: 'arc-image',
      url: '/product-placeholder.svg',
      alt: 'Arc TKL 기판 샘플',
    }],
  },
  {
    id: 'demo-ivory-air',
    name: 'Ivory Air 기판',
    slug: 'ivory-air',
    basePrice: 149,
    category: 'pcb',
    description: '로우 프로파일 무선 기판 샘플입니다.',
    stockQuantity: 31,
    shippingFee: 0,
    brand: 'FORM',
    kcCertificationNumber: 'R-R-FRM-IVA',
    options: [
      { id: 'ivory-mac', label: 'Mac layout', value: 'mac', priceAdjustment: 0 },
      { id: 'ivory-windows', label: 'Windows layout', value: 'windows', priceAdjustment: 0 },
    ],
    images: [{
      id: 'ivory-image',
      url: '/product-placeholder.svg',
      alt: 'Ivory Air 기판 샘플',
    }],
  },
]
