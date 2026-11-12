
'use client'

import { useContext, useState, type FormEvent } from 'react'
import { ProductCartContext } from '@/features/cart/components/CartContext'
import { formatPrice } from '@/lib/store-shared'
import { ProductType } from '@/features/cart/interface/Product'

export function CheckoutForm() {
  const { products } = useContext(ProductCartContext)
  const [message, setMessage] = useState('')

  // 상품 가격 + 옵션 추가 금액을 기준으로 소계 계산
  const subtotal = products.reduce(
    (total : number, cartProduct : ProductType) =>
      total + (cartProduct.price + cartProduct.additionalPrice) * cartProduct.quantity,
    0
  )

  // 현재 배송비 정책이 정해지지 않았으므로 우선 0원으로 처리
  const shipping = 0

  const total = subtotal + shipping

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!products.length) {
      setMessage('주문할 상품이 없습니다.')
      return
    }

    const formData = new FormData(event.currentTarget)

    const orderData = {
      products: products.map((cartProduct : ProductType) => ({
        productId: cartProduct.productId,
        name: cartProduct.name,
        price: cartProduct.price,
        additionalPrice: cartProduct.additionalPrice,
        quantity: cartProduct.quantity,
        customBuildId: cartProduct.customBuildId,
        includeAssembly: cartProduct.includeAssembly,
      })),
      shippingInfo: {
        recipientName: formData.get('recipientName'),
        phone: formData.get('phone'),
        shippingAddress: formData.get('shippingAddress'),
      },
      subtotal,
      shipping,
      total,
    }

    // TODO: 주문 API에 orderData 전달
    console.log('주문 데이터:', orderData)

    setMessage('주문 API가 아직 연결되지 않았습니다.')
  }

  return (
    <form
      onSubmit={submitOrder}
      className="grid grid-cols-[1fr_.75fr] gap-16 max-lg:grid-cols-1"
    >
      <div>
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-zinc-500">
          CHECKOUT
        </p>

        <h1 className="mb-12 text-5xl font-medium tracking-[-0.06em]">
          Where should we send it?
        </h1>

        <div className="space-y-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Recipient name
            </span>
            <input
              className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
              name="recipientName"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Phone number
            </span>
            <input
              className="h-14 w-full rounded-md border border-zinc-300 px-4 outline-none transition focus:border-black"
              inputMode="tel"
              name="phone"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Shipping address
            </span>
            <textarea
              className="min-h-32 w-full resize-none rounded-md border border-zinc-300 p-4 outline-none transition focus:border-black"
              name="shippingAddress"
              required
            />
          </label>
        </div>
      </div>

      <aside className="h-fit rounded-xl bg-zinc-100 p-7 lg:sticky lg:top-28">
        <h2 className="text-xl font-medium tracking-[-0.03em]">
          Order summary
        </h2>

        <div className="my-6 divide-y divide-zinc-200 border-y border-zinc-200">
          <div className="max-h-[360px] divide-y divide-zinc-200 overflow-y-auto pr-2">
            {products.map((cartProduct : ProductType) => {
              const itemPrice = cartProduct.price + cartProduct.additionalPrice

              return (
                <div
                  className="flex justify-between gap-5 py-4 text-sm"
                  key={`${cartProduct.productId}-${cartProduct.customBuildId}-${cartProduct.includeAssembly}`}
                >
                  <div className="flex gap-3">
                    <img
                      src={cartProduct.thumbnailUrl}
                      alt={cartProduct.name}
                      className="h-16 w-16 rounded-md object-cover"
                    />

                    <div>
                      <p className="font-medium">
                        {cartProduct.name} × {cartProduct.quantity}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {cartProduct.buildName}
                      </p>

                      {cartProduct.includeAssembly && (
                        <p className="mt-1 text-xs text-zinc-500">
                          조립 서비스 포함
                        </p>
                      )}
                    </div>
                  </div>

                  <strong>
                    {formatPrice(itemPrice * cartProduct.quantity)}
                  </strong>
                </div>
              )
            })}

            {!products.length && (
              <p className="py-8 text-center text-sm text-zinc-500">
                장바구니에 상품이 없습니다.
              </p>
            )}
          </div>
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
            <dd className="font-semibold">
              {formatPrice(total)}
            </dd>
          </div>
        </dl>

        {message && (
          <p className="mt-5 text-sm text-zinc-700" role="alert">
            {message}
          </p>
        )}

        <button
          className="mt-7 h-14 w-full rounded-md bg-black text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!products.length}
          type="submit"
        >
          PLACE ORDER
        </button>
      </aside>
    </form>
  )
}
