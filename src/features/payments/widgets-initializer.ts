export type InitializationCode =
  | 'CLIENT_ONLY'
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'LOAD_FAILED'
  | 'TIMEOUT'

export class WidgetsInitializationError extends Error {
  constructor(
    public readonly code: InitializationCode,
    message: string,
  ) {
    super(message)
    this.name = 'WidgetsInitializationError'
  }
}

type InitializerOptions<T> = {
  isClient: () => boolean
  readClientKey: () => string | undefined
  load: (clientKey: string) => Promise<{ widgets: (options: { customerKey: string }) => T }>
  anonymousCustomerKey: string
  clear: () => void
  timeoutMs?: number
}

// 하나의 Promise를 공유해 동시 마운트·Strict Mode·재렌더링에서 인스턴스를 중복 생성하지 않습니다.
export function createWidgetsInitializer<T>(options: InitializerOptions<T>): () => Promise<T> {
  let cached: Promise<T> | undefined

  return () => {
    if (!options.isClient()) {
      return Promise.reject(
        new WidgetsInitializationError('CLIENT_ONLY', '브라우저에서만 초기화할 수 있습니다.'),
      )
    }
    if (cached) return cached

    const clientKey = options.readClientKey()
    if (!clientKey) {
      return Promise.reject(
        new WidgetsInitializationError(
          'MISSING_KEY',
          '로컬 테스트 클라이언트 키가 등록되지 않았습니다.',
        ),
      )
    }
    if (!/^test_gck_[A-Za-z0-9_-]+$/.test(clientKey)) {
      return Promise.reject(
        new WidgetsInitializationError(
          'INVALID_KEY',
          '상단 주문서형 테스트 클라이언트 키의 종류와 형식을 확인해 주세요.',
        ),
      )
    }

    cached = new Promise<T>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(
          new WidgetsInitializationError(
            'TIMEOUT',
            'SDK 초기화 시간이 초과됐습니다. 네트워크를 확인하고 다시 시도해 주세요.',
          ),
        )
      }, options.timeoutMs ?? 20_000)

      function fail() {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // SDK의 원본 오류에는 입력값이 포함될 수 있어 화면·로그에 전달하지 않습니다.
        reject(
          new WidgetsInitializationError(
            'LOAD_FAILED',
            'SDK를 초기화하지 못했습니다. 네트워크 연결과 키 설정을 확인해 주세요.',
          ),
        )
      }

      Promise.resolve()
        .then(() => options.load(clientKey))
        .then((sdk) => {
          if (settled) return
          const widgets = sdk.widgets({ customerKey: options.anonymousCustomerKey })
          settled = true
          clearTimeout(timer)
          resolve(widgets)
        })
        .catch(fail)
    }).catch((error: unknown) => {
      cached = undefined
      try {
        options.clear()
      } catch {
        /* 정리 실패가 원래의 초기화 오류를 덮어쓰지 않습니다. */
      }
      throw error
    })

    return cached
  }
}
