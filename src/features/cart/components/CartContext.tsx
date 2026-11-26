"use client";

import { createContext, type Dispatch, type SetStateAction } from "react";
import type { ProductType } from "../interface/Product";

export type ProductCartContextValue = {
  products: ProductType[];
  cartLoading: boolean;
  handleUpdateCount: (id: number, newQuantity: number) => Promise<void>;
  handleRemoveProduct: (id: number) => Promise<void>;
  handleAddCart: (newProduct: ProductType) => Promise<boolean>;
  handleClearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  refreshCartIfStale: () => Promise<void>;
  setProducts: Dispatch<SetStateAction<ProductType[]>>;
};

const noopAsync = async () => {};

export const ProductCartContext = createContext<ProductCartContextValue>({
  products: [],
  cartLoading: false,
  handleUpdateCount: noopAsync,
  handleRemoveProduct: noopAsync,
  handleAddCart: async () => false,
  handleClearCart: noopAsync,
  refreshCart: noopAsync,
  refreshCartIfStale: noopAsync,
  setProducts: () => {},
});