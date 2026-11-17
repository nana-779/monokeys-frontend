import { API_BASE_URL } from "@/lib/api-client";

type ApiResponse<T> = {
  success: boolean;
  message: string | null;
  data: T | null;
};

export type AdminProductInput = {
  categoryName: string;
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
  categoryId: string;
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
    body,
    credentials: "include",
  });
  const result = (await response.json()) as ApiResponse<{ productId: number }>;
  if (!response.ok || !result.success || result.data == null) {
    throw new Error(result.message || "상품을 등록할 수 없습니다");
  }
  return result.data.productId;
}

// 관리자 상품 삭제
export async function deleteAdminProduct(productId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  const result = (await response.json()) as ApiResponse<null>;
  if (!response.ok || !result.success) {
    throw new Error(result.message || "상품을 삭제할 수 없습니다");
  }
}
