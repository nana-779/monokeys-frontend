"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Cart } from "./components/Cart"; 
import type { CartItem } from "@/features/cart/types";
import { ProductCartContext } from "./components/CartContext";
import type { ProductType } from "./interface/Product";

type CartContextValue = {
  items: CartItem[];
  selectedItems: CartItem[];
  cartLoading: boolean;
  addItem: (item: CartItem) => Promise<boolean | void>;
  updateQuantity: (index: number, quantity: number) => void;
  toggleItemSelected: (item: CartItem) => void;
  selectAllItems: (selected: boolean) => void;
  clearSelectedItems: () => void;
  clearCart: () => void;
  openCart: (tab?: 'standard' | 'custom') => void;
  closeCart: () => void;
  activeTab: 'standard' | 'custom';
  setActiveTab: (tab: 'standard' | 'custom') => void;
};

function getItemSelectionKey(item: Pick<CartItem, "cartItemId" | "productId">) {
  return item.cartItemId ? `item-${item.cartItemId}` : `prod-${item.productId}`;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('standard');
  const cartCtx = useContext(ProductCartContext);
  const products: ProductType[] = cartCtx?.products || [];
  const handleUpdateCount = cartCtx?.handleUpdateCount;
  const handleClearCart = cartCtx?.handleClearCart;
  const handleAddCart = cartCtx?.handleAddCart;

  const items = useMemo<CartItem[]>(() => {
    return products.map((p) => {
      const resolvedProductId =
        p.productId > 0
          ? p.productId
          : (p.manualBuildId ?? p.autoBuildId ?? p.cartItemId ?? 0);
      return {
        // 실제 product 레코드(일반 단품·커스텀 키캡)는 productId를 유지하고,
        // 상품 ID가 없는 수동/자동 빌드만 빌드·장바구니 식별자로 대체합니다.
        productId: String(resolvedProductId),
        cartItemId: p.cartItemId,
        slug: String(p.productId),
        name: p.name,
        image: p.thumbnailUrl,
        optionValue: p.customBuildId ? `custom-${p.customBuildId}` : undefined,
        optionLabel: p.buildName || (p.includeAssembly ? '조립 대행 포함' : undefined),
        unitPrice: p.price,
        shippingFee: 0,
        quantity: p.quantity,
        buildType: p.buildType as 'MANUAL' | 'AUTO' | undefined,
        manualBuildId: p.manualBuildId,
        autoBuildId: p.autoBuildId,
        customDesignData: p.customDesignData,
      };
    });
  }, [products]);

  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  const selectedItems = useMemo(() => {
    return items.filter((item) => !deselectedIds.has(getItemSelectionKey(item)));
  }, [items, deselectedIds]);

  const addItem = useCallback(async (item: CartItem) => {
    if (handleAddCart) {
      const manualBuildId = item.manualBuildId;
      const autoBuildId = item.autoBuildId;
      const isCustom = Boolean(
        manualBuildId || autoBuildId || item.buildType || item.customDesignData
      );

      const effectiveProductId = Number(item.productId) || (manualBuildId ? -manualBuildId : (autoBuildId ? -autoBuildId : 0));

      const isSuccess = await handleAddCart({
        productId: effectiveProductId,
        name: item.name,
        price: item.unitPrice,
        stockQuantity: 999,
        quantity: item.quantity,
        thumbnailUrl: item.image,
        partType: isCustom ? 'CUSTOM' : '',
        additionalPrice: 0,
        customBuildId: manualBuildId || autoBuildId || 0,
        manualBuildId,
        autoBuildId,
        buildType: item.buildType,
        buildName: item.name || item.optionLabel || '',
        includeAssembly: item.optionLabel?.includes('조립 대행') ?? false,
        customDesignData: item.customDesignData,
      });
      if (isSuccess !== false) {
        // 일반 상품을 담았으면 'standard', 커스텀 상품을 담았으면 'custom' 탭이 즉시 열림
        setActiveTab(isCustom ? 'custom' : 'standard');
        setCartOpen(true);
        return true;
      }
      return false;
    }
  }, [handleAddCart]);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    const item = items[index];
    if (item && handleUpdateCount) {
      handleUpdateCount(item.cartItemId ?? Number(item.productId), quantity);
    }
  }, [items, handleUpdateCount]);

  const toggleItemSelected = useCallback((item: CartItem) => {
    const key = getItemSelectionKey(item);
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAllItems = useCallback((selected: boolean) => {
    if (selected) {
      setDeselectedIds(new Set());
    } else {
      setDeselectedIds(new Set(items.map((i) => getItemSelectionKey(i))));
    }
  }, [items]);

  const clearSelectedItems = useCallback(() => {
    if (handleClearCart) {
      handleClearCart();
    }
    setDeselectedIds(new Set());
  }, [handleClearCart]);

  const clearCart = useCallback(() => {
    if (handleClearCart) {
      handleClearCart();
    }
    setDeselectedIds(new Set());
  }, [handleClearCart]);

  const openCart = useCallback((tab?: 'standard' | 'custom') => {
    if (tab) {
      setActiveTab(tab);
    }
    setCartOpen(true);
   }, []);

  const closeCart = useCallback(() => setCartOpen(false), []);

  const cartLoading = cartCtx?.cartLoading ?? false;

  const value = useMemo<CartContextValue>(() => ({
    items,
    selectedItems,
    cartLoading,
    addItem,
    updateQuantity,
    toggleItemSelected,
    selectAllItems,
    clearSelectedItems,
    clearCart,
    openCart,
    closeCart,
    activeTab,
    setActiveTab
  }), [addItem, cartLoading, clearCart, clearSelectedItems, closeCart, items, openCart, selectAllItems, selectedItems, toggleItemSelected, updateQuantity, activeTab]);

  return (
    <CartContext.Provider value={value}>
      {children}
      <Cart
        onClose={closeCart}
        open={cartOpen}
      />
    </CartContext.Provider>
  );
}
