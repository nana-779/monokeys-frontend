"use client";

import { useEffect, useState } from "react";

export function ProductImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        aria-label={alt}
        className={`${className ?? ""} grid place-items-center bg-zinc-100 text-xs text-zinc-400`}
        role="img"
      >
        이미지 없음
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
