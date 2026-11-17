import { resolveProductCategory, type StoreProduct } from "@/lib/store-shared";
import { API_BASE_URL } from "@/lib/api-client";

// TODO(담당 5): 관리자 상품 목록, 수정, 삭제 API를 구현합니다.
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
  const response = await fetch(
    `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      credentials: "include",
      body,
    },
  );
  const result = (await response.json()) as ApiResponse<{
    productId: number;
    categoryName: string;
    categoryId?: string;
    name: string;
    basePrice: number;
    stockQuantity: number;
    thumbnailUrl: string | null;
    description: string | null;
  }>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "상품을 수정할 수 없습니다");
  }
  const item = result.data;
  return {
    id: item.productId,
    slug: String(item.productId),
    name: item.name,
    basePrice: item.basePrice,
    category: resolveProductCategory(item.categoryId, item.categoryName),
    description: item.description ?? "",
    stockQuantity: item.stockQuantity,
    shippingFee: 0,
    brand: "",
    images: item.thumbnailUrl
      ? [{ id: item.productId, url: item.thumbnailUrl, alt: item.name }]
      : [],
  };
}

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
