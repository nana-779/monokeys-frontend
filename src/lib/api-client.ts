// 공개 환경 변수로 Spring Boot API 주소를 설정하며, 끝의 슬래시는 제거합니다.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");

// 서버 오류 응답에서 화면에 표시할 메시지를 읽을 때 사용하는 형식입니다.
export type ApiErrorBody = {
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// HTTP 상태 코드와 서버 메시지를 함께 보관하는 API 오류입니다.
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

// 재발급을 시도하지 않는 경로입니다. 로그인 실패·재발급 실패의 401은 재발급으로 해결되지 않습니다.
const NO_REFRESH_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/refresh"];

// 진행 중인 재발급 요청입니다. 여러 요청이 동시에 401을 받아도 재발급은 한 번만 보냅니다.
let refreshPromise: Promise<boolean> | null = null;

// Refresh Token 쿠키로 새 Access Token을 발급받습니다. 성공하면 true를 반환합니다.
function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// 브라우저에서 보낸 요청이고 재발급 제외 경로가 아닐 때만 재발급을 시도합니다.
// Next.js 서버에서 보낸 요청에는 브라우저 쿠키가 없어 재발급할 수 없습니다.
function canRefresh(path: string): boolean {
  return typeof window !== "undefined" && !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
}

// 모든 API 요청에 JSON 헤더와 세션 쿠키를 공통 적용합니다.
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  expectedStatus?: number,
): Promise<T> {
  // 같은 요청을 재발급 후 한 번 더 보낼 수 있도록 요청 부분을 함수로 분리합니다.
  const send = () =>
    fetch(`${API_BASE_URL}${path}`, {
      cache: 'no-store',
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

  let response = await send();

  // 본문이 없거나 문자열일 때만 다시 보낼 수 있습니다. (스트림 등은 첫 전송에서 소진됨)
  const canResend = init.body == null || typeof init.body === "string";

  // Access Token 만료로 401이면 재발급 후 원래 요청을 한 번만 다시 보냅니다.
  // 재발급에 실패하면 다시 보내지 않고, 아래에서 기존과 같이 401 오류를 던집니다.
  if (response.status === 401 && canRefresh(path) && canResend) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send();
  }

  if (!response.ok) {
    let detail = "";
    let fieldErrors: Record<string, string> | undefined;
    try {
      const body = (await response.json()) as ApiErrorBody;
      detail = body.message || body.error || "";
      // 가입 폼이 입력란별 오류를 표시할 수 있도록 문자열 메시지만 전달합니다.
      if (
        body.fieldErrors &&
        typeof body.fieldErrors === "object" &&
        !Array.isArray(body.fieldErrors)
      ) {
        fieldErrors = Object.fromEntries(
          Object.entries(body.fieldErrors).filter(
            ([, message]) => typeof message === "string",
          ),
        );
      }
    } catch {
      // 서버가 비어 있거나 JSON이 아닌 오류 응답을 보낼 수 있습니다.
    }
    throw new ApiRequestError(
      detail || `API request failed (${response.status})`,
      response.status,
      fieldErrors,
    );
  }

  // 가입은 약속된 201 응답을 받은 경우에만 완료하며, 상태를 지정하지 않은 기존 호출은 그대로 처리합니다.
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new ApiRequestError(
      "서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}