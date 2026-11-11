"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ProductType } from "../interface/Product";
import { ProductCartContext } from "./CartContext";

export function ProductCartProvider({ children }: { children: ReactNode}) {
  const [products, setProducts] = useState<ProductType[]>([]);

  const isLoaded = useRef(false);

  useEffect(() => {
    if (!isLoaded.current) {
      const saveProduct = localStorage.getItem("cartProduct");
      if (saveProduct) {
        setProducts(JSON.parse(saveProduct))
      }

      isLoaded.current = true;
      return;
    }
    localStorage.setItem("cartProduct", JSON.stringify(products));
  }, [products]);

  function handleUpdateCount(id : string, newQuantity : number) {
    setProducts((prevProducts : ProductType[]) => prevProducts.map((product : ProductType) => {
      if (product.productId === id) {
        const targetProduct = products.find((product : ProductType) => product.productId === id);

        newQuantity = Math.max(0, newQuantity);

        if (targetProduct && newQuantity > targetProduct.stock) {
          alert(`${targetProduct.name}의 현재 재고수는 ${targetProduct.stock}개입니다.`);
          newQuantity = targetProduct.stock;
        }
        
        return { ...product, quantity : newQuantity};
      }
      return product;
    })
  );}

  function handleRemoveProduct(id : string) {
    setProducts((prevProducts : ProductType[]) =>
      prevProducts.filter((product : ProductType) => product.productId !== id)
    );
  }

  function handleAddProduct(newProduct: ProductType) {
      const existingProduct = products.find(
          (product) =>
              product.productId === newProduct.productId &&
              product.optionId === newProduct.optionId &&
              product.customBuildId === newProduct.customBuildId &&
              product.includeAssembly === newProduct.includeAssembly
      );

      if (existingProduct) {
          const newQuantity =
              existingProduct.quantity + newProduct.quantity;

          if (newQuantity > existingProduct.stock) {
              alert(
                  `${existingProduct.name}의 현재 재고수는 ${existingProduct.stock}개입니다.`
              );
          }

          const finalQuantity = Math.min(
              newQuantity,
              existingProduct.stock
          );

          setProducts((prevProducts) =>
              prevProducts.map((product) => {
                  if (
                      product.productId === newProduct.productId &&
                      product.optionId === newProduct.optionId &&
                      product.customBuildId === newProduct.customBuildId &&
                      product.includeAssembly === newProduct.includeAssembly
                  ) {
                      return {
                          ...product,
                          quantity: finalQuantity,
                      };
                  }

                  return product;
              })
          );

          return;
      }

      const newStock = Math.max(2, Math.floor(Math.random() * 20));
      setProducts((prevProducts) => [
          ...prevProducts,
          {
              ...newProduct,
              stock: Math.max(newProduct.quantity, newStock)
          },
      ]);
  }

  return (
    <ProductCartContext.Provider value={{products, handleUpdateCount, handleRemoveProduct, handleAddProduct}}>
      {children}  
    </ProductCartContext.Provider>
  );
}