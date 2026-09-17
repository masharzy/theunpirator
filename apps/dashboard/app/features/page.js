import Link from "next/link";
import {
  ArrowRight,
  Check,
  Fingerprint,
  Gauge,
  Layers3,
  LockKeyhole,
  MonitorSmartphone,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

const capabilities = [
  [
    LockKeyhole,
    "Private source boundary",
    "Your storage credentials and private media source stay server-side.",
  ],
  [
    ShieldCheck,
    "Signed playback sessions",
    "Access is short-lived, scoped and revocable instead of a reusable public link.",
  ],
  [
    Fingerprint,
    "Viewer accountability",
    "When enabled by plan, device identity and watermarking make sharing easier to trace.",
  ],
  [
    MonitorSmartphone,
    "Device controls",
    "Track, limit, block or revoke devices when the purchased plan includes those controls.",
  ],
  [
    Gauge,
    "Concurrency limits",
    "Prevent uncontrolled simultaneous playback when concurrent stream control is enabled.",
  ],
  [
    Radio,
    "Playback visibility",
    "See active and recent sessions, usage and security events from one workspace.",
  ],
];

const flow = [
  [
    "01",
    "Your app loads the video",
    "Your own database remains the source of truth for content and access.",
  ],
  [
    "02",
    "Your server authorizes the viewer",
    "Authentication and entitlement checks happen in your application, not in the browser.",
  ],
  [
    "03",
    "Unpirator creates protected access",
    "The enabled plan features are applied to the playback session.",
  ],
  [
    "04",
    "The gateway delivers media",
    "The browser receives protected playback, not provider credentials or a permanent private source URL.",
  ],
];

export const metadata = { title: "Product | The Unpirator" };

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#f5f7f1] text-[#1b2418]">
      <PublicNav />
      <main>
        <section className="overflow-hidden border-b border-[#dce3d5] bg-[#162014] text-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.17em] text-[#b8ca98]">
                <Sparkles size={13} /> Product
              </div>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-7xl">
                One protected path from your app to the player.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#bdc8b7] sm:text-lg">
                Unpirator sits between your authorization decision and media delivery. Your app
                keeps control of users and content; the playback layer handles short-lived protected
                access.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#dcebbd] px-5 py-3 text-sm font-semibold text-[#1f2a19]"
                >
                  Read integration docs <ArrowRight size={16} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white"
                >
                  See plans
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-12 rounded-full bg-[#8daa5d]/10 blur-3xl" />
              <div className="relative rounded-[30px] border border-white/10 bg-[#202b1d] p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 text-[10px] font-bold uppercase tracking-[.17em] text-[#8d9987]">
                  <span>Protected playback path</span>
                  <span className="flex items-center gap-1.5 text-[#b7d47e]">
                    <span className="size-1.5 rounded-full bg-[#a7c66d]" /> active
                  </span>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    "Your application",
                    "Authorization boundary",
                    "Protected session",
                    "Media gateway",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-4"
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-[#dcebbd] text-xs font-black text-[#23301d]">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[#edf2e9]">{item}</div>
                        <div className="mt-1 h-1.5 w-2/3 rounded-full bg-white/7" />
                      </div>
                      {index < 3 ? (
                        <ArrowRight size={16} className="text-[#7f8d78]" />
                      ) : (
                        <ShieldCheck size={17} className="text-[#b9d583]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(([Icon, title, body]) => (
              <article key={title} className="border-t border-[#cfd8c7] pt-6">
                <div className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e8efdc] text-[#607742]">
                    <Icon size={19} />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold tracking-[-.02em]">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#697363]">{body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="flow" className="border-y border-[#dce3d5] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#718054]">
                  How it works
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
                  The browser is never the trust boundary.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-[#687362]">
                  The protected path starts from your own backend decision and stays server-led
                  until the media gateway authorizes delivery.
                </p>
              </div>
              <div className="divide-y divide-[#dfe5d9] border-y border-[#dfe5d9]">
                {flow.map(([n, title, body]) => (
                  <div key={n} className="grid gap-3 py-6 sm:grid-cols-[70px_1fr]">
                    <span className="font-mono text-sm text-[#8d987f]">{n}</span>
                    <div>
                      <h3 className="text-lg font-semibold">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#687362]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="use-cases" className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
          <div className="rounded-[34px] bg-[#e9efdf] p-6 sm:p-9 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#6b7d4e]">
                  Where it fits
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
                  Different products. Same boundary.
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Education platforms",
                  "Membership products",
                  "Premium communities",
                  "Internal training",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-4 text-sm font-semibold"
                  >
                    <Check className="size-4 text-[#708c4a]" /> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
