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
  manualBuildId?: number
  autoBuildId?: number
  buildType?: 'MANUAL' | 'AUTO'
  customDesignData?: string
}
