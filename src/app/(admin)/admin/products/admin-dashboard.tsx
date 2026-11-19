import { ApiRequestError } from "@/lib/api-client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createAdminProduct,
  deleteAdminProduct,
  getAdminProduct,
  getAdminProducts,
  updateAdminProduct,
} from "@/features/admin/api";
import type {
  AdminProductInput,
  AdminProductRecord,
  AdminProductUpdateInput,
} from "@/features/admin/api";

import { getCategories } from "@/features/products/api";
import type { Category } from "@/features/products/types";

import { ProductImage } from "@/components/common/product-image";

type View = "register" | "list" | "edit";
type IconName =
  | "box"
  | "plus"
  | "list"
  | "search"
  | "filter"
  | "upload"
  | "image"
  | "trash"
  | "chevron"
  | "bell"
  | "user"
  | "check"
  | "close"
  | "alert"
  | "menu";

function productCategoryLabel(
  product: AdminProductRecord,
  categories: Category[],
) {
  if (product.categoryId === product.parentCategoryId) {
    return `${product.categoryName} / 소분류 미지정`;
  }
  const parent = categories.find(
    (category) => category.id === product.parentCategoryId,
  );
  return parent ? `${parent.label} / ${product.categoryName}` : product.categoryName;
}

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-800 focus:ring-3 focus:ring-zinc-800/10";

function formatProductDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR").format(date);
}

function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    box: (
      <>
        <path d="m3.5 7 8.5 4.8L20.5 7" />
        <path d="M12 21.5V11.8M20.5 16.7V7L12 2.5 3.5 7v9.7L12 21.5l8.5-4.8Z" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    filter: (
      <>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m4 17 5-5 4 4 2-2 5 5" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14M10 11v6M14 11v6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    alert: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {paths[name]}
    </svg>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-zinc-700">
        {label}
        {required && <span className="text-zinc-900">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex gap-3 border-b border-zinc-100 px-6 py-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-900">
          {number}
        </span>
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em] text-zinc-900">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function SubcategorySelect({
  categories,
  parentId,
  value,
  onChange,
  emptyLabel,
  required = false,
}: {
  categories: Category[];
  parentId: string;
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  required?: boolean;
}) {
  const children =
    categories.find((category) => category.id === parentId)?.subcategories ?? [];
  return (
    <select
      aria-label="소분류"
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={children.length === 0}
      required={required}
    >
      <option value="" disabled={required}>
        {emptyLabel}
      </option>
      {children.map((child) => (
        <option key={child.id} value={child.id}>
          {child.name}
        </option>
      ))}
    </select>
  );
}

function ProductForm({
  categories,
  mode,
  initialProduct,
  onCancel,
  onComplete,
}: {
  categories: Category[];
  mode: "register" | "edit";
  initialProduct?: AdminProductRecord;
  onCancel: () => void;
  onComplete: (message: string) => void;
}) {
  const [images, setImages] = useState<
    { name: string; url: string; file: File }[]
  >([]);
  const [price, setPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [spec, setSpec] = useState({
    layout: null as string | null,
    housingMaterial: null as string | null,
    supportPins: null as string | null,
    isWireless: null as boolean | null,
    switchPin: null as string | null,
    switchType: null as string | null,
    keycapMaterial: null as string | null,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImages = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      setError("JPG, JPEG, PNG, WEBP 이미지 파일만 선택할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지 용량은 5MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setError("");
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.url));
      return [{ name: file.name, url: URL.createObjectURL(file), file }];
    });
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const formatNumber = (value: string) =>
    value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "edit") {
      setError("상품 수정 API는 아직 연결되지 않았습니다.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const basePrice = Number(
      String(formData.get("basePrice") ?? "").replaceAll(",", ""),
    );
    const stockQuantity = Number(formData.get("stockQuantity"));
    const description =
      String(formData.get("description") ?? "").trim() || null;

    if (
      !subcategoryId ||
      !name ||
      !Number.isInteger(basePrice) ||
      basePrice <= 0 ||
      !Number.isInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      setError("상품명, 카테고리, 가격, 재고를 확인해 주세요.");
      return;
    }

    const input: AdminProductInput = {
      categoryId: subcategoryId,
      name,
      basePrice,
      stockQuantity,
      thumbnailUrl: null,
      description,
      layout: spec.layout,
      housingMaterial: spec.housingMaterial,
      supportPins: spec.supportPins,
      isWireless: spec.isWireless,
      switchPin: spec.switchPin ? Number(spec.switchPin) : null,
      switchType: spec.switchType,
      keycapMaterial: spec.keycapMaterial,
    };

    setError("");
    setSubmitting(true);
    try {
      const productId = await createAdminProduct(input, images[0]?.file);
      onComplete(`상품이 정상적으로 등록되었습니다. 상품 번호: ${productId}`);
      form.reset();
      setPrice("");
      setSelectedCategory("");
      setSubcategoryId("");
      setSpec({
        layout: null,
        housingMaterial: null,
        supportPins: null,
        isWireless: null,
        switchPin: null,
        switchType: null,
        keycapMaterial: null,
      });
      images.forEach((image) => URL.revokeObjectURL(image.url));
      setImages([]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "상품을 등록할 수 없습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormSection
        number="01"
        title="기본 정보"
        description="상품의 기본 정보를 입력해주세요"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="상품명" required>
              <input
                className={inputClass}
                name="name"
                placeholder="상품명을 입력해 주세요"
                defaultValue={initialProduct?.name ?? ""}
                required
              />
            </Field>
          </div>
          <Field label="대분류" required>
            <div className="relative">
              <select
                className={`${inputClass} appearance-none pr-10`}
                value={selectedCategory}
                aria-label="대분류"
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  setSelectedCategory(nextCategory);
                  setSubcategoryId("");
                  setSpec({
                    layout: null,
                    housingMaterial: null,
                    supportPins: null,
                    isWireless: nextCategory === "pcb" ? false : null,
                    switchPin: null,
                    switchType: null,
                    keycapMaterial: null,
                  });
                }}
                required
              >
                <option value="" disabled>
                  카테고리 선택
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400">
                <Icon name="chevron" size={16} />
              </span>
            </div>
          </Field>
          <Field label="소분류" required>
            <SubcategorySelect
              categories={categories}
              parentId={selectedCategory}
              value={subcategoryId}
              onChange={setSubcategoryId}
              emptyLabel="소분류 선택"
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="상품 설명" hint="300자 이내로 입력해주세요">
              <textarea
                maxLength={300}
                className={`${inputClass} min-h-32 resize-y py-3`}
                name="description"
                placeholder="상품 설명을 입력해 주세요"
              />
            </Field>
          </div>
        </div>
      </FormSection>

      <FormSection
        number="02"
        title="부품 상세 정보"
        description="선택한 카테고리에 맞는 규격과 소재를 입력해 주세요."
      >
        {!selectedCategory ? (
          <p className="text-sm text-zinc-400">
            먼저 기본 정보에서 상품 카테고리를 선택해 주세요.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {(selectedCategory === "housing" || selectedCategory === "pcb") && (
              <Field label="배열 규격">
                <select
                  className={inputClass}
                  value={spec.layout ?? ""}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      layout: event.target.value || null,
                    }))
                  }
                >
                  <option value="">선택 안 함</option>
                  <option value="87">87</option>
                  <option value="75">75</option>
                  <option value="65">65</option>
                </select>
              </Field>
            )}

            {selectedCategory === "housing" && (
              <Field label="하우징 소재">
                <select
                  className={inputClass}
                  value={spec.housingMaterial ?? ""}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      housingMaterial: event.target.value || null,
                    }))
                  }
                >
                  <option value="">선택 안 함</option>
                  <option value="알루미늄">알루미늄</option>
                  <option value="아크릴">아크릴</option>
                  <option value="폴리카보네이트">폴리카보네이트</option>
                  <option value="목재">목재</option>
                  <option value="플라스틱">플라스틱</option>
                </select>
              </Field>
            )}

            {selectedCategory === "pcb" && (
              <>
                <Field label="기판 지원 핀 규격">
                  <select
                    className={inputClass}
                    value={spec.supportPins ?? ""}
                    onChange={(event) =>
                      setSpec((current) => ({
                        ...current,
                        supportPins: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">선택 안 함</option>
                    <option value="3">3핀</option>
                    <option value="5">5핀</option>
                  </select>
                </Field>
                <Field label="무선 지원">
                  <label className="flex h-11 items-center gap-2 text-sm text-zinc-700">
                    <input
                      checked={spec.isWireless === true}
                      className="h-4 w-4 accent-zinc-900"
                      onChange={(event) =>
                        setSpec((current) => ({
                          ...current,
                          isWireless: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    무선 지원
                  </label>
                </Field>
              </>
            )}

            {selectedCategory === "switches" && (
              <>
                <Field label="스위치 핀 수">
                  <select
                    className={inputClass}
                    value={spec.switchPin ?? ""}
                    onChange={(event) =>
                      setSpec((current) => ({
                        ...current,
                        switchPin: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">선택 안 함</option>
                    <option value="3">3핀</option>
                    <option value="5">5핀</option>
                  </select>
                </Field>
                <Field label="스위치 분류">
                  <select
                    className={inputClass}
                    value={spec.switchType ?? ""}
                    onChange={(event) =>
                      setSpec((current) => ({
                        ...current,
                        switchType: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">선택 안 함</option>
                    <option value="linear">리니어</option>
                    <option value="tactile">택타일</option>
                    <option value="click">클릭</option>
                    <option value="silent">저소음</option>
                  </select>
                </Field>
              </>
            )}

            {selectedCategory === "keycaps" && (
              <Field label="키캡 소재">
                <select
                  className={inputClass}
                  value={spec.keycapMaterial ?? ""}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      keycapMaterial: event.target.value || null,
                    }))
                  }
                >
                  <option value="">선택 안 함</option>
                  <option value="PBT">PBT</option>
                  <option value="ABS">ABS</option>
                  <option value="POM">POM</option>
                </select>
              </Field>
            )}
          </div>
        )}
      </FormSection>

      <FormSection
        number="03"
        title="가격 및 재고"
        description="판매 가격과 재고 수량을 입력해 주세요."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="판매 가격" required>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-500">
                ₩
              </span>
              <input
                className={`${inputClass} pl-8`}
                inputMode="numeric"
                name="basePrice"
                placeholder="0"
                required
                value={price}
                onChange={(event) => setPrice(formatNumber(event.target.value))}
              />
            </div>
          </Field>
          <Field
            label="재고 수량"
            required
            hint="0 이상의 정수만 입력할 수 있습니다."
          >
            <input
              className={inputClass}
              min="0"
              name="stockQuantity"
              placeholder="0"
              defaultValue={initialProduct?.stockQuantity ?? ""}
              required
              type="number"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        number="04"
        title="상품 이미지"
        description="대표 이미지 파일을 선택하면 서버에 업로드되어 상품 썸네일로 저장됩니다."
      >
        {mode === "edit" &&
          initialProduct?.thumbnailUrl &&
          images.length === 0 && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-zinc-600">
                현재 대표 이미지
              </p>
              <img
                className="h-28 w-28 rounded-lg border border-zinc-200 object-cover"
                src={initialProduct.thumbnailUrl}
                alt={initialProduct.name}
              />
            </div>
          )}
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(event) => handleImages(event.target.files)}
        />
        <button
          className="group flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 text-center transition hover:border-zinc-600 hover:bg-zinc-100/40"
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleImages(event.dataTransfer.files);
          }}
        >
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm group-hover:text-zinc-900">
            <Icon name="upload" size={19} />
          </span>
          <span className="text-sm font-semibold text-zinc-700">
            클릭하여 업로드{" "}
            <span className="font-normal text-zinc-400">
              또는 이미지를 여기로 끌어오세요
            </span>
          </span>
          <span className="mt-1.5 text-xs text-zinc-400">
            JPG, PNG, WEBP · 최대 5MB · 대표 썸네일 이미지 1개
          </span>
        </button>
        {images.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image, index) => (
              <div
                key={`${image.name}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
              >
                <img
                  className="h-full w-full object-cover"
                  src={image.url}
                  alt={image.name}
                />
                <button
                  aria-label={`이미지 ${image.name} 삭제`}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-zinc-950/75 text-white opacity-0 backdrop-blur transition hover:bg-red-600 group-hover:opacity-100"
                  type="button"
                  onClick={() => removeImage(index)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6">
        {error && (
          <p className="mr-auto text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {mode === "edit" && (
          <button
            className="h-11 rounded-lg border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(0,0,0,0.1)] transition hover:bg-zinc-950 active:translate-y-px"
          disabled={submitting}
          type="submit"
        >
          <Icon name="check" size={17} />
          {submitting
            ? "등록 중..."
            : mode === "edit"
              ? "변경 사항 저장"
              : "상품 등록"}
        </button>
      </div>
    </form>
  );
}

function EditProductForm({
  categories,
  product,
  onCancel,
  onComplete,
}: {
  categories: Category[];
  product: AdminProductRecord;
  onCancel: () => void;
  onComplete: (product: AdminProductRecord) => void;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.basePrice));
  const [stock, setStock] = useState(String(product.stockQuantity));
  const [active, setActive] = useState(product.active);
  const [isWirelessEdited, setIsWirelessEdited] = useState(false);
  const [description, setDescription] = useState(product.description ?? "");
  const [spec, setSpec] = useState({
    layout: product.layout ?? "",
    housingMaterial: product.housingMaterial ?? "",
    supportPins: product.supportPins ?? "",
    isWireless: product.isWireless ?? false,
    switchPin: product.switchPin ? String(product.switchPin) : "",
    switchType: product.switchType ?? "",
    keycapMaterial: product.keycapMaterial ?? "",
  });
  const [image, setImage] = useState<File>();
  const [imagePreview, setImagePreview] = useState<string | null>(
    product.thumbnailUrl,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  const [categoryValue, setCategoryValue] = useState(product.parentCategoryId);
  const originalSubcategoryId =
    product.categoryId === product.parentCategoryId ? "" : product.categoryId;
  const [subcategoryId, setSubcategoryId] = useState(originalSubcategoryId);
  const parentChanged = categoryValue !== product.parentCategoryId;
  const categoryChanged = parentChanged || subcategoryId !== originalSubcategoryId;

  const selectImage = (file?: File) => {
    if (!file) return;
    const validType = ["image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    );
    const validExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!validType || !validExtension) {
      setError("JPG, JPEG, PNG, WEBP 이미지 파일만 선택할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지 용량은 5MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setError("");
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const basePrice = Number(price.replaceAll(",", ""));
    const stockQuantity = Number(stock);
    if (
      !name.trim() ||
      !Number.isInteger(basePrice) ||
      basePrice <= 0 ||
      !Number.isInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      setError("상품명, 가격, 재고를 확인해 주세요.");
      return;
    }

    if (categoryChanged && !subcategoryId) {
      setError("소분류를 선택해 주세요.");
      return;
    }

    const input: AdminProductUpdateInput = {
      ...(categoryChanged ? { categoryId: subcategoryId } : {}),
      name: name.trim(),
      basePrice,
      stockQuantity,
      active,
      description,
      layout: spec.layout || null,
      housingMaterial: spec.housingMaterial || null,
      supportPins: spec.supportPins || null,
      ...(categoryValue === "pcb" && isWirelessEdited
        ? { isWireless: spec.isWireless }
        : {}),
      switchPin: spec.switchPin ? Number(spec.switchPin) : null,
      switchType: spec.switchType || null,
      keycapMaterial: spec.keycapMaterial || null,
    };

    setSubmitting(true);
    setError("");
    try {
      const updated = await updateAdminProduct(
        String(product.productId),
        input,
        image,
      );
      onComplete(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "상품을 수정할 수 없습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormSection
        number="01"
        title="기본 정보"
        description="선택한 상품 정보를 수정해 주세요."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="상품명" required>
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
          </div>
          <Field
            label="대분류"
            hint={parentChanged ? "저장하면 새 대분류에서 사용하지 않는 스펙이 삭제됩니다." : undefined}
          >
            <select
              aria-label="대분류"
              className={inputClass}
              value={categoryValue}
              disabled={categories.length === 0}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setCategoryValue(nextCategory);
                setSubcategoryId(
                  nextCategory === product.parentCategoryId ? originalSubcategoryId : "",
                );
              }}
            >
              {categories.length === 0 && (
                <option value={product.parentCategoryId}>
                  {product.parentCategoryId}
                </option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="소분류">
            <SubcategorySelect
              categories={categories}
              parentId={categoryValue}
              value={subcategoryId}
              onChange={setSubcategoryId}
              emptyLabel={parentChanged || originalSubcategoryId ? "소분류 선택" : "소분류 미지정"}
              required={parentChanged || Boolean(originalSubcategoryId)}
            />
          </Field>
          <Field
            label="재고 수량"
            required
            hint="0 이상의 정수만 입력할 수 있습니다."
          >
            <input
              className={inputClass}
              type="number"
              min="0"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="상품 설명">
              <textarea
                className={`${inputClass} min-h-32 resize-y py-3`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </FormSection>

      <FormSection
        number="02"
        title="부품 상세 정보"
        description="현재 카테고리에 연결된 스펙을 수정합니다. 백엔드 PATCH는 빈 스펙값을 기존 값 유지로 처리합니다."
      >
        <div className="grid gap-5 md:grid-cols-2">
          {(categoryValue === "housing" || categoryValue === "pcb") && (
            <Field label="배열 규격">
              <select
                className={inputClass}
                value={spec.layout}
                onChange={(event) =>
                  setSpec((current) => ({
                    ...current,
                    layout: event.target.value,
                  }))
                }
              >
                <option value="">변경하지 않음</option>
                <option value="87">87</option>
                <option value="75">75</option>
                <option value="65">65</option>
              </select>
            </Field>
          )}
          {categoryValue === "housing" && (
            <Field label="하우징 소재">
              <select
                className={inputClass}
                value={spec.housingMaterial}
                onChange={(event) =>
                  setSpec((current) => ({
                    ...current,
                    housingMaterial: event.target.value,
                  }))
                }
              >
                <option value="">변경하지 않음</option>
                <option value="알루미늄">알루미늄</option>
                <option value="아크릴">아크릴</option>
                <option value="폴리카보네이트">폴리카보네이트</option>
                <option value="목재">목재</option>
                <option value="플라스틱">플라스틱</option>
              </select>
            </Field>
          )}
          {categoryValue === "pcb" && (
            <>
              <Field label="기판 지원 핀 규격">
                <select
                  className={inputClass}
                  value={spec.supportPins}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      supportPins: event.target.value,
                    }))
                  }
                >
                  <option value="">변경하지 않음</option>
                  <option value="3">3핀</option>
                  <option value="5">5핀</option>
                </select>
              </Field>
              <Field label="무선 지원">
                <label className="flex h-11 items-center gap-2 text-sm text-zinc-700">
                  <input
                    className="h-4 w-4 accent-zinc-900"
                    type="checkbox"
                    checked={spec.isWireless}
                    onChange={(event) => {
                      const isWireless = event.target.checked;
                      setSpec((current) => ({ ...current, isWireless }));
                      setIsWirelessEdited(true);
                    }}
                  />
                  무선 지원
                </label>
              </Field>
            </>
          )}
          {categoryValue === "switches" && (
            <>
              <Field label="스위치 핀 수">
                <select
                  className={inputClass}
                  value={spec.switchPin}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      switchPin: event.target.value,
                    }))
                  }
                >
                  <option value="">변경하지 않음</option>
                  <option value="3">3핀</option>
                  <option value="5">5핀</option>
                </select>
              </Field>
              <Field label="스위치 분류">
                <select
                  className={inputClass}
                  value={spec.switchType}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      switchType: event.target.value,
                    }))
                  }
                >
                  <option value="">변경하지 않음</option>
                  <option value="linear">리니어</option>
                  <option value="tactile">택타일</option>
                  <option value="click">클릭</option>
                  <option value="silent">저소음</option>
                </select>
              </Field>
            </>
          )}
          {categoryValue === "keycaps" && (
            <Field label="키캡 소재">
              <select
                className={inputClass}
                value={spec.keycapMaterial}
                onChange={(event) =>
                  setSpec((current) => ({
                    ...current,
                    keycapMaterial: event.target.value,
                  }))
                }
              >
                <option value="">변경하지 않음</option>
                <option value="PBT">PBT</option>
                <option value="ABS">ABS</option>
                <option value="POM">POM</option>
              </select>
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection
        number="03"
        title="가격 및 대표 이미지"
        description="새 이미지를 선택하면 기존 썸네일을 교체합니다. 선택하지 않으면 기존 이미지가 유지됩니다."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="판매 가격" required>
            <input
              className={inputClass}
              inputMode="numeric"
              value={price}
              onChange={(event) =>
                setPrice(event.target.value.replace(/[^\d]/g, ""))
              }
              required
            />
          </Field>
          <Field label="상품 이미지" hint="JPG, PNG, WEBP · 최대 5MB">
            <input
              ref={inputRef}
              className={inputClass}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => selectImage(event.target.files?.[0])}
            />
            {imagePreview && (
              <div className="relative mt-3 h-36 w-36 overflow-hidden rounded-lg bg-zinc-100">
                <ProductImage
                  src={imagePreview}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            {image && (
              <button
                type="button"
                className="mt-2 text-xs text-zinc-500 underline"
                onClick={() => {
                  setImage(undefined);
                  setImagePreview(product.thumbnailUrl);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                새 이미지 선택 취소
              </button>
            )}
          </Field>
        </div>
      </FormSection>

      <FormSection
        number="04"
        title="판매 상태"
        description="판매 중지 상태로 변경해도 관리자 상품 목록에서 계속 확인할 수 있습니다."
      >
        <div className="flex flex-wrap gap-3">
          <button
            aria-pressed={active}
            className={`h-11 rounded-lg border px-5 text-sm font-semibold transition ${
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            type="button"
            onClick={() => setActive(true)}
          >
            판매 중
          </button>
          <button
            aria-pressed={!active}
            className={`h-11 rounded-lg border px-5 text-sm font-semibold transition ${
              !active
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            type="button"
            onClick={() => setActive(false)}
          >
            판매 중지
          </button>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6">
        {error && (
          <p className="mr-auto text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          className="h-11 rounded-lg border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-600"
          type="button"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          <Icon name="check" size={17} />
          {submitting ? "저장 중..." : "변경 사항 저장"}
        </button>
      </div>
    </form>
  );
}

function ProductList({
  categories,
  products,
  onEdit,
  onDetail,
  onDelete,
  loading,
  error,
  onDeleteSelected,
  deleting,
  onRegister,
}: {
  categories: Category[];
  products: AdminProductRecord[];
  onEdit: (product: AdminProductRecord) => void;
  onDetail: (product: AdminProductRecord) => void;
  onDelete: (product: AdminProductRecord) => void;
  loading: boolean;
  error: string;
  onDeleteSelected: (products: AdminProductRecord[]) => Promise<void>;
  deleting: boolean;
  onRegister: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">(
    "",
  );
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      (!categoryFilter || product.parentCategoryId === categoryFilter) &&
      (!subcategoryFilter || product.categoryId === subcategoryFilter);
    const matchesStatus =
      statusFilter === "" || product.active === (statusFilter === "active");
    return matchesCategory && matchesStatus;
  });

  // 필터로 숨겨진 상품은 선택삭제 대상에 포함하지 않습니다.
  const selectedProducts = filteredProducts.filter((product) => selectedIds.includes(product.productId));
  const allSelected = filteredProducts.length > 0 && selectedProducts.length === filteredProducts.length;
  const toggleSelection = (id: number, checked: boolean) => {
    setSelectedIds((current) => checked ? [...current, id] : current.filter((value) => value !== id));
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="border-b border-zinc-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1 lg:max-w-md">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
              <Icon name="search" size={18} />
            </span>
            <input
              className={`${inputClass} pl-10`}
              placeholder="상품명을 검색해 주세요"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                className={`${inputClass} w-44 appearance-none pl-9 pr-9`}
                aria-label="대분류 필터"
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setSubcategoryFilter("");
                }}
              >
                <option value="">전체 상품</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <Icon name="filter" size={16} />
              </span>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400">
                <Icon name="chevron" size={14} />
              </span>
            </div>
            <div className="w-44">
              <SubcategorySelect
                categories={categories}
                parentId={categoryFilter}
                value={subcategoryFilter}
                onChange={setSubcategoryFilter}
                emptyLabel="소분류 전체"
              />
            </div>
            <div className="relative">
              <select
                className={`${inputClass} w-40 appearance-none pr-9`}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
              >
                <option value="">전체 판매 상태</option>
                <option value="active">판매 중</option>
                <option value="inactive">판매 중지</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400">
                <Icon name="chevron" size={14} />
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-800">
              {filteredProducts.length}
            </span>
            개 상품
          </p>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={deleting || loading || selectedProducts.length === 0}
              onClick={() => void onDeleteSelected(selectedProducts)}
            >
              <Icon name="trash" size={15} />
              {deleting ? "삭제 중..." : `선택 삭제 (${selectedProducts.length})`}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-500">
            <tr>
              <th className="w-12 px-5 py-3.5">
                <input
                  aria-label="표시된 상품 전체 선택"
                  className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                  type="checkbox"
                  checked={allSelected}
                  ref={(element) => { if (element) element.indeterminate = selectedProducts.length > 0 && !allSelected; }}
                  disabled={deleting || loading || filteredProducts.length === 0}
                  onChange={(event) => setSelectedIds(event.target.checked ? filteredProducts.map((product) => product.productId) : [])}
                />
              </th>
              <th className="px-3 py-3.5">상품 이미지</th>
              <th className="px-3 py-3.5">상품명</th>
              <th className="px-3 py-3.5">카테고리</th>
              <th className="px-3 py-3.5">판매가</th>
              <th className="px-3 py-3.5">재고</th>
              <th className="px-3 py-3.5">판매 상태</th>
              <th className="px-3 py-3.5">등록일</th>
              <th className="px-5 py-3.5 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr
                key={product.productId}
                className="border-b border-zinc-100 text-sm last:border-0"
              >
                <td className="px-5 py-3">
                  <input
                    aria-label={`${product.name} 선택`}
                    className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                    type="checkbox"
                    checked={selectedIds.includes(product.productId)}
                    disabled={deleting || loading}
                    onChange={(event) => toggleSelection(product.productId, event.target.checked)}
                  />
                </td>
                <td className="px-3 py-3">
                  <ProductImage
                    className="h-12 w-12 rounded-md object-cover"
                    src={product.thumbnailUrl}
                    alt={product.name}
                  />
                </td>
                <td className="px-3 py-3 font-semibold text-zinc-800">
                  <button
                    className="text-left hover:underline"
                    type="button"
                    onClick={() => onDetail(product)}
                  >
                    {product.name}
                  </button>
                </td>
                <td className="px-3 py-3">{productCategoryLabel(product, categories)}</td>
                <td className="px-3 py-3">
                  {new Intl.NumberFormat("ko-KR").format(product.basePrice)}원
                </td>
                <td className="px-3 py-3">{product.stockQuantity}</td>
                <td className="px-3 py-3">
                  {product.active ? "판매 중" : "판매 중지"}
                </td>
                <td className="px-3 py-3">
                  {formatProductDate(product.createdAt)}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                      type="button"
                      onClick={() => onEdit(product)}
                    >
                      수정
                    </button>
                    <button
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      type="button"
                      disabled={deleting || loading}
                      onClick={() => onDelete(product)}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <div
          className="px-6 py-12 text-center text-sm text-red-600"
          role="alert"
        >
          {error}
        </div>
      ) : loading ? (
        <div className="px-6 py-12 text-center text-sm text-zinc-500">
          상품 목록을 불러오는 중입니다.
        </div>
      ) : (
        filteredProducts.length === 0 && (
          <div className="flex min-h-[380px] flex-col items-center justify-center px-6 py-16 text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-50 text-zinc-400">
              <Icon name="box" size={35} strokeWidth={1.4} />
              <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-white bg-zinc-900 text-white">
                <Icon name="plus" size={13} strokeWidth={2.5} />
              </span>
            </div>
            <h3 className="text-base font-bold text-zinc-800">
              {products.length === 0
                ? "등록된 상품이 없습니다"
                : "조건에 맞는 상품이 없습니다"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
              {products.length === 0
                ? "Spring Boot API에 상품을 연결하면 이곳에서 목록을 확인하고 관리할 수 있습니다."
                : "선택한 카테고리와 판매 상태에 해당하는 상품이 없습니다."}
            </p>
            {products.length === 0 && (
              <button
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-950"
                type="button"
                onClick={onRegister}
              >
                <Icon name="plus" size={16} />첫 상품 등록하기
              </button>
            )}
          </div>
        )
      )}
      <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-4 text-xs text-zinc-400">
        <span>
          전체 {products.length}개 중 {filteredProducts.length}개 표시
        </span>
        <div className="flex items-center gap-2">
          <button
            className="h-8 rounded-md border border-zinc-200 px-3"
            disabled
          >
            이전
          </button>
          <button
            className="h-8 rounded-md border border-zinc-200 px-3"
            disabled
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailDialog({
  categories,
  product,
  onClose,
}: {
  categories: Category[];
  product: AdminProductRecord;
  onClose: () => void;
}) {
  const rows = [
    ["카테고리", productCategoryLabel(product, categories)],
    ["판매가", `${new Intl.NumberFormat("ko-KR").format(product.basePrice)}원`],
    ["재고", String(product.stockQuantity)],
    ["판매 상태", product.active ? "판매 중" : "판매 중지"],
    ["등록일", formatProductDate(product.createdAt)],
    ["상품 설명", product.description || "미입력"],
    ["배열 규격", product.layout || "미입력"],
    ["하우징 소재", product.housingMaterial || "미입력"],
    ["기판 지원 핀", product.supportPins || "미입력"],
    [
      "무선 지원",
      product.isWireless == null
        ? "미입력"
        : product.isWireless
          ? "지원"
          : "미지원",
    ],
    [
      "스위치 핀 수",
      product.switchPin == null ? "미입력" : `${product.switchPin}핀`,
    ],
    ["스위치 분류", product.switchType || "미입력"],
    ["키캡 소재", product.keycapMaterial || "미입력"],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="product-detail-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400">
              상품 상세 정보
            </p>
            <h2
              id="product-detail-title"
              className="mt-1 text-xl font-bold text-zinc-900"
            >
              {product.name}
            </h2>
          </div>
          <button
            aria-label="닫기"
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        {product.thumbnailUrl && (
          <img
            className="mb-5 h-40 w-40 rounded-xl border border-zinc-200 object-cover"
            src={product.thumbnailUrl}
            alt={product.name}
          />
        )}
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b border-zinc-100 py-3">
              <dt className="text-xs font-medium text-zinc-400">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export default function AdminDashboard({
  previewMode = false,
}: {
  previewMode?: boolean;
}) {
  const [view, setView] = useState<View>("register");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteInProgress = useRef(false);
  const [toast, setToast] = useState("");
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [editingProduct, setEditingProduct] = useState<AdminProductRecord>();
  const [detailProduct, setDetailProduct] = useState<AdminProductRecord>();
  const [listError, setListError] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryAttempt, setCategoryAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getCategories()
      .then((items) => {
        if (current) {
          setCategories(items.filter((category) => category.id !== "all"));
        }
      })
      .catch(() => {
        if (current) setCategoryError("카테고리를 불러오지 못했습니다.");
      });
    return () => {
      current = false;
    };
  }, [categoryAttempt]);

  useEffect(() => {
    if (view !== "list") return;
    let current = true;
    setLoadingProducts(true);
    setListError("");
    getAdminProducts()
      .then((items) => {
        if (current) setProducts(items);
      })
      .catch((error: unknown) => {
        if (current)
          setListError(
            error instanceof Error
              ? error.message
              : "상품 목록을 불러올 수 없습니다.",
          );
      })
      .finally(() => {
        if (current) setLoadingProducts(false);
      });
    return () => {
      current = false;
    };
  }, [view]);

  const navigate = (next: View) => {
    setView(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 4200);
  };

  const completeForm = (message: string) => {
    showToast(message);
    if (view === "edit") navigate("list");
  };

  const showProductDetails = async (product: AdminProductRecord) => {
    try {
      setDetailProduct(await getAdminProduct(String(product.productId)));
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "상품 상세 정보를 불러올 수 없습니다.",
      );
    }
  };

  const deleteProducts = async (targets: AdminProductRecord[]) => {
    if (targets.length === 0 || deleteInProgress.current) return;
    const names = targets.map((product) => product.name).join(", ");
    if (!window.confirm(
      `${targets.length}개 상품을 정말 삭제하시겠습니까?\n${names}\n삭제 후에는 상품목록에서 볼 수 없으며, 관리자 화면에서 복구할 수 없습니다.`,
    )) return;

    deleteInProgress.current = true;
    setDeleting(true);
    let deletedCount = 0;
    let missingCount = 0;
    const removedIds = new Set<number>();
    const failures: string[] = [];
    try {
      // 기존 단건 API를 사용하며 각 상품의 처리 결과를 따로 기록합니다.
      for (const product of targets) {
        try {
          await deleteAdminProduct(String(product.productId));
          deletedCount++;
          removedIds.add(product.productId);
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 404) {
            missingCount++;
            removedIds.add(product.productId);
          } else {
            failures.push(`${product.name}: ${error instanceof Error ? error.message : "삭제 실패"}`);
          }
        }
      }
      setProducts((current) => current.filter((product) => !removedIds.has(product.productId)));
      const results = [`${deletedCount}개 삭제 완료`];
      if (missingCount) results.push(`${missingCount}개는 이미 삭제되었거나 없는 상품입니다`);
      if (failures.length) results.push(`${failures.length}개 처리 실패 또는 결과 미확인 — ${failures.join(" / ")}`);
      try {
        setProducts(await getAdminProducts());
        setListError("");
      } catch {
        results.push("목록을 새로 불러오지 못했습니다. 새로고침해 주세요");
      }
      showToast(results.join(". "));
    } finally {
      deleteInProgress.current = false;
      setDeleting(false);
    }
  };

  const pageTitle =
    view === "register"
      ? "상품 등록"
      : view === "list"
        ? "상품 목록"
        : "상품 수정";
  const pageDescription =
    view === "register"
      ? "새 상품을 등록하고 판매 정보를 설정해 주세요."
      : view === "list"
        ? "등록된 상품을 검색하고 관리해 주세요."
        : "선택한 상품의 정보를 수정해 주세요.";

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-800">
      {sidebarOpen && (
        <button
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-30 bg-zinc-950/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-zinc-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[72px] items-center border-b border-zinc-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-[0_5px_14px_rgba(0,0,0,0.12)]">
            <Icon name="box" size={20} strokeWidth={2} />
          </div>
          <div className="ml-3">
            <div className="text-[15px] font-extrabold tracking-[-0.03em] text-zinc-900">
              MONO / KEYS
            </div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              관리자 콘솔
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-6">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            상품 관리
          </p>
          {[
            {
              id: "register" as View,
              label: "상품 등록",
              icon: "plus" as IconName,
            },
            {
              id: "list" as View,
              label: "상품 목록",
              icon: "list" as IconName,
            },
          ].map((item) => {
            const active =
              view === item.id || (view === "edit" && item.id === "list");
            return (
              <button
                key={item.id}
                className={`mb-1 flex h-11 w-full items-center rounded-lg px-3 text-sm font-semibold transition ${
                  active
                    ? "bg-zinc-100 text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                }`}
                onClick={() => navigate(item.id)}
              >
                <span
                  className={`mr-3 ${active ? "text-zinc-900" : "text-zinc-400"}`}
                >
                  <Icon name={item.icon} size={18} />
                </span>
                {item.label}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-zinc-900" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="m-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
              <Icon name="user" size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-zinc-700">관리자</p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                상품 관리자
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-zinc-200 bg-white/95 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center">
            <button
              aria-label="메뉴 열기"
              className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
              <span>관리자</span>
              <Icon name="chevron" size={13} />
              <span className="font-medium text-zinc-600">상품</span>
              {view === "edit" && (
                <>
                  <Icon name="chevron" size={13} />
                  <span className="font-medium text-zinc-600">수정</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-700 sm:inline">
              {previewMode ? "미리보기" : "시스템 정상"}
            </span>
            <button
              aria-label="알림"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100"
            >
              <Icon name="bell" size={19} />
              <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-zinc-900 ring-2 ring-white" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-5 py-7 lg:px-8 lg:py-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-[-0.035em] text-zinc-950">
                {pageTitle}
              </h1>
              <p className="mt-1.5 text-sm text-zinc-500">{pageDescription}</p>
            </div>
            {view === "list" && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(0,0,0,0.1)] transition hover:bg-zinc-950"
                onClick={() => navigate("register")}
              >
                <Icon name="plus" size={16} />
                상품 등록
              </button>
            )}
          </div>

          {categoryError ? (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {categoryError}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setCategoryError("");
                  setCategoryAttempt((attempt) => attempt + 1);
                }}
              >
                다시 불러오기
              </button>
            </p>
          ) : categories.length === 0 && (
            <p role="status" className="mb-4 text-sm text-zinc-500">
              카테고리를 불러오는 중입니다.
            </p>
          )}

          {view === "list" ? (
            <ProductList
              categories={categories}
              products={products}
              loading={loadingProducts}
              error={listError}
              onEdit={(product) => {
                setEditingProduct(product);
                setView("edit");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onDetail={showProductDetails}
              onDelete={(product) => void deleteProducts([product])}
              onDeleteSelected={deleteProducts}
              deleting={deleting}
              onRegister={() => navigate("register")}
            />
          ) : view === "edit" && editingProduct ? (
            <EditProductForm
              categories={categories}
              key={editingProduct.productId}
              product={editingProduct}
              onCancel={() => navigate("list")}
              onComplete={(updated) => {
                setProducts((current) =>
                  current.map((item) =>
                    item.productId === updated.productId
                      ? { ...item, ...updated }
                      : item,
                  ),
                );
                setEditingProduct(undefined);
                showToast("상품 정보가 수정되었습니다.");
                navigate("list");
              }}
            />
          ) : (
            <ProductForm
              categories={categories}
              key="register"
              mode="register"
              onCancel={() => navigate("list")}
              onComplete={completeForm}
            />
          )}
        </main>
      </div>

      {detailProduct && (
        <ProductDetailDialog
          categories={categories}
          product={detailProduct}
          onClose={() => setDetailProduct(undefined)}
        />
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
            <Icon name="check" size={15} strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-800">
              입력 내용을 확인했습니다
            </p>
            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{toast}</p>
          </div>
          <button
            aria-label="알림 닫기"
            className="text-zinc-400"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
