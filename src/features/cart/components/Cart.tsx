import { useContext, useEffect, useMemo, useState } from "react";
import "../style.css";
import { ProductCartContext } from "./CartContext";
import type { ProductList, ProductType } from "../interface/Product";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/store-shared";
import { useCart } from "../cart-provider";

type CartProps = {
  open: boolean;
  onClose: () => void;
};

const isCustomProduct = (p: ProductType) =>
    Boolean(
        (p.customBuildId && p.customBuildId > 0) ||
        (p.buildName && p.buildName.trim().length > 0) ||
        p.partType === 'CUSTOM' ||
        p.manualBuildId ||
        p.autoBuildId ||
        p.buildType ||
        p.customDesignData
    );

export function Cart({ open, onClose } : CartProps) {
    const { products, cartLoading, refreshCartIfStale } = useContext(ProductCartContext);
    const { activeTab, setActiveTab } = useCart();
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    // 장바구니 서랍이 열릴 때 마지막 동기화 후 일정 시간이 지난 경우에만 백엔드 상태를 재확인합니다.
    useEffect(() => {
        if (open) {
            void refreshCartIfStale();
        }
    }, [open, refreshCartIfStale]);

    const router = useRouter();

    const { standardProducts, customProducts, totalCost, allItemCount } = useMemo(() => {
        const standard: ProductType[] = [];
        const custom: ProductType[] = [];
        let cost = 0;
        let count = 0;

        for (const p of products) {
            if (isCustomProduct(p)) custom.push(p);
            else standard.push(p);
            cost += p.price * p.quantity;
            count += p.quantity;
        }

        return { standardProducts: standard, customProducts: custom, totalCost: cost, allItemCount: count };
    }, [products]);

    const standardItemCount = standardProducts.length;
    const customItemCount = customProducts.length;

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX === null) return;
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (diff > 50) {
            setActiveTab('custom');
        } else if (diff < -50) {
            setActiveTab('standard');
        }
        setTouchStartX(null);
    };

    return (
        <div 
            id="Cart-Root"
            className={`fixed inset-0 z-[60] transition ${
            open
            ? "pointer-events-auto"
            : "pointer-events-none"
        }`}>
            <div
                id="Cart-Overlay"
                className={`fixed inset-0 z-[60] transition-opacity duration-500 ${
                    open
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0"
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
                                <path d="M5 5L10 10M10 10L15 15M10 10L15 5M10 10L15 5M10 10L5 15" strokeWidth="1.25" strokeLinecap="round" stroke="#09090B"/>
                            </svg>
                        </button>
                    </div>

                    <div id="Cart-Tabs" className="flex w-full border-b border-zinc-200">
                        <button
                            type="button"
                            onClick={() => setActiveTab('standard')}
                            className={`relative flex-1 py-3 text-center text-sm transition-colors ${
                                activeTab === 'standard'
                                    ? 'font-semibold text-black'
                                    : 'font-normal text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            일반 상품{cartLoading ? "" : ` (${standardItemCount})`}
                            {activeTab === 'standard' && (
                                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('custom')}
                            className={`relative flex-1 py-3 text-center text-sm transition-colors ${
                                activeTab === 'custom'
                                    ? 'font-semibold text-black'
                                    : 'font-normal text-zinc-400 hover:text-zinc-600'
                            }`}
                        >
                            커스텀 상품{cartLoading ? "" : ` (${customItemCount})`}
                            {activeTab === 'custom' && (
                                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black" />
                            )}
                        </button>
                    </div>

                    <div
                        id="Cart-Body"
                        style={{ padding: 0, overflow: 'hidden' }}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div
                            className="flex h-full w-[200%] transition-transform duration-300 ease-in-out"
                            style={{
                                transform: activeTab === 'standard' ? 'translateX(0%)' : 'translateX(-50%)',
                            }}
                        >
                            {/* 1. 일반 상품 목록 */}
                            <div className="flex h-full w-1/2 flex-col items-start overflow-y-auto overflow-x-hidden py-5">
                                {cartLoading ? (
                                    <CartSkeletonList />
                                ) : standardProducts.length === 0 ? (
                                    <NotThingItem
                                        message="담긴 일반 상품이 없습니다."
                                        describe="원하는 상품을 장바구니에 담아보세요."
                                    />
                                ) : (
                                    standardProducts.map((product: ProductType, idx: number) => (
                                        <ListItem key={product.cartItemId ?? `standard-${product.productId}-${idx}`} product={product} />
                                    ))
                                )}
                            </div>

                            {/* 2. 커스텀 상품 목록 */}
                            <div className="flex h-full w-1/2 flex-col items-start overflow-y-auto overflow-x-hidden py-5">
                                {cartLoading ? (
                                    <CartSkeletonList />
                                ) : customProducts.length === 0 ? (
                                    <NotThingItem
                                        message="담긴 커스텀 상품이 없습니다."
                                        describe="CUSTOM BUILD에서 나만의 키보드를 조립해보세요."
                                    />
                                ) : (
                                    customProducts.map((product: ProductType, idx: number) => (
                                        <ListItem key={product.cartItemId ?? `custom-${product.manualBuildId ?? product.autoBuildId ?? idx}`} product={product} />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div id="Cart-Footer">
                        <div id="Total-Const-Fraim">
                            <p id="Subtotal">Subtotal</p>
                            <p id="Total-Cost">{formatPrice(totalCost)}</p>
                        </div>
                        <button id="Cart-Payment-Button"
                                className={`transition-all duration-150 ${allItemCount > 0 ? "bg-zinc-800 hover:bg-zinc-950 active:scale-[0.99]" : "off"}`}
                                type="button"
                                disabled={allItemCount === 0}
                                onClick={() => {
                                    onClose();
                                    router.push('/checkout');
                                }}
                        >CHECKOUT</button>
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
                <div
                    className="flex w-[90%] items-start gap-4 border-b border-zinc-100 py-5"
                    key={idx}
                >
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

function NotThingItem({message, describe} : {message : string, describe : string}) {
    return (
        <div id="Not-Thing-Item">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.33301 13.3333H31.6663L29.9997 33.3333H9.99967L8.33301 13.3333Z" strokeWidth="2.5" stroke="#D4D4D8"/>
                <path d="M15 15V10C15 8.67392 15.5268 7.40215 16.4645 6.46447C17.4021 5.52678 18.6739 5 20 5C21.3261 5 22.5979 5.52678 23.5355 6.46447C24.4732 7.40215 25 8.67392 25 10V15" strokeWidth="2.5" stroke="#D4D4D8"/>
            </svg>
            <p id="Not-Thing-Item-Message">{message}</p>
            <p id="Not-Thing-Item-Describe">{describe}</p>
        </div>
    )
}

function ListItem({ product } : ProductList) {
    const { handleUpdateCount, handleRemoveProduct } = useContext(ProductCartContext);
    const targetId = product.cartItemId ?? product.manualBuildId ?? product.autoBuildId ?? product.productId;
    const isMaxStock = product.quantity >= product.stockQuantity;
    return (
        <ul id="In-Item">
            {product.thumbnailUrl ? (
                <img id="Cart-Item-Img" src={product.thumbnailUrl} alt={product.name || "상품 이미지"} />
            ) : (
                <div id="Cart-Item-Img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f5', fontSize: '11px', color: '#a1a1aa' }}>
                    NO IMG
                </div>
            )}
            <div id="Cart-Item-Distance">
                <div id="Cart-Item-Main">
                    <p id="Cart-Item-Name">{product.name}</p>
                    <button id="Cart-Item-Remove-Button" type="button" tabIndex={-1} onClick={() => handleRemoveProduct(targetId)}>
                        <svg id="Cart-Item-Remove_Icon" width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 5L15.1327 17.1425C15.0579 18.1891 14.187 19 13.1378 19H4.86224C3.81296 19 2.94208 18.1891 2.86732 17.1425L2 5M16 5H12M16 5H17M2 5H1M2 5H6M7 9V15M11 9V15M12 5V2C12 1.44772 11.5523 1 11 1H7C6.44772 1 6 1.44772 6 2V5M12 5H6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#000000"/>
                        </svg>
                    </button>
                </div>
                <div id="Cart-Item-Cost">
                    <div id="Cart-Count-Setting">
                        <button id="Cart-Count-Minus"
                                className={`${product.quantity > 1 ? "on" : "off"}`}
                                type="button" tabIndex={-1}
                                disabled={product.quantity <= 1}
                                onClick={() => handleUpdateCount(targetId, product.quantity - 1)}>
                            <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M0 0.5H9.33333" stroke="currentColor"/>
                            </svg>
                        </button>
                        <div id="Cart-Item-Count-Frame">
                            <p id="Cart-Item-Count">{product.quantity}</p>
                        </div>
                        <button id="Cart-Count-Plus"
                                className={`${!isMaxStock ? "on" : "off"}`}
                                type="button" tabIndex={-1}
                                disabled={isMaxStock}
                                onClick={() => handleUpdateCount(targetId, product.quantity + 1)}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M0 4.66667H4.66667M4.66667 4.66667H9.33333M4.66667 4.66667V0M4.66667 4.66667V9.33333" stroke="currentColor"/>
                            </svg>
                        </button>
                    </div>
                    <p id="Cart-Explain">{formatPrice(product.price * product.quantity)}</p>
                </div>
            </div>
        </ul>
    );
}