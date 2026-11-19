import { API_BASE_URL, ApiRequestError } from "@/lib/api-client";

type ApiResponse<T> = {
  success: boolean;
  message: string | null;
  data: T | null;
};

export type AdminProductInput = {
  categoryId: string;
  name: string;
  basePrice: number;
  stockQuantity: number;
  thumbnailUrl: string | null;
  description: string | null;
  layout: string | null;
  housingMaterial: string | null;
  supportPins: string | null;
  isWireless: boolean | null;
  switchPin: number | null;
  switchType: string | null;
  keycapMaterial: string | null;
};

export type AdminProductRecord = Omit<AdminProductInput, "thumbnailUrl"> & {
  productId: number;
  categoryName: string;
  parentCategoryId: string;
  thumbnailUrl: string | null;
  active: boolean;
  createdAt: string;
};

// 관리자 상품 전체 조회
export async function getAdminProducts(): Promise<AdminProductRecord[]> {
  const response = await fetch(`${API_BASE_URL}/api/admin/products`, {
    credentials: "include",
  });
  const result = (await response.json()) as ApiResponse<AdminProductRecord[]>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "상품 목록을 불러올 수 없습니다");
  }
  return result.data;
}

// 관리자 상품 상세 조회
export async function getAdminProduct(
  productId: string,
): Promise<AdminProductRecord> {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
    { credentials: "include" },
  );
  const result = (await response.json()) as ApiResponse<AdminProductRecord>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "상품 상세 정보를 불러올 수 없습니다");
  }
  return result.data;
}

export type AdminProductUpdateInput = Omit<
  AdminProductInput,
  "thumbnailUrl" | "categoryId" | "isWireless"
> & {
  active: boolean;
  categoryId?: string;
  isWireless?: boolean;
};

async function readResponse<T>(response: Response): Promise<T> {
  let result: ApiResponse<T>;
  try {
    result = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !result.success || result.data == null) {
    throw new Error(result.message || "상품 요청을 처리할 수 없습니다.");
  }
  return result.data;
}

// 관리자 상품 등록
export async function createAdminProduct(
  input: AdminProductInput,
  image?: File,
): Promise<number> {
  const body = new FormData();
  body.append(
    "product",
    new Blob([JSON.stringify(input)], { type: "application/json" }),
  );
  if (image) body.append("image", image);
  const response = await fetch(`${API_BASE_URL}/api/admin/products`, {
    method: "POST",
    credentials: "include",
    body,
  });
  const product = await readResponse<{ productId: number }>(response);
  return product.productId;
}

export async function updateAdminProduct(
  productId: string,
  input: AdminProductUpdateInput,
  image?: File,
): Promise<AdminProductRecord> {
  const body = new FormData();
  body.append(
    "product",
    new Blob([JSON.stringify(input)], { type: "application/json" }),
  );
  if (image) body.append("image", image);
  const response = await fetch(
    `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
    { method: "PATCH", body, credentials: "include" },
  );
  return readResponse<AdminProductRecord>(response);
}

export async function deleteAdminProduct(productId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
      { method: "DELETE", credentials: "include" },
    );
  } catch {
    throw new Error("서버에 연결할 수 없어 삭제 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요.");
  }
  let result: ApiResponse<null>;
  try {
    result = (await response.json()) as ApiResponse<null>;
  } catch {
    throw new ApiRequestError(
      response.ok
        ? "서버 응답을 읽을 수 없어 삭제 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요."
        : "상품을 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
    );
  }
  if (!response.ok || !result.success) {
    throw new ApiRequestError(result.message || "상품을 삭제할 수 없습니다.", response.status);
  }
}
