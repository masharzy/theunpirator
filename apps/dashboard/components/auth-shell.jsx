import Link from "next/link";
import { ArrowUpRight, Check, Fingerprint, LockKeyhole, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

const points = [
  "Private sources stay server-side",
  "Short-lived playback sessions",
  "Plan-driven protection controls",
];

export function AuthShell({ mode = "login", title, intro, children }) {
  const registering = mode === "register";
  return (
    <div className="min-h-screen bg-[#eef1e8] text-[#182015]">
      <PublicNav />
      <main className="relative isolate min-h-[calc(100vh-72px)] overflow-hidden px-4 py-6 sm:px-6 md:py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_14%,rgba(190,214,145,.4),transparent_24%),radial-gradient(circle_at_88%_84%,rgba(71,91,57,.13),transparent_28%)]" />
        <div className="mx-auto grid min-h-[720px] max-w-6xl overflow-hidden rounded-[34px] border border-[#cfd7c6] bg-white shadow-[0_30px_90px_rgba(33,45,27,.16)] lg:grid-cols-[.95fr_1.05fr]">
          <section className="relative hidden overflow-hidden bg-[#172014] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-24 -top-24 size-72 rounded-full border border-white/10" />
            <div className="absolute -right-10 top-16 size-48 rounded-full border border-[#a9c274]/20" />
            <div className="absolute bottom-20 left-12 size-36 rounded-full bg-[#9db36f]/10 blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-[#b9ca9b]">
                <ShieldCheck size={14} /> Protected playback control plane
              </div>
              <h1 className="mt-8 max-w-md text-4xl font-semibold leading-[1.03] tracking-[-.045em]">
                {registering ? "Build the boundary before you press play." : "Your media controls, in one place."}
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-[#b7c1b1]">
                {registering
                  ? "Create the workspace that connects your application, viewers and protected media delivery."
                  : "Manage sites, sessions, viewers, devices, usage and the protection features included in your plan."}
              </p>

              <div className="mt-9 space-y-3">
                {points.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-[#dfe6db]">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#dcebbd] text-[#223018]">
                      <Check size={15} strokeWidth={2.4} />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative rounded-[26px] border border-white/10 bg-[#202b1d] p-5 shadow-2xl">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.16em] text-[#89987f]">
                <span>Playback session</span>
                <span className="flex items-center gap-1.5 text-[#b7d47e]"><span className="size-1.5 rounded-full bg-[#a9ca6a]" /> live</span>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-5">
                <div>
                  <div className="h-2.5 w-3/4 rounded-full bg-white/10" />
                  <div className="mt-2 h-2 w-1/2 rounded-full bg-white/5" />
                </div>
                <div className="grid size-12 place-items-center rounded-2xl border border-[#91aa64]/25 bg-[#91aa64]/10 text-[#cfe4a6]">
                  <LockKeyhole size={21} />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {["viewer", "device", "session"].map((label, index) => (
                  <div key={label} className="rounded-xl border border-white/5 bg-white/[.035] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-[.14em] text-[#76816f]">{label}</div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#d8dfd4]">
                      {index === 1 ? <Fingerprint size={12} /> : <ShieldCheck size={12} />}
                      verified
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="relative flex items-center justify-center bg-[linear-gradient(180deg,#fbfcf8_0%,#f5f7f0_100%)] p-5 sm:p-10 lg:p-14">
            <div className="w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#d5ddcb] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-[#718054] shadow-sm">
                  <ShieldCheck size={13} /> protected workspace
                </span>
              </div>
              <div className="mb-8">
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#77865e]">
                  {registering ? "Create workspace" : "Welcome back"}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#182015] sm:text-4xl">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#687261]">{intro}</p>
              </div>

              <div className="rounded-[26px] border border-[#dbe1d4] bg-white p-5 shadow-[0_18px_55px_rgba(35,48,28,.08)] sm:p-7">
                {children}
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 text-xs text-[#6f7969]">
                <span>{registering ? "Already have a workspace?" : "New to Unpirator?"}</span>
                <Link
                  href={registering ? "/login" : "/register"}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#26351f] hover:text-[#5f7642]"
                >
                  {registering ? "Sign in" : "Create one"} <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
