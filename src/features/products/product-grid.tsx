"use client";

import { useState } from "react";
import { ProductCard } from "@/components/common/product-card";
import type { StoreProduct } from "@/lib/store-shared";

const filters = ["all", "pcb", "switches", "keycaps", "housing"] as const;
type Filter = (typeof filters)[number];

const filterLabels: Record<Filter, string> = {
  all: "ALL",
  pcb: "기판",
  switches: "SWITCHES",
  keycaps: "KEYCAPS",
  housing: "HOUSING",
};

export function ProductGrid({ products, initialCategory = "all" }: { products: StoreProduct[]; initialCategory?: Filter }) {
  const [category, setCategory] = useState<Filter>(initialCategory);

  const selectCategory = (filter: Filter) => {
    setCategory(filter);
    const url = filter === "all" ? "/products" : `/products?category=${filter}`;
    window.history.replaceState(null, "", url);
  };
  const filtered = products.filter((product) => category === "all" || product.category === category);

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
