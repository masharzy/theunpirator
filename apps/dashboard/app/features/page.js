import Link from "next/link";
import {
  ArrowRight,
  Check,
  Fingerprint,
  Gauge,
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
    "Provider credentials and private media sources stay on trusted servers instead of being exposed to the browser.",
  ],
  [
    ShieldCheck,
    "Signed playback sessions",
    "Access is short-lived, scoped and revocable instead of becoming a reusable public media link.",
  ],
  [
    Fingerprint,
    "Viewer accountability",
    "Protected playback always binds the authenticated viewer email to a stable application device ID; plan-enabled watermarking can display that trusted identity during playback.",
  ],
  [
    MonitorSmartphone,
    "Device controls",
    "Track, limit, block or revoke devices when the purchased plan includes those capabilities.",
  ],
  [
    Gauge,
    "Concurrency limits",
    "Control simultaneous playback when concurrent-stream enforcement is enabled for the customer plan.",
  ],
  [
    Radio,
    "Playback visibility",
    "Inspect active and recent sessions, usage and security events from the customer workspace.",
  ],
];

const flow = [
  [
    "01",
    "Your app loads the video",
    "Your database remains the source of truth for content and the viewer's entitlement to watch it.",
  ],
  [
    "02",
    "Your server authorizes the viewer",
    "Your backend authenticates the viewer, resolves their email from trusted server-side auth state and checks access before Unpirator creates playback.",
  ],
  [
    "03",
    "Unpirator creates protected access",
    "The concrete protection features enabled by the customer's plan are applied to the playback session.",
  ],
  [
    "04",
    "The gateway delivers media",
    "The browser receives short-lived protected playback instead of provider credentials or a permanent private source URL.",
  ],
];

export const metadata = { title: "Product | The Unpirator" };

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#171717]">
      <PublicNav />
      <main>
        <section className="overflow-hidden border-b border-[#e5e5e5] bg-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e2e2e2] bg-[#f7f7f5] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.17em] text-[#62675c]">
                <Sparkles size={13} /> Product
              </div>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.055em] text-[#171717] sm:text-6xl lg:text-7xl">
                One protected path from your app to the player.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#666] sm:text-lg">
                Unpirator sits between your authorization decision and media delivery. Your app
                keeps control of users and content; the playback layer handles short-lived protected
                access.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1d211b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#30362a]"
                >
                  Read integration docs <ArrowRight size={16} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center rounded-xl border border-[#d8d8d4] bg-white px-5 py-3 text-sm font-semibold text-[#262626] transition hover:bg-[#f5f5f2]"
                >
                  See plans
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-10 -z-10 rounded-full bg-[#eef1e9] blur-3xl" />
              <div className="relative rounded-[30px] border border-[#ddddda] bg-[#fbfbf9] p-5 shadow-[0_24px_70px_rgba(24,24,20,.08)]">
                <div className="flex items-center justify-between border-b border-[#e4e4df] pb-4 text-[10px] font-bold uppercase tracking-[.17em] text-[#76796f]">
                  <span>Protected playback path</span>
                  <span className="flex items-center gap-1.5 text-[#5d7043]">
                    <span className="size-1.5 rounded-full bg-[#789752]" /> active
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
                      className="flex items-center gap-3 rounded-2xl border border-[#e3e3df] bg-white p-4"
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-[#edf1e7] text-xs font-black text-[#4f6140]">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[#252525]">{item}</div>
                        <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-[#ecece8]" />
                      </div>
                      {index < 3 ? (
                        <ArrowRight size={16} className="text-[#9a9c94]" />
                      ) : (
                        <ShieldCheck size={17} className="text-[#718b4f]" />
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
              <article key={title} className="border-t border-[#ddddda] pt-6">
                <div className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#f0f2ec] text-[#66784e]">
                    <Icon size={19} />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold tracking-[-.02em]">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#6b6b68]">{body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="flow" className="border-y border-[#e3e3df] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#74786f]">
                  How it works
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">
                  The browser is never the trust boundary.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-[#686864]">
                  The protected path starts from your own backend decision and stays server-led
                  until the media gateway authorizes delivery.
                </p>
              </div>
              <div className="divide-y divide-[#e4e4e0] border-y border-[#e4e4e0]">
                {flow.map(([n, title, body]) => (
                  <div key={n} className="grid gap-3 py-6 sm:grid-cols-[70px_1fr]">
                    <span className="font-mono text-sm text-[#999b94]">{n}</span>
                    <div>
                      <h3 className="text-lg font-semibold">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#686864]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="use-cases" className="mx-auto max-w-7xl px-5 py-18 md:px-8 md:py-24">
          <div className="rounded-[34px] border border-[#e2e2de] bg-white p-6 shadow-[0_18px_60px_rgba(30,30,26,.05)] sm:p-9 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#74786f]">
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
                    className="flex items-center gap-3 rounded-2xl border border-[#e4e4e0] bg-[#fafaf8] px-4 py-4 text-sm font-semibold"
                  >
                    <Check className="size-4 text-[#6f874e]" /> {item}
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
