"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ProductType } from "../interface/Product";
import { ProductCartContext } from "./CartContext";
import {
  addCartItemApi,
  changeCartItem,
  clearCartApi,
  getCartApi,
  removeCartItemApi,
} from "../api";

export function ProductCartProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductType[]>([]);

  // 1. 마운트 시 백엔드 DB에서 현재 로그인한 유저의 장바구니 목록 조회 (순수 쿠키 인증)
  const refreshCart = useCallback(async () => {
    const list = await getCartApi();
    setProducts(list);
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // 2. 장바구니 상품 추가 (단일 상품 / 커스텀 빌드 공통)
  async function handleAddCart(newProduct: ProductType): Promise<boolean> {
    const isCustom = Boolean(
      (newProduct.manualBuildId && newProduct.manualBuildId > 0) ||
      (newProduct.autoBuildId && newProduct.autoBuildId > 0) ||
      newProduct.buildType === 'MANUAL' ||
      newProduct.buildType === 'AUTO'
    );
    // 커스텀 빌드는 manualBuildId/autoBuildId를 담고, 일반 상품은 productId만 담음
    const targetPayload = isCustom
      ? {
          manualBuildId: newProduct.manualBuildId,
          autoBuildId: newProduct.autoBuildId,
        }
      : {
          productId: newProduct.productId,
        };
    const success = await addCartItemApi(targetPayload, newProduct.quantity);
    if (success) {
      await refreshCart(); // 장바구니 최신화
      return true;
    }
    return false;
  }

  // 3. 장바구니 상품 수량 변경 (+ / -)
  async function handleUpdateCount(id: number, newQuantity: number) {
    let finalQuantity = Math.max(1, newQuantity);
    const targetProduct = products.find((p) =>
      p.cartItemId ? p.cartItemId === id : p.productId === id
    );
    if (targetProduct && newQuantity > targetProduct.stockQuantity) {
      alert("재고수를 초과합니다.");
      finalQuantity = targetProduct.stockQuantity;
    }
    setProducts((prevProducts) =>
      prevProducts.map((product) =>
        (product.cartItemId ? product.cartItemId === id : product.productId === id)
          ? { ...product, quantity: finalQuantity }
          : product
      )
    );
    await changeCartItem(id, finalQuantity);
    await refreshCart(); // 수량 변경 성공 시 최신화
  }
  // 4. 장바구니 상품 단건 삭제
  async function handleRemoveProduct(id: number) {
    // cartItemId 우선 비교로 화면에서 즉시 제거
    setProducts((prevProducts) =>
      prevProducts.filter((product) =>
        product.cartItemId ? product.cartItemId !== id : product.productId !== id
      )
    );
    // 백엔드 삭제 요청 후 무조건 장바구니 새로고침
    await removeCartItemApi(id);
    await refreshCart(); // 삭제 후 반드시 백엔드 최신 상태로 갱신
  }

  // 5. 장바구니 전체 비우기
  async function handleClearCart() {
    setProducts([]);
    // 서버가 거부하거나 실패하면, 먼저 바꿔 둔 화면을 서버(DB) 상태로 되돌림
    const success = await clearCartApi();
    if (!success) await refreshCart();
  }

  return (
    <ProductCartContext.Provider
      value={{
        products,
        handleUpdateCount,
        handleRemoveProduct,
        handleAddCart,
        handleClearCart,
        refreshCart,
        setProducts,
      }}
    >
      {children}
    </ProductCartContext.Provider>
  );
}
