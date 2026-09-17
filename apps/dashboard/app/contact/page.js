import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, ReceiptText, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

export const metadata = { title: "Contact | The Unpirator" };

const paths = [
  [ReceiptText, "Plans & pricing", "Compare the live public plans configured by the platform admin, including current features and limits.", "/pricing", "View pricing"],
  [BookOpen, "Integration help", "Start with the developer documentation for architecture, stack examples and playback flow.", "/docs", "Open docs"],
  [LifeBuoy, "Existing customers", "Use Support inside your workspace so your request stays connected to the correct account and tenant.", "/dashboard/support", "Open support"],
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f6f8f2] text-[#1c2519]">
      <PublicNav />
      <main>
        <section className="border-b border-[#dce3d5] bg-[#172014] text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[1fr_.85fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-[#b8ca98]">
                <ShieldCheck size={13} /> Contact
              </div>
              <h1 className="mt-7 text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl">
                Get to the right place without a fake inbox.
              </h1>
            </div>
            <p className="max-w-xl text-base leading-7 text-[#bbc5b6]">
              We route questions to the place that already has the right context instead of publishing a generic contact form that goes nowhere useful.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-5 md:grid-cols-3">
            {paths.map(([Icon, title, body, href, label]) => (
              <article key={title} className="group rounded-[28px] border border-[#dce3d5] bg-white p-7 shadow-[0_14px_45px_rgba(35,48,28,.05)]">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#e8efdc] text-[#617845]">
                  <Icon size={20} />
                </span>
                <h2 className="mt-8 text-2xl font-semibold tracking-[-.03em]">{title}</h2>
                <p className="mt-3 min-h-24 text-sm leading-6 text-[#687362]">{body}</p>
                <Link href={href} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#40512f]">
                  {label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[#dce3d5] bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-2 md:px-8 md:py-20">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#718054]">For faster support</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-.04em]">Bring the useful context.</h2>
            </div>
            <div className="grid gap-3 text-sm text-[#5f6a59] sm:grid-cols-2">
              {["Workspace / site", "Affected playbackRef", "Approximate time", "Browser / device", "Relevant error text", "Expected behavior"].map((item) => (
                <div key={item} className="rounded-xl bg-[#f3f6ee] px-4 py-3">{item}</div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
