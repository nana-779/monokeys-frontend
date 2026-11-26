import type { CartBuildPart } from './interface/Product'

export type CartItemKind = 'STANDARD' | 'CUSTOM_KEYCAP' | 'MANUAL_BUILD' | 'AUTO_BUILD'

export type CartItem = {
  cartItemId?: number
  productId: string
  slug: string
  name: string
  image?: string
  optionValue?: string
  optionLabel?: string
  unitPrice: number
  shippingFee: number
  quantity: number
  itemKind?: CartItemKind
  includeAssembly?: boolean
  manualBuildId?: number
  autoBuildId?: number
  buildType?: 'MANUAL' | 'AUTO'
  partDetails?: CartBuildPart[]
  customDesignData?: string
}
