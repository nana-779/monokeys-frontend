import { ApiRequestError, apiRequest } from '@/lib/api-client'
import type { ProductType } from './interface/Product'

export type AddCartTarget = number | { productId?: number; manualBuildId?: number; autoBuildId?: number; customDesignData?: string }

function parseCustomDesignMeta(customDesignData?: string): {
  previewUrl?: string; // 장바구니에 보여줄 캔버스 미리보기 이미지
  label?: string;      // 장바구니에 보여줄 옵션 요약 글자
} {
  if (!customDesignData) return {};
  try {
    const parsed = JSON.parse(customDesignData);
    // 1. 캔버스 미리보기 이미지 추출 (없으면 원본 인쇄 이미지)
    const previewUrl = parsed.previewImageUrl || parsed.printImageUrl || undefined;
    // 2. 키캡 종류와 크기, 문구 조합 (예: Space Bar · 6.25u · "HELLO")
    const spec = [parsed.keyType, parsed.keySize].filter(Boolean).join(' · ');
    const textSnippet = parsed.customText ? ` · "${parsed.customText}"` : '';
    const label = spec ? `커스텀 (${spec})${textSnippet}` : '커스텀 디자인';
    return { previewUrl, label };
  } catch {
    return {};
  }
}

// 1. 내 장바구니 목록 조회 (GET /api/cart)
export async function getCartApi(): Promise<ProductType[]> {
  try {
    const res = await apiRequest<any>('/api/cart')
    const list = res?.data || res || []
    if (!Array.isArray(list)) return []

    return list.map((item: any) => {
      const customMeta = parseCustomDesignMeta(item.customDesignData);
      
      return {
        cartItemId: item.cartItemId,
        manualBuildId: item.manualBuildId,
        autoBuildId: item.autoBuildId,
        buildType: item.buildType,
        productId: item.productId ?? item.product?.productId ?? item.id ?? 0,
        name: item.name ?? item.product?.name ?? '',
        price: item.price ?? item.product?.basePrice ?? 0,
        stockQuantity: item.stockQuantity ?? item.product?.stockQuantity ?? 999,
        quantity: item.quantity ?? 1,
        partType: item.partType ?? '',
        additionalPrice: item.additionalPrice ?? 0,
        customBuildId: item.customBuildId ?? 0,
        includeAssembly: Boolean(item.includeAssembly),
        partProductIds: item.partProductIds ?? [],
        thumbnailUrl: customMeta.previewUrl ?? item.thumbnailUrl ?? '',
        buildName: customMeta.label || item.buildName || '',
        customDesignData: item.customDesignData,
      }
    })
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return []
    }
    console.error('장바구니 조회 실패:', error)
    return []
  }
}

// 2. 장바구니에 상품 담기 (POST /api/cart)
export async function addCartItemApi(target: AddCartTarget, quantity: number): Promise<boolean> {
  try {
    const body = typeof target === 'number' 
      ? { productId: target, quantity } 
      : { ...target, quantity };
    await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify(body), // { productId, quantity, customDesignData }
    });
    return true;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      alert(error.status === 401 ? '로그인이 필요한 서비스입니다.' : error.message)
      return false
    }
    alert('장바구니에 담지 못했습니다.')
    return false
  }
}

// 3. 장바구니 수량 변경 (PATCH /api/cart/{targetId})
export async function changeCartItem(targetId: number, quantity: number): Promise<boolean> {
  try {
    await apiRequest(`/api/cart/${targetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError) {
      alert(error.status === 401 ? '로그인이 필요한 서비스입니다.' : error.message)
      return false
    }
    alert('수량을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.')
    return false
  }
}

// 4. 장바구니 단건 삭제 (DELETE /api/cart/{targetId})
export async function removeCartItemApi(targetId: number): Promise<boolean> {
  try {
    await apiRequest(`/api/cart/${targetId}`, { method: 'DELETE' })
    return true
  } catch (error) {
    console.warn('삭제 DB 동기화 실패:', error)
    return false
  }
}

// 5. 장바구니 전체 비우기 (DELETE /api/cart)
export async function clearCartApi(): Promise<boolean> {
  try {
    await apiRequest('/api/cart', { method: 'DELETE' })
    return true
  } catch (error) {
    console.warn('비우기 DB 동기화 실패:', error)
    return false
  }
}