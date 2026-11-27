"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cart } from "./components/Cart"; 
import type { CartItem } from "@/features/cart/types";
import { ProductCartContext } from "./components/CartContext";
import { removeCartItemApi } from "./api";
import type { ProductType } from "./interface/Product";

const DESELECTED_STORAGE_KEY = "monokeys:cart-deselected-ids";

type CartContextValue = {
  items: CartItem[];
  selectedItems: CartItem[];
  cartLoading: boolean;
  isItemSelected: (item: Pick<CartItem, "cartItemId" | "productId">) => boolean;
  addItem: (item: CartItem) => Promise<boolean | void>;
  updateQuantity: (index: number, quantity: number) => void;
  toggleItemSelected: (item: Pick<CartItem, "cartItemId" | "productId">) => void;
  selectAllItems: (selected: boolean) => void;
  removeSelectedItems: () => Promise<void>;
  clearSelectedItems: () => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
};

export function getItemSelectionKey(item: Pick<CartItem, "cartItemId" | "productId">) {
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
  const cartCtx = useContext(ProductCartContext);
  const products: ProductType[] = cartCtx?.products || [];
  const handleUpdateCount = cartCtx?.handleUpdateCount;
  const handleClearCart = cartCtx?.handleClearCart;
  const handleAddCart = cartCtx?.handleAddCart;

  const items = useMemo<CartItem[]>(() => {
    return products.map((p) => {
      const itemKind: CartItem["itemKind"] = p.manualBuildId
        ? "MANUAL_BUILD"
        : p.autoBuildId
          ? "AUTO_BUILD"
          : p.customDesignData
            ? "CUSTOM_KEYCAP"
            : "STANDARD";
      const isBuild = itemKind === "MANUAL_BUILD" || itemKind === "AUTO_BUILD";
      const buildSummaryLabel = isBuild
        ? `${itemKind === "AUTO_BUILD" ? "자동 추천" : "수동 조립"} · ${p.includeAssembly ? "조립 대행" : "직접 조립"}`
        : undefined;
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
        optionValue: p.manualBuildId
          ? `manual-${p.manualBuildId}`
          : p.autoBuildId
            ? `auto-${p.autoBuildId}`
            : p.customBuildId
              ? `custom-${p.customBuildId}`
              : undefined,
        optionLabel: p.buildName || buildSummaryLabel,
        unitPrice: p.price,
        shippingFee: 0,
        quantity: p.quantity,
        itemKind,
        includeAssembly: Boolean(p.includeAssembly),
        buildType: p.buildType as 'MANUAL' | 'AUTO' | undefined,
        manualBuildId: p.manualBuildId,
        autoBuildId: p.autoBuildId,
        partDetails: p.partDetails,
        customDesignData: p.customDesignData,
      };
    });
  }, [products]);

  const cartLoading = cartCtx?.cartLoading ?? false;
  const refreshCart = cartCtx?.refreshCart;
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [removingSelected, setRemovingSelected] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DESELECTED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDeselectedIds(new Set(parsed.filter((v): v is string => typeof v === "string")));
        }
      }
    } catch {
      // 스토리지 접근 불가 환경 무시
    } finally {
      setStorageHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      sessionStorage.setItem(DESELECTED_STORAGE_KEY, JSON.stringify([...deselectedIds]));
    } catch {
      // 스토리지 접근 불가 환경 무시
    }
  }, [deselectedIds, storageHydrated]);

  useEffect(() => {
    if (cartLoading || !storageHydrated || items.length === 0) return;
    const validKeys = new Set(items.map((item) => getItemSelectionKey(item)));
    setDeselectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cartLoading, items, storageHydrated]);

  const isItemSelected = useCallback(
    (item: Pick<CartItem, "cartItemId" | "productId">) => !deselectedIds.has(getItemSelectionKey(item)),
    [deselectedIds],
  );

  const selectedItems = useMemo(() => {
    return items.filter((item) => isItemSelected(item));
  }, [isItemSelected, items]);

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

  const toggleItemSelected = useCallback((item: Pick<CartItem, "cartItemId" | "productId">) => {
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

  const removeSelectedItems = useCallback(async () => {
    if (removingSelected || selectedItems.length === 0) return;
    const targetIds = selectedItems
      .map((item) => item.cartItemId ?? Number(item.productId))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (targetIds.length === 0) return;

    setRemovingSelected(true);
    try {
      await Promise.all(targetIds.map((id) => removeCartItemApi(id)));
      if (refreshCart) {
        await refreshCart();
      }
    } finally {
      setRemovingSelected(false);
    }
  }, [refreshCart, removingSelected, selectedItems]);

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

  const openCart = useCallback(() => {
    setCartOpen(true);
  }, []);

  const closeCart = useCallback(() => setCartOpen(false), []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    selectedItems,
    cartLoading,
    isItemSelected,
    addItem,
    updateQuantity,
    toggleItemSelected,
    selectAllItems,
    removeSelectedItems,
    clearSelectedItems,
    clearCart,
    openCart,
    closeCart,
  }), [addItem, cartLoading, clearCart, clearSelectedItems, closeCart, isItemSelected, items, openCart, removeSelectedItems, selectAllItems, selectedItems, toggleItemSelected, updateQuantity]);

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
