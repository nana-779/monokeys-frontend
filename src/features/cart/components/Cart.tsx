import { useContext, useEffect, useMemo, useState } from "react";
import "../style.css";
import { ProductCartContext } from "./CartContext";
import { useCart } from "../cart-provider";
import type { ProductType } from "../interface/Product";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/store-shared";

type CartProps = {
  open: boolean;
  onClose: () => void;
};

type ParsedCustomDesign = {
  keyType?: string;
  keySize?: string;
  backgroundColor?: string;
  customText?: string | null;
  previewImageUrl?: string;
  printImageUrl?: string;
};

const PART_TYPE_LABELS: Record<string, string> = {
  HOUSING: "하우징",
  PCB: "기판",
  SWITCH: "스위치",
  KEYCAP: "키캡",
};

function parseCustomDesignDetails(raw?: string): ParsedCustomDesign | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ParsedCustomDesign) : null;
  } catch {
    return null;
  }
}

export function Cart({ open, onClose }: CartProps) {
  const { products, cartLoading, refreshCartIfStale } = useContext(ProductCartContext);
  const { items, selectedItems, isItemSelected, toggleItemSelected, selectAllItems, removeSelectedItems } = useCart();

  // 장바구니 서랍이 열릴 때 마지막 동기화 후 일정 시간이 지난 경우에만 백엔드 상태를 재확인합니다.
  useEffect(() => {
    if (open) {
      void refreshCartIfStale();
    }
  }, [open, refreshCartIfStale]);

  const router = useRouter();

  const { selectedCost, selectedQuantity, selectedLineCount } = useMemo(() => {
    let cost = 0;
    let qty = 0;
    for (const item of selectedItems) {
      cost += item.unitPrice * item.quantity;
      qty += item.quantity;
    }
    return {
      selectedCost: cost,
      selectedQuantity: qty,
      selectedLineCount: selectedItems.length,
    };
  }, [selectedItems]);

  const isAllSelected = items.length > 0 && selectedLineCount === items.length;

  return (
    <div
      id="Cart-Root"
      className={`fixed inset-0 z-[60] transition ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        id="Cart-Overlay"
        className={`fixed inset-0 z-[60] transition-opacity duration-500 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button
          type="button"
          aria-label="장바구니 닫기"
          onClick={onClose}
          className={`absolute inset-0 h-full w-full bg-black/50 transition-opacity duration-500 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          id="Cart-Container"
          className={`fixed right-0 top-0 flex h-screen w-full max-w-md flex-col bg-white p-7 shadow-2xl transition-transform duration-500 ease-in-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div id="Cart-Header">
            <h2 id="Cart-Header-Name">Your cart {cartLoading ? "" : `(${products.length})`}</h2>
            <button id="Cart-Close-Button" type="button" onClick={onClose}>
              <svg id="Cart-Close-Icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 5L10 10M10 10L15 15M10 10L15 5M10 10L15 5M10 10L5 15" strokeWidth="1.25" strokeLinecap="round" stroke="#09090B" />
              </svg>
            </button>
          </div>

          <div id="Cart-Body" className="w-full overflow-y-auto overflow-x-hidden py-3" style={{ padding: "12px 0" }}>
            {cartLoading ? (
              <CartSkeletonList />
            ) : products.length === 0 ? (
              <NotThingItem
                message="장바구니가 비어 있습니다."
                describe="원하는 상품이나 나만의 커스텀 키보드를 담아보세요."
              />
            ) : (
              <>
                <div className="mb-2.5 flex w-full items-center justify-between border-b border-zinc-200 pb-2.5">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-zinc-700">
                    <input
                      aria-label="장바구니 상품 전체 선택"
                      checked={isAllSelected}
                      className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-zinc-950"
                      onChange={(event) => selectAllItems(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      전체 선택 ({selectedLineCount}/{items.length})
                    </span>
                  </label>
                  <button
                    className="text-xs font-medium text-zinc-500 transition hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={selectedLineCount === 0}
                    onClick={() => void removeSelectedItems()}
                    type="button"
                  >
                    선택 삭제
                  </button>
                </div>
                <ul className="w-full space-y-2.5">
                  {products.map((product: ProductType, idx: number) => {
                    const cartItem = items[idx] ?? {
                      cartItemId: product.cartItemId,
                      productId: String(product.productId),
                    };
                    return (
                      <ListItem
                        checked={isItemSelected(cartItem)}
                        key={product.cartItemId ?? `cart-${product.manualBuildId ?? product.autoBuildId ?? product.productId}-${idx}`}
                        onToggleSelect={() => toggleItemSelected(cartItem)}
                        product={product}
                      />
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <div id="Cart-Footer">
            <div id="Total-Const-Fraim">
              <p id="Subtotal">
                {products.length > 0 ? `Subtotal (${selectedLineCount}건)` : "Subtotal"}
              </p>
              <p id="Total-Cost">{formatPrice(selectedCost)}</p>
            </div>
            <button
              id="Cart-Payment-Button"
              className={`transition-all duration-150 ${selectedQuantity > 0 ? "bg-zinc-800 hover:bg-zinc-950 active:scale-[0.99]" : "off"}`}
              type="button"
              disabled={selectedQuantity === 0}
              onClick={() => {
                onClose();
                router.push("/checkout");
              }}
            >
              {selectedLineCount > 0 ? `CHECKOUT (${selectedLineCount})` : "상품을 선택해 주세요"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CartSkeletonList() {
  return (
    <div aria-busy="true" aria-label="장바구니 상품을 불러오는 중입니다" className="w-full" role="status">
      {[0, 1, 2].map((idx) => (
        <div className="flex w-full items-start gap-4 border-b border-zinc-100 py-5" key={idx}>
          <div className="h-20 w-20 shrink-0 animate-pulse rounded-sm bg-zinc-200" />
          <div className="flex h-20 flex-1 flex-col justify-between py-0.5">
            <div className="flex items-center justify-between gap-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200" />
              <div className="h-5 w-5 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-7 w-20 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotThingItem({ message, describe }: { message: string; describe: string }) {
  return (
    <div id="Not-Thing-Item">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.33301 13.3333H31.6663L29.9997 33.3333H9.99967L8.33301 13.3333Z" strokeWidth="2.5" stroke="#D4D4D8" />
        <path d="M15 15V10C15 8.67392 15.5268 7.40215 16.4645 6.46447C17.4021 5.52678 18.6739 5 20 5C21.3261 5 22.5979 5.52678 23.5355 6.46447C24.4732 7.40215 25 8.67392 25 10V15" strokeWidth="2.5" stroke="#D4D4D8" />
      </svg>
      <p id="Not-Thing-Item-Message">{message}</p>
      <p id="Not-Thing-Item-Describe">{describe}</p>
    </div>
  );
}

type ListItemProps = {
  product: ProductType;
  checked: boolean;
  onToggleSelect: () => void;
};

function ListItem({ product, checked, onToggleSelect }: ListItemProps) {
  const { handleUpdateCount, handleRemoveProduct } = useContext(ProductCartContext);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const targetId = product.cartItemId ?? product.manualBuildId ?? product.autoBuildId ?? product.productId;
  const isMaxStock = product.quantity >= product.stockQuantity;
  const isBuild = Boolean(product.manualBuildId || product.autoBuildId || product.buildType);
  const isCustomKeycap = Boolean(!isBuild && product.customDesignData);
  const isAutoBuild = product.buildType === "AUTO" || Boolean(product.autoBuildId);
  const parsedKeycap = useMemo(
    () => (isCustomKeycap ? parseCustomDesignDetails(product.customDesignData) : null),
    [isCustomKeycap, product.customDesignData],
  );
  const partDetails = product.partDetails ?? [];

  const cardHighlightClass = isBuild
    ? "rounded-lg border border-zinc-200 border-l-[3px] border-l-zinc-950 bg-zinc-50/80 !px-3"
    : isCustomKeycap
      ? "rounded-lg border border-zinc-200 border-l-[3px] border-l-zinc-600 bg-zinc-50/40 !px-3"
      : "";

  return (
    <li id="In-Item" className={cardHighlightClass}>
      <label
        className="flex shrink-0 cursor-pointer items-center pt-0.5"
        style={{ order: -1 }}
      >
        <input
          aria-label={`${product.name || "상품"} 선택`}
          checked={checked}
          className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-zinc-950"
          onChange={onToggleSelect}
          type="checkbox"
        />
      </label>
      {product.thumbnailUrl ? (
        <img
          id="Cart-Item-Img"
          className={`rounded-sm border border-zinc-200 object-cover transition-opacity ${checked ? "" : "opacity-55"}`}
          src={product.thumbnailUrl}
          alt={product.name || "상품 이미지"}
        />
      ) : (
        <div
          id="Cart-Item-Img"
          className={`rounded-sm border border-zinc-200 transition-opacity ${checked ? "" : "opacity-55"}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4f4f5", fontSize: "11px", color: "#a1a1aa" }}
        >
          NO IMG
        </div>
      )}
      <div id="Cart-Item-Distance" className={`transition-opacity ${checked ? "" : "opacity-55"}`}>
        <div className="space-y-1.5">
          {/* 상품 구분 배지 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isBuild ? (
              <>
                <span className="inline-flex items-center rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                  커스텀 키보드
                </span>
                <span className="inline-flex items-center rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                  {isAutoBuild ? "자동 추천" : "수동 조립"}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {product.includeAssembly ? "조립 대행" : "직접 조립"}
                </span>
              </>
            ) : isCustomKeycap ? (
              <span className="inline-flex items-center rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                커스텀 키캡
              </span>
            ) : (
              <span className="inline-flex items-center rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                일반 상품
              </span>
            )}
          </div>

          <div id="Cart-Item-Main">
            <p id="Cart-Item-Name" title={product.name}>
              {product.name}
            </p>
            <button id="Cart-Item-Remove-Button" type="button" tabIndex={-1} aria-label="상품 삭제" onClick={() => handleRemoveProduct(targetId)}>
              <svg id="Cart-Item-Remove_Icon" width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 5L15.1327 17.1425C15.0579 18.1891 14.187 19 13.1378 19H4.86224C3.81296 19 2.94208 18.1891 2.86732 17.1425L2 5M16 5H12M16 5H17M2 5H1M2 5H6M7 9V15M11 9V15M12 5V2C12 1.44772 11.5523 1 11 1H7C6.44772 1 6 1.44772 6 2V5M12 5H6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#000000" />
              </svg>
            </button>
          </div>

          {isCustomKeycap && product.buildName && (
            <p className="truncate text-xs text-zinc-500">{product.buildName}</p>
          )}
        </div>

        {/* 커스텀 빌드 구성품 / 커스텀 키캡 상세 토글 */}
        {(isBuild || isCustomKeycap) && (
          <div>
            <button
              aria-expanded={detailsOpen}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 transition hover:text-zinc-950"
              onClick={() => setDetailsOpen((prev) => !prev)}
              type="button"
            >
              <span>{isBuild ? (detailsOpen ? "구성품 접기" : `구성품 보기 (${partDetails.length || product.partProductIds?.length || 4}종)`) : detailsOpen ? "디자인 접기" : "디자인 상세"}</span>
              <span className="text-[10px]">{detailsOpen ? "▴" : "▾"}</span>
            </button>

            {detailsOpen && isBuild && (
              <div className="mt-2 space-y-1.5 rounded-md border border-zinc-200 bg-white p-2.5 text-xs">
                {partDetails.length > 0 ? (
                  partDetails.map((part) => (
                    <div className="flex items-center justify-between gap-2" key={`${part.partType}-${part.productId}`}>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                          {PART_TYPE_LABELS[part.partType] || part.partType}
                        </span>
                        <span className="truncate text-zinc-800" title={part.name}>
                          {part.name}
                        </span>
                      </div>
                      <span className="shrink-0 font-medium text-zinc-600">{formatPrice(part.unitPrice)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-500">
                    선택 부품 {product.partProductIds?.length || 4}종 조합
                  </p>
                )}
                <div className="flex items-center justify-between border-t border-dashed border-zinc-200 pt-1.5 text-[11px] text-zinc-500">
                  <span>조립 공임비</span>
                  <span className="font-medium text-zinc-700">
                    {product.includeAssembly ? "+20,000원 (조립 대행)" : "0원 (직접 조립)"}
                  </span>
                </div>
              </div>
            )}

            {detailsOpen && isCustomKeycap && (
              <div className="mt-2 space-y-1.5 rounded-md border border-zinc-200 bg-white p-2.5 text-xs text-zinc-600">
                <div className="flex items-center justify-between">
                  <span>규격</span>
                  <span className="font-medium text-zinc-900">
                    {[parsedKeycap?.keyType, parsedKeycap?.keySize].filter(Boolean).join(" · ") || "-"}
                  </span>
                </div>
                {parsedKeycap?.backgroundColor && (
                  <div className="flex items-center justify-between">
                    <span>배경색</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-zinc-300"
                        style={{ backgroundColor: parsedKeycap.backgroundColor }}
                      />
                      {parsedKeycap.backgroundColor}
                    </span>
                  </div>
                )}
                {parsedKeycap?.customText && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0">문구</span>
                    <span className="truncate font-medium text-zinc-900">"{parsedKeycap.customText}"</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div id="Cart-Item-Cost">
          <div id="Cart-Count-Setting">
            <button
              id="Cart-Count-Minus"
              className={`${product.quantity > 1 ? "on" : "off"}`}
              type="button"
              tabIndex={-1}
              disabled={product.quantity <= 1}
              onClick={() => handleUpdateCount(targetId, product.quantity - 1)}
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0.5H9.33333" stroke="currentColor" />
              </svg>
            </button>
            <div id="Cart-Item-Count-Frame">
              <p id="Cart-Item-Count">{product.quantity}</p>
            </div>
            <button
              id="Cart-Count-Plus"
              className={`${!isMaxStock ? "on" : "off"}`}
              type="button"
              tabIndex={-1}
              disabled={isMaxStock}
              onClick={() => handleUpdateCount(targetId, product.quantity + 1)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 4.66667H4.66667M4.66667 4.66667H9.33333M4.66667 4.66667V0M4.66667 4.66667V9.33333" stroke="currentColor" />
              </svg>
            </button>
          </div>
          <p id="Cart-Explain">{formatPrice(product.price * product.quantity)}</p>
        </div>
      </div>
    </li>
  );
}