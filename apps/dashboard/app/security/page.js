import Link from "next/link";
import {
  ArrowRight,
  Check,
  EyeOff,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

const layers = [
  [
    KeyRound,
    "Secrets stay server-side",
    "Provider credentials, API keys and private source configuration do not belong in the browser.",
  ],
  [
    ShieldCheck,
    "Playback is short-lived",
    "Protected sessions are scoped and expire instead of becoming permanent reusable media links.",
  ],
  [
    Fingerprint,
    "Viewer identity is server-authoritative",
    "Protected playback binds the authenticated viewer email to a stable application device ID. Dynamic watermarking can display that trusted identity when the active plan enables it.",
  ],
  [
    Siren,
    "Access can be revoked",
    "When the active plan includes the control, sessions and devices can be blocked or revoked from the control plane.",
  ],
];

export const metadata = { title: "Security | The Unpirator" };

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#121811] text-white">
      <PublicNav />
      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#8ca85d]/10 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
            <div className="grid gap-12 lg:grid-cols-[1fr_.95fr] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-[#b9ca98]">
                  <LockKeyhole size={13} /> Security model
                </div>
                <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-7xl">
                  Security is not a label. It is the controls that actually run.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-[#b8c2b3] sm:text-lg">
                  There is no customer-facing Standard, Strict or Maximum mode. Authenticated viewer
                  email and stable device identity are baseline playback requirements; the purchased
                  plan decides which additional protection features are enabled.
                </p>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-[#1b2419] p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 text-[10px] font-black uppercase tracking-[.16em] text-[#879282]">
                  <span>Request boundary</span>
                  <span className="text-[#b3ce7f]">fail closed</span>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  {[
                    "viewer email resolved server-side",
                    "device identity present",
                    "session valid",
                    "origin allowed",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-2xl border border-white/7 bg-white/[.035] px-4 py-3.5"
                    >
                      <span className="text-[#dce3d8]">{item}</span>
                      <Check className="size-4 text-[#a9ca6f]" />
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#dcebbd] px-4 py-4 text-sm font-semibold text-[#24311d]">
                  <ShieldCheck size={18} /> protected media response
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f6f8f2] text-[#1d261a]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
            <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#718054]">
                  Protection layers
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.045em]">
                  Concrete controls, each with a job.
                </h2>
                <p className="mt-5 text-sm leading-7 text-[#687362]">
                  Admin enables plan features. Customers buy a plan. Runtime enforcement follows
                  those entitlements.
                </p>
              </div>
              <div className="divide-y divide-[#dce3d5] border-y border-[#dce3d5]">
                {layers.map(([Icon, title, body]) => (
                  <div key={title} className="grid gap-4 py-6 sm:grid-cols-[48px_1fr]">
                    <span className="grid size-10 place-items-center rounded-2xl bg-[#e7eedb] text-[#627944]">
                      <Icon size={18} />
                    </span>
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

        <section className="bg-white text-[#1d261a]">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-20 md:grid-cols-2 md:px-8 md:py-24">
            <article className="rounded-[30px] bg-[#172014] p-7 text-white sm:p-9">
              <EyeOff size={25} className="text-[#b8d080]" />
              <h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">What stays private</h2>
              <ul className="mt-6 space-y-3 text-sm text-[#c7d0c2]">
                {[
                  "Storage credentials",
                  "Provider secrets",
                  "Private source configuration",
                  "Secret API keys",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-4 text-[#a9c873]" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-[30px] border border-[#dce3d5] bg-[#f6f8f2] p-7 sm:p-9">
              <Siren size={25} className="text-[#6f884c]" />
              <h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">
                What we do not claim
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#65705f]">
                No browser system can guarantee prevention of every screen recording or capture
                method. Unpirator focuses on enforceable access control, short-lived delivery,
                accountability and reducing casual redistribution.
              </p>
              <Link
                href="/docs"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#40512f]"
              >
                Read the architecture <ArrowRight size={15} />
              </Link>
            </article>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
