import { apiRequest } from '@/lib/api-client'

type BuildApiEnvelope<T> = {
  success?: boolean
  message?: string | null
  data?: T
}

export type BuildPartType = 'HOUSING' | 'PCB' | 'SWITCH' | 'KEYCAP'

export type BuildType = 'MANUAL' | 'AUTO'

export type BuildItemResponse = {
  partType: BuildPartType
  productId: number
  productName: string
  unitPrice: number
  thumbnailUrl: string | null
  layout: string | null
  supportPins: number[]
  switchPin: number | null
  switchType: string | null
  isWireless: boolean | null
  material: string | null
}

export type BuildResponse = {
  buildId: number | null
  buildType: BuildType
  userId: number | null
  buildName: string
  includeAssembly: boolean
  assemblyFee: number
  totalPrice: number
  copiedOnWrite: boolean
  createdAt: string | null
  surveyLayout: string | null
  surveyConnectivity: string | null
  surveySound: string | null
  surveyKeycap: string | null
  items: BuildItemResponse[]
}

export type ManualBuildRequest = {
  buildName?: string
  housingProductId: number
  pcbProductId: number
  switchProductId: number
  keycapProductId: number
  includeAssembly?: boolean
}

export type AutoBuildRecommendRequest = {
  surveyLayout: string
  surveyConnectivity?: string
  surveySound?: string
  surveyKeycap?: string
  includeAssembly?: boolean
}

export type AutoBuildRequest = {
  buildName?: string
  surveyLayout: string
  surveyConnectivity: string
  surveySound: string
  surveyKeycap: string
  housingProductId: number
  pcbProductId: number
  switchProductId: number
  keycapProductId: number
  includeAssembly?: boolean
}

/**
 * Unwraps Spring Boot ApiResponse<T> envelopes for /api/builds endpoints.
 */
async function buildRequest<T>(
  path: string,
  init: RequestInit = {},
  expectedStatus?: number,
): Promise<T> {
  const result = await apiRequest<T | BuildApiEnvelope<T>>(path, init, expectedStatus)
  if (result && typeof result === 'object' && !Array.isArray(result) && 'success' in result) {
    if (result.success !== true) {
      throw new Error(result.message || '커스텀 빌드 요청을 처리하지 못했습니다.')
    }
    return result.data as T
  }
  return result as T
}

/**
 * 설문 조건으로 서버 호환성 기반 자동 추천 견적을 생성합니다.
 */
export async function recommendAutoBuild(
  payload: AutoBuildRecommendRequest,
): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>('/api/builds/auto/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * 수동 커스텀 빌드를 서버에 검증 및 저장합니다.
 */
export async function createManualBuild(
  payload: ManualBuildRequest,
): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(
    '/api/builds/manual',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    201,
  )
}

/**
 * 저장된 수동 커스텀 빌드를 조회합니다.
 */
export async function getManualBuild(buildId: number): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(`/api/builds/manual/${buildId}`)
}

/**
 * 수동 커스텀 빌드를 수정합니다(장바구니/주문 참조 시 Copy-on-Write).
 */
export async function updateManualBuild(
  buildId: number,
  payload: ManualBuildRequest,
): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(`/api/builds/manual/${buildId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

/**
 * 설문 추천 자동 커스텀 빌드를 서버에 검증 및 저장합니다.
 */
export async function createAutoBuild(payload: AutoBuildRequest): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(
    '/api/builds/auto',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    201,
  )
}

/**
 * 저장된 자동 커스텀 빌드를 조회합니다.
 */
export async function getAutoBuild(buildId: number): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(`/api/builds/auto/${buildId}`)
}

/**
 * 자동 커스텀 빌드를 수정합니다(장바구니/주문 참조 시 Copy-on-Write).
 */
export async function updateAutoBuild(
  buildId: number,
  payload: AutoBuildRequest,
): Promise<BuildResponse> {
  return await buildRequest<BuildResponse>(`/api/builds/auto/${buildId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
