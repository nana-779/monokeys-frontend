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

/**
 * 커스텀 키캡 디자인 이미지(인쇄용 + 미리보기)를 업로드하고 서버 URL을 반환합니다.
 */
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
