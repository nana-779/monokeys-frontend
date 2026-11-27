'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useCart } from '@/features/cart/cart-provider'
import { getCurrentUser } from '@/features/auth/api'
import { formatPrice } from '@/lib/store-shared'
import { failPaymentApi, submitOrderApi } from './api'
import { useTossWidgets } from '@/features/payments/use-toss-widgets'
import { renderPaymentWidgets } from '@/features/payments/order-widget-rendering'
import { paymentErrorMessage } from '@/features/payments/payment-request'
import { loadPostcode, postcodeError } from '@/features/user/postcode'
import Link from 'next/link'

const PART_TYPE_LABELS: Record<string, string> = {
  HOUSING: '하우징',
  PCB: '기판',
  SWITCH: '스위치',
  KEYCAP: '키캡',
}

export function CheckoutForm() {
  const { selectedItems } = useCart()
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [roadAddress, setRoadAddress] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [deliveryMemo, setDeliveryMemo] = useState('')
  const [widgetReady, setWidgetReady] = useState(false)
  const [postcodeMessage, setPostcodeMessage] = useState('')

  const postcodeDialog = useRef<HTMLDialogElement>(null)
  const postcodeHost = useRef<HTMLDivElement>(null)
  const postcodeSession = useRef<symbol | null>(null)
  const detailAddressInputRef = useRef<HTMLInputElement>(null)
  const defaultUserInfoRef = useRef<{
    email?: string | null
    name?: string | null
    phone?: string | null
    postalCode?: string | null
    roadAddress?: string | null
    detailAddress?: string | null
  } | null>(null)

  const tossWidgetsState = useTossWidgets()
  const { widgets } = tossWidgetsState

  // DB에 저장된 회원 정보(이름, 전화번호, 기본 배송지)를 기본값으로 불러옵니다.
  useEffect(() => {
    getCurrentUser().then(({ user }) => {
      if (user) {
        defaultUserInfoRef.current = {
          email: user.email || null,
          name: user.name || null,
          phone: user.phone || null,
          postalCode: user.postalCode || null,
          roadAddress: user.roadAddress || null,
          detailAddress: user.detailAddress || null,
        }
      }
      if (user?.email) setUserEmail(user.email)
      if (user?.name) setRecipientName(user.name)
      if (user?.phone) setPhone(user.phone)
      if (user?.postalCode) setPostalCode(user.postalCode)
      if (user?.roadAddress) setRoadAddress(user.roadAddress)
      if (user?.detailAddress) setDetailAddress(user.detailAddress)
    })
  }, [])

  const ensureUserInfo = async () => {
    if (defaultUserInfoRef.current) return defaultUserInfoRef.current
    try {
      const { user } = await getCurrentUser()
      if (user) {
        defaultUserInfoRef.current = {
          email: user.email || null,
          name: user.name || null,
          phone: user.phone || null,
          postalCode: user.postalCode || null,
          roadAddress: user.roadAddress || null,
          detailAddress: user.detailAddress || null,
        }
      }
    } catch {
      // ignore
    }
    return defaultUserInfoRef.current
  }

  const handleApplyDefaultEmail = async () => {
    const info = await ensureUserInfo()
    if (!info?.email) {
      alert('등록된 기본 이메일이 없습니다.')
      return
    }
    setUserEmail(info.email)
  }

  const handleApplyDefaultName = async () => {
    const info = await ensureUserInfo()
    if (!info?.name) {
      alert('등록된 기본 이름이 없습니다.')
      return
    }
    setRecipientName(info.name)
  }

  const handleApplyDefaultPhone = async () => {
    const info = await ensureUserInfo()
    if (!info?.phone) {
      alert('등록된 기본 전화번호가 없습니다.')
      return
    }
    setPhone(info.phone)
  }

  const handleApplyDefaultAddress = async () => {
    const info = await ensureUserInfo()
    if (!info || (!info.postalCode && !info.roadAddress && !info.detailAddress)) {
      alert('등록된 기본 배송지가 없습니다.')
      return
    }
    if (info.postalCode) setPostalCode(info.postalCode)
    if (info.roadAddress) setRoadAddress(info.roadAddress)
    if (info.detailAddress) setDetailAddress(info.detailAddress)
  }

  const subtotal = selectedItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
  const shipping = selectedItems.reduce((total, item) => total + item.shippingFee, 0)
  const totalAmount = subtotal + shipping

  useEffect(() => {
    if (!widgets || totalAmount <= 0) return
    let active = true

    // 위젯에 결제 금액 설정
    void widgets.setAmount({ currency: 'KRW', value: totalAmount })

    const rendering = renderPaymentWidgets(widgets, {
      payment: '#toss-payment-method',
      agreement: '#toss-agreement',
    })

    rendering.ready.then(
      () => {
        if (active) setWidgetReady(true)
      },
      () => {
        if (active) setWidgetReady(false)
      },
    )

    return () => {
      active = false
      void rendering.dispose().catch(() => {})
    }
  }, [widgets, totalAmount])

  // 우편번호 및 도로명 주소 검색 모달 열기/닫기
  const closeAddressSearch = () => {
    postcodeSession.current = null
    const dialog = postcodeDialog.current
    if (dialog?.open) dialog.close()
    if (postcodeHost.current) postcodeHost.current.innerHTML = ''
    setPostcodeMessage('')
  }

  const openAddressSearch = async () => {
    const dialog = postcodeDialog.current
    const host = postcodeHost.current
    if (!dialog || !host) return

    const session = Symbol('postcode')
    postcodeSession.current = session
    host.innerHTML = ''

    const isCurrent = () => dialog.isConnected && dialog.open && postcodeSession.current === session
    dialog.showModal()
    setPostcodeMessage('주소 검색을 불러오는 중입니다.')

    try {
      const Postcode = await loadPostcode()
      if (!isCurrent()) return
      setPostcodeMessage('')
      new Postcode({
        width: '100%',
        height: '100%',
        minWidth: 240,
        oncomplete({ zonecode, roadAddress: selectedRoadAddress }) {
          if (!isCurrent()) return
          if (!zonecode || !selectedRoadAddress) {
            setPostcodeMessage('도로명 주소가 포함된 검색 결과를 선택해 주세요.')
            return
          }
          setPostalCode(zonecode)
          setRoadAddress(selectedRoadAddress)
          setDetailAddress('')
          closeAddressSearch()
          setTimeout(() => {
            detailAddressInputRef.current?.focus()
          }, 50)
        },
      }).embed(host, { autoClose: false })
    } catch {
      if (isCurrent()) setPostcodeMessage(postcodeError)
    }
  }

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedItems.length || isSubmitting) return

    setIsSubmitting(true)
    setMessage('')

    const cleanRecipientName = recipientName.trim()
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const cleanEmail = userEmail.trim()
    const cleanRoadAddress = roadAddress.trim()
    const cleanDetailAddress = detailAddress.trim()

    if (!cleanEmail) {
      setMessage('주문자 이메일을 입력해 주세요.')
      setIsSubmitting(false)
      return
    }

    if (!cleanRecipientName) {
      setMessage('받는 분 이름을 입력해 주세요.')
      setIsSubmitting(false)
      return
    }

    if (cleanPhone.length < 10) {
      setMessage('올바른 전화번호를 입력해 주세요. (10~11자리 숫자)')
      setIsSubmitting(false)
      return
    }

    if (!cleanRoadAddress) {
      setMessage('배송지 주소를 검색하여 입력해 주세요.')
      setIsSubmitting(false)
      return
    }

    if (!cleanDetailAddress) {
      setMessage('상세 주소를 입력해 주세요.')
      setIsSubmitting(false)
      detailAddressInputRef.current?.focus()
      return
    }

    let createdOrderNumber: string | null = null
    try {
      const items = selectedItems.map((item) => ({
        cartItemId: item.cartItemId,
        productId: item.productId && !item.manualBuildId && !item.autoBuildId ? Number(item.productId) : undefined,
        manualBuildId: item.manualBuildId,
        autoBuildId: item.autoBuildId,
        customDesignData: item.customDesignData,
        quantity: item.quantity,
      }))

      // 1. 백엔드에 PENDING(결제 대기) 상태로 주문서 생성 (배송지 정보 포함)
      const result = await submitOrderApi({
        ordererEmail: cleanEmail,
        ordererName: cleanRecipientName,
        ordererPhone: cleanPhone,
        recipientName: cleanRecipientName,
        recipientPhone: cleanPhone,
        postalCode: postalCode.trim(),
        roadAddress: cleanRoadAddress,
        detailAddress: cleanDetailAddress,
        deliveryMemo: deliveryMemo.trim(),
        items,
      })
      createdOrderNumber = result.orderNumber

      if (!widgets || !widgetReady) {
        setMessage('결제 위젯이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.')
        if (createdOrderNumber) {
          void failPaymentApi(createdOrderNumber, '결제 위젯 미준비')
        }
        setIsSubmitting(false)
        return
      }

      // 2. 토스페이먼츠 결제 요청 (결제 완료 시 successUrl, 실패/취소 시 failUrl로 이동)
      const firstItemName = selectedItems[0]?.name || '주문 상품'
      const orderName =
        selectedItems.length > 1
          ? `${firstItemName} 외 ${selectedItems.length - 1}건`
          : firstItemName

      await widgets.requestPayment({
        orderId: result.orderNumber,
        orderName,
        customerEmail: cleanEmail,
        customerName: cleanRecipientName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
      })
    } catch (err) {
      if (createdOrderNumber) {
        void failPaymentApi(createdOrderNumber, paymentErrorMessage(err))
      }
      setMessage(paymentErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (selectedItems.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm my-12">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <svg className="size-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900">주문할 상품이 없습니다</h2>
        <p className="mt-2 text-sm text-zinc-500">
          장바구니에서 주문할 상품을 먼저 선택해 주세요.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            쇼핑 계속하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submitOrder} className="grid grid-cols-[1fr_.75fr] gap-16 max-lg:grid-cols-1">
        <div>
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-zinc-500">CHECKOUT</p>
          <h1 className="mb-12 text-5xl font-medium tracking-[-0.06em]">
            Where should we send it?
          </h1>
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="ordererEmail" className="text-sm font-medium">
                  Orderer Email
                </label>
                <button
                  type="button"
                  onClick={handleApplyDefaultEmail}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
                >
                  기본 이메일 불러오기
                </button>
              </div>
              <input
                id="ordererEmail"
                className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                name="email"
                placeholder="User@Example.com"
                required
                type="email"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="recipientName" className="text-sm font-medium">
                  Recipient name
                </label>
                <button
                  type="button"
                  onClick={handleApplyDefaultName}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
                >
                  기본 수령인 불러오기
                </button>
              </div>
              <input
                id="recipientName"
                className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
                name="recipientName"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Name"
                required
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="phone" className="text-sm font-medium">
                  Phone number
                </label>
                <button
                  type="button"
                  onClick={handleApplyDefaultPhone}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
                >
                  기본 전화번호 불러오기
                </button>
              </div>
              <input
                id="phone"
                className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
                inputMode="tel"
                name="phone"
                required
                placeholder="010-0000-0000"
                value={[phone.slice(0, 3), phone.slice(3, 7), phone.slice(7)]
                  .filter(Boolean)
                  .join('-')}
                onChange={(event) =>
                  setPhone(event.target.value.replace(/[^0-9]/g, '').slice(0, 11))
                }
              />
            </div>

            {/* 배송지 주소 영역 (우편번호 검색 + 기본 주소 + 상세 주소 + 배송 메모) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="block text-sm font-medium">Shipping address</span>
                <button
                  type="button"
                  onClick={handleApplyDefaultAddress}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
                >
                  기본 배송지 불러오기
                </button>
              </div>

              <div className="flex gap-3">
                <input
                  className="h-14 w-36 rounded-md border border-zinc-300 bg-zinc-50 px-4 text-sm outline-none transition focus:border-black"
                  name="postalCode"
                  placeholder="우편번호"
                  readOnly
                  value={postalCode}
                  required
                />
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="h-14 shrink-0 rounded-md border border-zinc-300 bg-white px-5 text-sm font-medium transition hover:border-black hover:bg-zinc-50"
                >
                  우편번호 검색
                </button>
              </div>

              <input
                className="h-14 w-full cursor-pointer rounded-md border border-zinc-300 bg-zinc-50 px-4 text-sm outline-none transition focus:border-black"
                name="roadAddress"
                placeholder="기본 주소 (도로명 주소)"
                readOnly
                value={roadAddress}
                required
                onClick={openAddressSearch}
              />

              <input
                ref={detailAddressInputRef}
                className="h-14 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-black"
                name="detailAddress"
                placeholder="상세 주소를 입력해 주세요 (동·호수 등)"
                value={detailAddress}
                onChange={(e) => setDetailAddress(e.target.value)}
                required
              />

              <input
                className="h-14 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-black"
                name="deliveryMemo"
                placeholder="배송 요청사항을 입력해 주세요 (선택)"
                value={deliveryMemo}
                onChange={(e) => setDeliveryMemo(e.target.value)}
              />
            </div>
          </div>

          {/* 토스페이먼츠 결제 위젯 영역 */}
          <div className="mt-10 rounded-xl border border-zinc-200 p-6">
            <h2 className="mb-4 text-lg font-medium">결제 수단 선택</h2>
            {tossWidgetsState.status === 'error' && (
              <p className="mb-4 text-sm text-red-600">{tossWidgetsState.message}</p>
            )}
            <div id="toss-payment-method" />
            <div id="toss-agreement" />
          </div>
        </div>

        <aside className="h-fit rounded-xl bg-zinc-100 p-7 lg:sticky lg:top-28">
          <h2 className="text-xl font-medium tracking-[-0.03em]">Order summary</h2>
          <div className="my-6 divide-y divide-zinc-200 border-y border-zinc-200">
            {selectedItems.map((item, index) => (
              <CheckoutOrderItem
                key={item.cartItemId ?? `${item.productId}-${index}`}
                item={item}
              />
            ))}
            {!selectedItems.length && (
              <p className="py-8 text-center text-sm text-zinc-500">
                선택된 상품이 없습니다. 장바구니에서 주문할 상품을 선택해 주세요.
              </p>
            )}
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Shipping</dt>
              <dd>{formatPrice(shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-300 pt-4 text-lg">
              <dt>Total</dt>
              <dd className="font-semibold">{formatPrice(totalAmount)}</dd>
            </div>
          </dl>
          {message && (
            <p className="mt-5 text-sm text-red-600" role="alert">
              {message}
            </p>
          )}
          <button
            className="mt-7 h-14 w-full rounded-md bg-black text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!selectedItems.length || isSubmitting || !widgetReady}
            type="submit"
          >
            {isSubmitting ? 'PROCESSING...' : `${formatPrice(totalAmount)} 결제하기`}
          </button>
        </aside>
      </form>

      {/* 카카오 다음 우편번호 검색 팝업 다이얼로그 */}
      <dialog
        ref={postcodeDialog}
        onCancel={closeAddressSearch}
        className="m-auto w-[min(92%,500px)] rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl backdrop:bg-black/50"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">우편번호 및 도로명 주소 검색</h2>
          <button
            type="button"
            onClick={closeAddressSearch}
            className="text-2xl leading-none text-zinc-400 hover:text-black"
            aria-label="닫기"
          >
            &times;
          </button>
        </div>
        {postcodeMessage && <p className="mb-3 text-sm text-zinc-500">{postcodeMessage}</p>}
        <div ref={postcodeHost} className="h-[420px] w-full" />
      </dialog>
    </>
  )
}

function CheckoutOrderItem({ item }: { item: (typeof useCart extends () => { selectedItems: (infer T)[] } ? T : any) }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isBuild = Boolean(item.manualBuildId || item.autoBuildId || item.buildType);
  const isCustomKeycap = Boolean(!isBuild && item.customDesignData);
  const isAutoBuild = item.buildType === 'AUTO' || Boolean(item.autoBuildId);
  const partDetails = item.partDetails ?? [];
  return (
    <div className="py-4 text-sm">
      <div className="flex items-start gap-4">
        {/* 1. 상품 썸네일 이미지 */}
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="size-16 shrink-0 rounded-md border border-zinc-200 object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-[10px] text-zinc-400">
            NO IMG
          </div>
        )}
        {/* 2. 상품 정보 및 배지 */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isBuild ? (
              <>
                <span className="inline-flex items-center rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                  커스텀 키보드
                </span>
                <span className="inline-flex items-center rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                  {isAutoBuild ? '자동 추천' : '수동 조립'}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {item.includeAssembly ? '조립 대행' : '직접 조립'}
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
          <p className="truncate font-medium text-zinc-900">{item.name}</p>
          <p className="text-xs text-zinc-500">수량: {item.quantity}개</p>
          {item.optionLabel && (
            <p className="truncate text-xs text-zinc-400">{item.optionLabel}</p>
          )}
          {/* ⭐️ 장바구니와 동일한 구성품 보기 토글 버튼 */}
          {isBuild && (
            <div className="pt-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 transition hover:text-zinc-950"
                onClick={() => setDetailsOpen((prev) => !prev)}
              >
                <span>{detailsOpen ? '구성품 접기' : `구성품 보기 (${partDetails.length || 4}종)`}</span>
                <span className="text-[10px]">{detailsOpen ? '▴' : '▾'}</span>
              </button>
            </div>
          )}
        </div>
        {/* 3. 가격 */}
        <strong className="shrink-0 text-sm font-semibold">
          {formatPrice(item.unitPrice * item.quantity)}
        </strong>
      </div>
      {/* ⭐️ [장바구니와 동일한 부품 상세 아코디언 박스] */}
      {detailsOpen && isBuild && (
        <div className="mt-3 ml-20 space-y-1.5 rounded-md border border-zinc-200 bg-white p-2.5 text-xs">
          {partDetails.length > 0 ? (
            partDetails.map((part: any) => (
              <div
                key={`${part.partType}-${part.productId}`}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    {PART_TYPE_LABELS[part.partType] || part.partType}
                  </span>
                  <span className="truncate text-zinc-800" title={part.name}>
                    {part.name}
                  </span>
                </div>
                <span className="shrink-0 font-medium text-zinc-600">
                  {formatPrice(part.unitPrice)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-zinc-500">선택 부품 4종 조합</p>
          )}
          <div className="flex items-center justify-between border-t border-dashed border-zinc-200 pt-1.5 text-[11px] text-zinc-500">
            <span>조립 공임비</span>
            <span className="font-medium text-zinc-700">
              {item.includeAssembly ? '+20,000원 (조립 대행)' : '0원 (직접 조립)'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}