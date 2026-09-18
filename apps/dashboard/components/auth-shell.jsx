import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

const points = [
  "Private source URLs stay on your server",
  "Viewer access is authorized before playback",
  "Sessions stay short-lived and revocable",
];

export function AuthShell({ mode = "login", title, intro, children }) {
  const registering = mode === "register";

  return (
    <div
      className="min-h-screen bg-white text-[#20251d]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <PublicNav />
      <main className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-stretch lg:grid-cols-[.92fr_1.08fr]">
        <section className="hidden border-r border-[#e4e6e0] px-10 py-16 lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-20">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#646a5f]">
              <ShieldCheck size={16} className="text-[#6f873e]" />
              The Unpirator workspace
            </div>

            <h1 className="mt-8 max-w-lg text-[44px] font-semibold leading-[1.04] tracking-[-.05em] text-[#20251d] xl:text-[52px]">
              {registering
                ? "Set up protected playback without changing your product."
                : "Everything behind playback, without the noise."}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#666c62]">
              {registering
                ? "Create the workspace, connect your site, then follow the guided integration. Your application remains the source of truth for users and content."
                : "Open your workspace to manage sites, sessions, viewers, devices and the protection controls included in your plan."}
            </p>
          </div>

          <div className="mt-14 max-w-lg border-t border-[#e4e6e0] pt-7">
            <div className="space-y-4">
              {points.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm leading-6 text-[#535a50]">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full border border-[#cfd5c7] bg-white text-[#60783a]">
                    <Check size={12} strokeWidth={2.4} />
                  </span>
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-3 border-y border-[#e4e6e0] text-xs text-[#7a8076]">
              <div className="py-4 pr-4">
                <div className="font-semibold text-[#2b3028]">01</div>
                <div className="mt-1">Authorize</div>
              </div>
              <div className="border-x border-[#e4e6e0] px-4 py-4">
                <div className="font-semibold text-[#2b3028]">02</div>
                <div className="mt-1">Create session</div>
              </div>
              <div className="py-4 pl-4">
                <div className="font-semibold text-[#2b3028]">03</div>
                <div className="mt-1">Deliver</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-12 sm:px-8 lg:px-12 lg:py-16 xl:px-20">
          <div className="w-full max-w-[460px]">
            <div className="mb-9">
              <p className="text-sm font-medium text-[#6c7268]">
                {registering ? "Create workspace" : "Welcome back"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-.04em] text-[#20251d] sm:text-[38px]">
                {title}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#6b7167]">{intro}</p>
            </div>

            <div>{children}</div>

            <div className="mt-7 border-t border-[#e4e6e0] pt-6 text-sm text-[#6b7167]">
              <span>{registering ? "Already have a workspace? " : "New to Unpirator? "}</span>
              <Link
                href={registering ? "/login" : "/register"}
                className="inline-flex items-center gap-1 font-semibold text-[#20251d] hover:underline"
              >
                {registering ? "Sign in" : "Create one"} <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
