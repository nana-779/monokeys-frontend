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
  async function handleAddProduct(newProduct: ProductType): Promise<boolean> {
    const isCustom = Boolean(
      (newProduct.manualBuildId && newProduct.manualBuildId > 0) ||
      (newProduct.autoBuildId && newProduct.autoBuildId > 0) ||
      (newProduct.customBuildId && newProduct.customBuildId > 0) ||
      newProduct.buildType === 'MANUAL' ||
      newProduct.buildType === 'AUTO' ||
      newProduct.partType === 'CUSTOM'
    );

    // 커스텀 빌드인 경우 product_id를 전혀 포함하지 않고 manual_build_id 또는 auto_build_id 외래키만 전송
    let targetPayload: { productId?: number; manualBuildId?: number; autoBuildId?: number };

    const existingProduct = products.find(
      (product) => product.productId === newProduct.productId
    );

    // [경우 A] 이미 장바구니에 있는 상품인 경우
    if (existingProduct) {
      let newQuantity = existingProduct.quantity + newProduct.quantity;
      let finalQuantity = newQuantity;
      
      newQuantity = Math.max(1, newQuantity);

      // 재고 초과 시 알림창 띄우고 최대 재고수로 보정
      if (newQuantity > existingProduct.stockQuantity) {
        alert(
          `${existingProduct.name}의 현재 재고수는 ${existingProduct.stockQuantity}개입니다.`
        );
        finalQuantity = existingProduct.stockQuantity;
      }

      // 백엔드로 쿠키와 함께 수량 변경 요청
      const success = await changeCartItem(newProduct.productId, finalQuantity);
      if (success) {
        setProducts((prevProducts) =>
          prevProducts.map((product) =>
            product.productId === newProduct.productId
              ? { ...product, quantity: finalQuantity }
              : product
          )
        );
        return true; // 장바구니 서랍 오픈
      }
      return false;
    }

    // [경우 B] 새로 담는 상품인 경우
    let finalQuantity = newProduct.quantity;

    // 재고 초과 시 알림창 띄우고 최대 재고수로 보정
    if (newProduct.quantity > newProduct.stockQuantity) {
      alert(`${newProduct.name}의 현재 재고수는 ${newProduct.stockQuantity}개입니다.`);
      finalQuantity = newProduct.stockQuantity;
    }

    const productToAdd = { ...newProduct, quantity: finalQuantity };

    // 백엔드로 쿠키와 함께 등록 요청
    const success = await addCartItemApi(productToAdd.productId, finalQuantity);
    if (success) {
      setProducts((prevProducts) => [...prevProducts, productToAdd]);
      return true; // 장바구니 서랍 오픈
    }
    return false;
  }

  // 3. 장바구니 상품 수량 변경 (+ / -)
  async function handleUpdateCount(id: number, newQuantity: number) {
    let finalQuantity = newQuantity;
    const targetProduct = products.find((p) => p.productId === id);
    newQuantity = Math.max(1, newQuantity);

    if (targetProduct && newQuantity > targetProduct.stockQuantity) {
      alert(`${targetProduct.name}의 현재 재고수는 ${targetProduct.stockQuantity}개입니다.`);
      newQuantity = targetProduct.stockQuantity;
    }

    finalQuantity = newQuantity;

    setProducts((prevProducts) =>
      prevProducts.map((product) =>
        product.productId === id ? { ...product, quantity: finalQuantity } : product
      )
    );

    // 서버가 거부하거나 실패하면, 먼저 바꿔 둔 화면을 서버(DB) 상태로 되돌림
    const success = await changeCartItem(id, finalQuantity);
    if (!success) await refreshCart();
  }

  // 4. 장바구니 상품 단건 삭제
  async function handleRemoveProduct(id: number) {
    setProducts((prevProducts) => prevProducts.filter((product) => product.productId !== id));
    // 서버가 거부하거나 실패하면, 먼저 바꿔 둔 화면을 서버(DB) 상태로 되돌림
    const success = await removeCartItemApi(id);
    if (!success) await refreshCart();
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
        handleAddProduct,
        handleClearCart,
        refreshCart,
        setProducts,
      }}
    >
      {children}
    </ProductCartContext.Provider>
  );
}
