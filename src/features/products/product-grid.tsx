"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/common/product-card";
import { getPreviewProducts } from "@/features/products/preview-data";
import type { StoreProduct } from "@/lib/store-shared";

const filters = ["all", "keyboards", "switches", "keycaps", "housing"] as const;
type Filter = (typeof filters)[number];

const filterLabels: Record<Filter, string> = {
  all: "ALL",
  keyboards: "KEYBOARDS",
  switches: "SWITCHES",
  keycaps: "KEYCAPS",
  housing: "HOUSING",
};

export function ProductGrid({ products }: { products: StoreProduct[] }) {
  const [category, setCategory] = useState<Filter>("all");
  const [visibleProducts, setVisibleProducts] = useState(products);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "category",
    );
    if (filters.includes(requested as Filter)) {
      const selectedCategory = requested as Filter;
      setCategory(selectedCategory);
      if (selectedCategory !== "all") {
        setVisibleProducts(getPreviewProducts(selectedCategory));
      }
    }
  }, []);

  const selectCategory = (filter: Filter) => {
    setCategory(filter);
    const url = filter === "all" ? "/products" : `/products?category=${filter}`;
    window.history.replaceState(null, "", url);
    // TODO: API 연동 전까지 샘플 상품으로 카테고리 화면을 미리 보여줍니다.
    setVisibleProducts(
      getPreviewProducts(filter === "all" ? undefined : filter),
    );
  };
  const filtered = visibleProducts;

  return (
    <>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!filtered.length && (
        <div className="rounded-xl border border-dashed border-zinc-300 py-24 text-center text-zinc-500">
          No products in this category yet.
        </div>
      )}
    </>
  );
}
