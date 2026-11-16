import { apiRequest } from '@/lib/api-client'
import { useContext } from 'react'
import { ProductCartContext } from './components/CartContext'
import { ProductType } from './interface/Product'

export type AddCartItemRequest = {
  productId: string
  quantity: number
}

// 백엔드가 내려주는 장바구니 아이템 응답 타입
export type CartItemResponse = {
  cartItemId: number
  productId: number
  name: string
  price: number
  quantity: number
  thumbnailUrl?: string
}
// 1. 내 장바구니 목록 조회 (GET /api/cart)
export async function getCartApi(): Promise<ProductType[]> {
  try {
    const res = await apiRequest<any>("/api/cart");
    const list = res?.data || res || [];
    let result : ProductType[] = []
    if (Array.isArray(list)) {
      const mapped: ProductType[] = list.map((item: any) => ({
        productId: item.productId ?? item.product?.productId ?? item.id,
        name: item.name ?? item.product?.name ?? "",
        price: item.price ?? item.product?.basePrice ?? 0,
        stockQuantity: item.stockQuantity ?? item.product?.stockQuantity ?? 999,
        quantity: item.quantity ?? 1,
        thumbnailUrl: item.thumbnailUrl ?? item.product?.thumbnailURL ?? "",
        partType: item.partType ?? "",
        additionalPrice: item.additionalPrice ?? 0,
        customBuildId: item.customBuildId ?? 0,
        buildName: item.buildName ?? "",
        includeAssembly: item.includeAssembly ?? false,
      }));
      result = mapped;
    }
    return result;
  } catch (error) {
    console.error('장바구니 조회 실패:', error)
    return []
  }
}

// 2. 장바구니에 상품 담기 (POST /api/cart)
export async function addCartItemApi(productId: number, quantity: number, message : string): Promise<boolean> {
  try {
    await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    })
    return true
  } catch (error) {
    console.error(message, error)
    return false
  }
}

export async function changeCartItem(productId : number, quantity : number, message : string) : Promise<boolean> {
  try {
    await apiRequest(`/api/cart/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: quantity }),
    });

    return true;
  } catch (error) {
    console.warn(message, error);

    return false
  }
}