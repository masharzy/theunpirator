import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

export function NotFoundView() {
  return (
    <main className="min-h-screen bg-white px-6 text-[#20251d]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center py-20">
        <section className="w-full max-w-xl text-center">
          <Link
            href="/"
            className="mx-auto inline-flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[#2b3028]"
          >
            <span className="grid size-8 place-items-center rounded-lg border border-[#dfe3dc] bg-[#fafbf8] text-xs font-bold">
              U
            </span>
            The Unpirator
          </Link>

          <p className="mt-12 text-sm font-semibold tracking-[0.18em] text-[#8a9185]">404</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Page not found
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-[#70776c]">
            The page you’re looking for doesn’t exist, may have moved, or isn’t available to you.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#20251d] px-5 text-sm font-semibold text-white transition hover:bg-[#30362d]"
            >
              <Home size={16} />
              Go home
            </Link>
            <button
              type="button"
              onClick={undefined}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <Link
              href="/docs"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dfe3dc] bg-white px-5 text-sm font-semibold text-[#343a31] transition hover:bg-[#f8f9f6]"
            >
              <ArrowLeft size={16} />
              View docs
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
