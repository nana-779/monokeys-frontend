export default function ProductDetailLoading() {
    return (
        <section className="mx-auto w-[min(80%,1440px)] py-10 max-lg:w-[92%]">
            <div className="grid grid-cols-[1.25fr_.75fr] gap-16 max-lg:grid-cols-1">
                <div className="aspect-square animate-pulse rounded-xl bg-zinc-100" />
                <div className="space-y-6">
                    <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
                    <div className="h-10 w-3/4 animate-pulse rounded bg-zinc-100" />
                    <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
                    <div className="h-24 w-full animate-pulse rounded bg-zinc-100" />
                    <div className="h-14 w-full animate-pulse rounded-md bg-zinc-200" />
                </div>
            </div>
        </section>
    )
}