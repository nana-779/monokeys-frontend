import { ApiRequestError, apiRequest } from '@/lib/api-client'
import type { ProductType } from './interface/Product'

export type AddCartItemRequest = {
  productId: string
  quantity: number
  customDesignData?: string
}

// 백엔드가 내려주는 장바구니 아이템 응답 타입
export type CartItemResponse = {
  cartItemId: number
  productId: number
  name: string
  price: number
  quantity: number
  thumbnailUrl?: string
  customDesignData?: string
}

function parseCustomDesignMeta(customDesignData?: string): {
  previewUrl?: string
  label?: string
} {
  if (!customDesignData) return {}
  try {
    const parsed = JSON.parse(customDesignData) as {
      previewImageUrl?: string
      printImageUrl?: string
      keyType?: string
      keySize?: string
      customText?: string | null
    }
    const previewUrl =
      typeof parsed.previewImageUrl === 'string' && parsed.previewImageUrl.trim()
        ? parsed.previewImageUrl
        : typeof parsed.printImageUrl === 'string' && parsed.printImageUrl.trim()
          ? parsed.printImageUrl
          : undefined
    const spec = [parsed.keyType, parsed.keySize].filter(Boolean).join(' · ')
    const textSnippet = parsed.customText ? ` · "${parsed.customText}"` : ''
    const label = spec ? `커스텀 (${spec})${textSnippet}` : '커스텀 디자인'
    return { previewUrl, label }
  } catch {
    return {}
  }
}

// 1. 내 장바구니 목록 조회 (GET /api/cart)
export async function getCartApi(): Promise<ProductType[]> {
  try {
    const res = await apiRequest<any>('/api/cart')
    const list = res?.data || res || []
    if (Array.isArray(list)) {
      return list.map((item: any) => {
        const customDesignData =
          typeof item.customDesignData === 'string' && item.customDesignData.trim()
            ? item.customDesignData
            : undefined
        const customMeta = parseCustomDesignMeta(customDesignData)
        return {
          cartItemId: item.cartItemId,
          productId: item.productId ?? item.product?.productId ?? item.id,
          name: item.name ?? item.product?.name ?? '',
          price: item.price ?? item.product?.basePrice ?? 0,
          stockQuantity: item.stockQuantity ?? item.product?.stockQuantity ?? 999,
          quantity: item.quantity ?? 1,
          thumbnailUrl:
            customMeta.previewUrl ?? item.thumbnailUrl ?? item.product?.thumbnailURL ?? '',
          partType: item.partType ?? '',
          additionalPrice: item.additionalPrice ?? 0,
          customBuildId: item.customBuildId ?? 0,
          buildName: item.buildName || customMeta.label || '',
          includeAssembly: item.includeAssembly ?? false,
          customDesignData,
        }
      })
    }
    return []
  } catch (error) {
    // 401(비로그인) 시에는 콘솔 에러 없이 조용히 빈 목록 반환 (Next.js 빨간 에러창 방지)
    if (error instanceof ApiRequestError && error.status === 401) {
      return []
    }
    console.error('장바구니 조회 실패:', error)
    return []
  }
}

// 2. 장바구니에 상품 담기 (POST /api/cart)
export async function addCartItemApi(
  productId: number,
  quantity: number,
  customDesignData?: string,
): Promise<boolean> {
  try {
    await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify(
        customDesignData ? { productId, quantity, customDesignData } : { productId, quantity },
      ),
    })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      alert('로그인이 필요한 서비스입니다.')
      return false
    }
    // 재고 초과(400) 등 서버가 거부한 경우: 서버가 보낸 메시지를 그대로 보여 줌
    if (error instanceof ApiRequestError) {
      alert(error.message)
      return false
    }
    // 서버가 꺼져 있는 등 응답 자체를 못 받은 경우
    alert('장바구니에 담지 못했습니다. 잠시 후 다시 시도해 주세요.')
    console.error('장바구니 담기 실패:', error)
    return false
  }
}

// 3. 장바구니 수량 변경 (PATCH /api/cart/{productId} 또는 /api/cart/items/{cartItemId})
export async function changeCartItem(
  productId: number,
  quantity: number,
  cartItemId?: number,
): Promise<boolean> {
  try {
    const endpoint =
      cartItemId && cartItemId > 0 ? `/api/cart/items/${cartItemId}` : `/api/cart/${productId}`
    await apiRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      alert('로그인이 필요한 서비스입니다.')
      return false
    }
    // 재고 초과(400) 등 서버가 거부한 경우: 서버가 보낸 메시지를 그대로 보여 줌
    if (error instanceof ApiRequestError) {
      alert(error.message)
      return false
    }
    // 서버가 꺼져 있는 등 응답 자체를 못 받은 경우
    alert('수량을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.')
    console.warn('수량 DB 동기화 실패:', error)
    return false
  }
}

// 4. 장바구니 단건 삭제 (DELETE /api/cart/{productId} 또는 /api/cart/items/{cartItemId})
export async function removeCartItemApi(
  productId: number,
  cartItemId?: number,
): Promise<boolean> {
  try {
    const endpoint =
      cartItemId && cartItemId > 0 ? `/api/cart/items/${cartItemId}` : `/api/cart/${productId}`
    await apiRequest(endpoint, {
      method: 'DELETE',
    })
    return true
  } catch (error) {
    console.warn('삭제 DB 동기화 실패:', error)
    return false
  }
}

// 5. 장바구니 전체 비우기 (DELETE /api/cart)
export async function clearCartApi(): Promise<boolean> {
  try {
    await apiRequest('/api/cart', {
      method: 'DELETE',
    })
    return true
  } catch (error) {
    console.warn('비우기 DB 동기화 실패:', error)
    return false
  }
}