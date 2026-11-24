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

// cartItemId 우선, 없으면 productId로 대상 식별
const isTargetItem = (p: ProductType, id: number) =>
  p.cartItemId ? p.cartItemId === id : p.productId === id;

export function ProductCartProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductType[]>([]);

  // 1. 장바구니 목록 조회
  const refreshCart = useCallback(async () => {
    const list = await getCartApi();
    setProducts(list);
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // 2. 장바구니 추가
  async function handleAddCart(newProduct: ProductType): Promise<boolean> {
    const isCustom = Boolean(
      newProduct.manualBuildId || newProduct.autoBuildId ||
      newProduct.buildType === 'MANUAL' || newProduct.buildType === 'AUTO'
    );

    const targetPayload = isCustom
      ? { manualBuildId: newProduct.manualBuildId, autoBuildId: newProduct.autoBuildId }
      : { productId: newProduct.productId };

    const success = await addCartItemApi(targetPayload, newProduct.quantity);
    if (success) {
      await refreshCart();
      return true;
    }
    return false;
  }

  // 3. 수량 변경 (+ / -)
  async function handleUpdateCount(id: number, newQuantity: number) {
    let finalQuantity = Math.max(1, newQuantity);
    const targetProduct = products.find((p) => isTargetItem(p, id));

    if (targetProduct && newQuantity > targetProduct.stockQuantity) {
      alert("재고수를 초과합니다.");
      finalQuantity = targetProduct.stockQuantity;
    }

    setProducts((prev) =>
      prev.map((p) => (isTargetItem(p, id) ? { ...p, quantity: finalQuantity } : p))
    );

    await changeCartItem(id, finalQuantity);
    await refreshCart();
  }

  // 4. 단건 삭제
  async function handleRemoveProduct(id: number) {
    setProducts((prev) => prev.filter((p) => !isTargetItem(p, id)));
    await removeCartItemApi(id);
    await refreshCart();
  }

  // 5. 전체 비우기
  async function handleClearCart() {
    setProducts([]);
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