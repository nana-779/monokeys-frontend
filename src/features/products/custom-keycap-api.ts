import { API_BASE_URL } from '@/lib/api-client'

type ApiResponse<T> = {
  success: boolean
  message: string | null
  data: T | null
}

export type CustomKeycapImageUploadResult = {
  imageUrl: string
  previewImageUrl: string
}

export async function uploadCustomKeycapImages(
  image: Blob,
  previewImage?: Blob,
): Promise<CustomKeycapImageUploadResult> {
  const formData = new FormData()
  formData.append('image', image, 'custom-keycap-print.png')
  if (previewImage) {
    formData.append('previewImage', previewImage, 'custom-keycap-preview.png')
  }

  const response = await fetch(`${API_BASE_URL}/api/custom-keycaps/images`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const result = (await response.json()) as ApiResponse<CustomKeycapImageUploadResult>
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || '커스텀 키캡 이미지를 업로드하지 못했습니다.')
  }
  return result.data
}

export async function getWishlistStatus(productId: string | number): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/wishlist/${encodeURIComponent(String(productId))}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) return false
  const result = (await response.json()) as ApiResponse<{ productId: number; wishlisted: boolean }>
  return Boolean(result.data?.wishlisted)
}

export async function toggleWishlistItem(
  productId: string | number,
): Promise<{ wishlisted: boolean; unauthorized?: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}/api/wishlist/${encodeURIComponent(String(productId))}/toggle`,
    {
      method: 'POST',
      credentials: 'include',
    },
  )
  if (response.status === 401) {
    return { wishlisted: false, unauthorized: true }
  }
  const result = (await response.json()) as ApiResponse<{ productId: number; wishlisted: boolean }>
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || '위시리스트를 변경하지 못했습니다.')
  }
  return { wishlisted: result.data.wishlisted }
}
