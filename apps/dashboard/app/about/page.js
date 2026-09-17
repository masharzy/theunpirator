import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

export const metadata = { title: "About | The Unpirator" };

const principles = [
  "Your application remains the source of truth for users and access.",
  "Private media configuration stays on trusted servers.",
  "Protection is made of concrete runtime controls, not marketing labels.",
  "We describe browser limitations instead of pretending they do not exist.",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f6f8f2] text-[#1c2519]">
      <PublicNav />
      <main>
        <section className="border-b border-[#dce3d5]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
            <div className="grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d7dfcf] bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-[#708052]">
                  <Sparkles size={13} /> About
                </div>
                <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-7xl">
                  Private video should not quietly turn into a public URL.
                </h1>
              </div>
              <p className="max-w-xl text-base leading-7 text-[#667160] sm:text-lg">
                The Unpirator is being built around a simple boundary: your product decides who may
                watch, and protected playback should respect that decision all the way to delivery.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <article className="rounded-[32px] bg-[#172014] p-8 text-white sm:p-10">
              <ShieldCheck size={28} className="text-[#b7cf83]" />
              <p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-[#90a875]">
                What we are building
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
                Infrastructure between authorization and media delivery.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#bac5b5]">
                Developer tooling, a protected player, short-lived sessions, a media gateway and
                customer controls that fit around an existing product instead of replacing it.
              </p>
              <Link
                href="/features"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#dcebbd]"
              >
                Explore the product <ArrowRight size={15} />
              </Link>
            </article>

            <article className="rounded-[32px] border border-[#dce3d5] bg-white p-8 sm:p-10">
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#718054]">
                Design principles
              </p>
              <div className="mt-6 divide-y divide-[#e0e6da]">
                {principles.map((item) => (
                  <div key={item} className="flex gap-3 py-5 text-sm leading-6 text-[#596453]">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[#e8efdc] text-[#607742]">
                      <Check size={13} />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="border-y border-[#dce3d5] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                [
                  "Customer-owned access",
                  "We do not want your user database. Your backend remains responsible for authentication and entitlement decisions.",
                ],
                [
                  "Concrete plan entitlements",
                  "Features such as watermarking, device controls and concurrency rules are enabled by the purchased plan and enforced by backend runtime logic.",
                ],
                [
                  "Clear limits",
                  "Protected delivery can reduce casual redistribution and improve accountability, but it cannot make browser video physically impossible to record.",
                ],
              ].map(([title, body]) => (
                <div key={title} className="border-l-2 border-[#b9ca97] pl-5">
                  <h2 className="text-xl font-semibold tracking-[-.02em]">{title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#687362]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
