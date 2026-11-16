"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ProductType } from "../interface/Product";
import { ProductCartContext } from "./CartContext";
import { apiRequest } from "@/lib/api-client";
import { addCartItemApi, changeCartItem, getCartApi } from "../api";

export function ProductCartProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductType[]>([]);

  // 1. 마운트 시 백엔드 DB에서 현재 로그인한 유저의 장바구니 목록 조회 (순수 쿠키 인증)
  const refreshCart = useCallback(async () => {
    setProducts(await getCartApi())
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // 2. 장바구니 상품 추가 (백엔드 쿠키 인증 결과에 따라 처리)
  async function handleAddProduct(newProduct: ProductType): Promise<boolean> {
    const existingProduct = products.find(
      (product) => product.productId === newProduct.productId
    );

    // [경우 A] 이미 장바구니에 있는 상품인 경우
    if (existingProduct) {
      const newQuantity = existingProduct.quantity + newProduct.quantity;
      let finalQuantity = newQuantity;

      // 재고 초과 시 알림창 띄우고 최대 재고수로 보정
      if (newQuantity > existingProduct.stockQuantity) {
        alert(
          `${existingProduct.name}의 현재 재고수는 ${existingProduct.stockQuantity}개입니다.`
        );
        finalQuantity = existingProduct.stockQuantity;
      }

      // 백엔드로 쿠키와 함께 수량 변경 요청
      try {
        await apiRequest(`/api/cart/${newProduct.productId}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: finalQuantity }),
        });

        // 백엔드 인증 및 저장 성공 시에만 화면 상태 갱신
        setProducts((prevProducts) =>
          prevProducts.map((product) =>
            product.productId === newProduct.productId
              ? { ...product, quantity: finalQuantity }
              : product
          )
        );

        return true; // 장바구니 서랍 오픈
      } catch (err: any) {
        alert("로그인이 필요한 서비스입니다.");
        return false; // 비로그인(401) 등 실패 시 장바구니 안 열림
      }
    }

    // [경우 B] 새로 담는 상품인 경우
    let finalQuantity = newProduct.quantity;

    // 재고 초과 시 알림창 띄우고 최대 재고수로 보정
    if (newProduct.quantity > newProduct.stockQuantity) {
      alert(`${newProduct.name}의 현재 재고수는 ${newProduct.stockQuantity}개입니다.`);
      finalQuantity = newProduct.stockQuantity;
    }

    // 백엔드로 쿠키와 함께 등록 요청
    return await addCartItemApi(newProduct.productId, finalQuantity, "로그인이 필요한 서비스입니다.")
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

    return !await changeCartItem(id, finalQuantity, "수량 DB 동기화 실패:")
  }

  // 4. 장바구니 상품 단건 삭제
  async function handleRemoveProduct(id: number) {
    setProducts((prevProducts) => prevProducts.filter((product) => product.productId !== id));

    try {
      await apiRequest(`/api/cart/${id}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("삭제 DB 동기화 실패:", err);
    }
  }

  // 5. 장바구니 전체 비우기
  async function handleClearCart() {
    setProducts([]);

    try {
      await apiRequest("/api/cart", {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("비우기 DB 동기화 실패:", err);
    }
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
        setProducts
      }}
    >
      {children}
    </ProductCartContext.Provider>
  );
}
