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

  // 2. 장바구니 상품 추가 (백엔드 쿠키 인증 결과에 따라 처리)
  async function handleAddProduct(newProduct: ProductType): Promise<boolean> {
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

    await changeCartItem(id, finalQuantity);
  }

  // 4. 장바구니 상품 단건 삭제
  async function handleRemoveProduct(id: number) {
    setProducts((prevProducts) => prevProducts.filter((product) => product.productId !== id));
    await removeCartItemApi(id);
  }

  // 5. 장바구니 전체 비우기
  async function handleClearCart() {
    setProducts([]);
    await clearCartApi();
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
