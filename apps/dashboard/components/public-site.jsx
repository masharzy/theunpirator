import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

export function PublicFooter() {
  const groups = [
    [
      "Product",
      [
        ["Features", "/features"],
        ["Pricing", "/pricing"],
        ["Integrations", "/integrations"],
        ["Security", "/security"],
      ],
    ],
    [
      "Company",
      [
        ["About", "/about"],
        ["Contact", "/contact"],
      ],
    ],
    [
      "Resources",
      [
        ["Documentation", "/docs"],
        ["Sign in", "/login"],
        ["Create account", "/register"],
      ],
    ],
    [
      "Legal",
      [
        ["Terms", "/terms"],
        ["Privacy", "/privacy"],
        ["Billing & refunds", "/refund-policy"],
        ["Acceptable use", "/acceptable-use"],
      ],
    ],
  ];

  return (
    <footer className="border-t border-[#dde4d5] bg-[#11180f] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.2fr_2fr] md:px-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-semibold">
            <span className="grid size-9 place-items-center rounded-xl bg-[#dcebbd] text-[#223018]">
              <ShieldCheck size={19} />
            </span>
            unpirator<span className="text-[#9ab46a]">.</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#b7c0b1]">
            Protected video delivery for products that need access control without exposing private
            media sources to the browser.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {groups.map(([title, links]) => (
            <div key={title}>
              <h3 className="text-xs font-bold uppercase tracking-[.16em] text-[#8ea17f]">{title}</h3>
              <div className="mt-4 space-y-3">
                {links.map(([label, href]) => (
                  <Link key={href} href={href} className="block text-sm text-[#dce3d8] hover:text-white">
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/10 px-5 py-5 text-xs text-[#8f9a89] sm:flex-row sm:items-center sm:justify-between md:px-8">
        <span>© {new Date().getFullYear()} The Unpirator</span>
        <span>Good content deserves good boundaries.</span>
      </div>
    </footer>
  );
}

export function PublicPage({ eyebrow, title, intro, sections = [], children, cta = true }) {
  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#20291d]">
      <PublicNav />
      <main>
        <section className="border-b border-[#dde4d5] bg-[radial-gradient(circle_at_top_right,#e7efd8,transparent_36%),#f7f8f3]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#718054]">{eyebrow}</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-.045em] text-[#172014] sm:text-6xl lg:text-7xl">
              {title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#65705f] sm:text-lg">{intro}</p>
          </div>
        </section>

        {children}

        {sections.length > 0 && (
          <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {sections.map((section) => (
                <article
                  key={section.title}
                  className="rounded-[28px] border border-[#dce3d5] bg-white p-7 shadow-[0_14px_50px_rgba(36,49,29,.05)]"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-[#edf4df] text-[#607742]">
                    <Check size={17} />
                  </span>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-.02em] text-[#20291d]">{section.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#687362]">{section.body}</p>
                  {section.items?.length > 0 && (
                    <ul className="mt-5 space-y-2 text-sm text-[#4d5948]">
                      {section.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#78944f]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {cta && (
          <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-28">
            <div className="rounded-[32px] bg-[#172014] px-7 py-10 text-white md:flex md:items-center md:justify-between md:px-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#a9bd83]">READY TO INTEGRATE?</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-.03em] sm:text-3xl">
                  Protect the next playback session.
                </h2>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 md:mt-0">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#dcebbd] px-5 py-3 text-sm font-semibold text-[#1e2919]"
                >
                  Get started <ArrowUpRight size={16} />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold"
                >
                  Read docs
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
