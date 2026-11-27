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

  // 장바구니 목록 조회
  const refreshCart = useCallback(async () => {
    const list = await getCartApi();
    setProducts(list);
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // 장바구니 추가
  async function handleAddCart(newProduct: ProductType): Promise<boolean> {
    const isCustomKeycap = Boolean(newProduct.customDesignData?.trim());
  // [커스텀 키캡 분기 처리]
  if (isCustomKeycap) {
    // 1. 현재 장바구니에 담긴 동일 키캡 상품의 총 수량 확인
    const existingTotalQty = products
      .filter((p) => p.productId === newProduct.productId)
      .reduce((sum, p) => sum + p.quantity, 0);
    const maxAllowed = Math.max(0, newProduct.stockQuantity - existingTotalQty);
    let finalQuantity = newProduct.quantity;
    if (finalQuantity > maxAllowed) {
      alert(`${newProduct.name}의 남은 재고수는 ${maxAllowed}개입니다.`);
      finalQuantity = maxAllowed;
      if (finalQuantity <= 0) return false;
    }
    // 2. 백엔드로 customDesignData를 함께 실어서 등록 요청
    const success = await addCartItemApi(
      { 
        productId: newProduct.productId, 
        customDesignData: newProduct.customDesignData 
      },
      finalQuantity
    );

    if (success) {
      await refreshCart(); // 장바구니 최신화
    }
    return success; // 장바구니 서랍 오픈
  }
    const isCustom = Boolean(
      newProduct.manualBuildId || newProduct.autoBuildId ||
      newProduct.buildType === 'MANUAL' || newProduct.buildType === 'AUTO'
    );
    // 이미 장바구니에 있는 항목인지 확인
    const existing = products.find((p) =>
      isCustom
        ? (newProduct.manualBuildId && p.manualBuildId === newProduct.manualBuildId) ||
          (newProduct.autoBuildId && p.autoBuildId === newProduct.autoBuildId)
        : p.productId === newProduct.productId
    );
    let quantityToAdd = newProduct.quantity;
    const maxStock = existing ? existing.stockQuantity : newProduct.stockQuantity;
    const currentQty = existing ? existing.quantity : 0;
    // 담으려는 수량이 최대 재고수를 초과할 때
    if (currentQty + quantityToAdd > maxStock) {
      if (currentQty >= maxStock) {
        alert("이미 최대 주문 가능 수량만큼 장바구니에 담겨 있습니다.");
        return false;
      }
      alert(`${newProduct.name || '해당 상품'}의 최대 주문 가능 수량은 ${maxStock}개입니다.\n(최대 수량에 맞추어 장바구니에 담깁니다.)`);
      quantityToAdd = Math.max(1, maxStock - currentQty);
    }
    const targetPayload = isCustom
      ? { manualBuildId: newProduct.manualBuildId, autoBuildId: newProduct.autoBuildId }
      : { productId: newProduct.productId };
    const success = await addCartItemApi(targetPayload, quantityToAdd);

    if (success) {
      await refreshCart(); // 장바구니 최신화
    }
    return success;
  }

  // 수량 변경 (+ / -)
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

  // 단건 삭제
  async function handleRemoveProduct(id: number) {
    setProducts((prev) => prev.filter((p) => !isTargetItem(p, id)));
    await removeCartItemApi(id);
    await refreshCart();
  }

  // 전체 비우기
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