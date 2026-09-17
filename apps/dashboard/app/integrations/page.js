import Link from "next/link";
import { ArrowRight, Braces, Check, Code2, Database, Server, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

const stacks = [
  "Next.js",
  "React",
  "Node / Express",
  "Laravel",
  "PHP",
  "Django",
  "Flask",
  "HTML + backend",
];

export const metadata = { title: "Integrations | The Unpirator" };

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-[#0f1510] text-white">
      <PublicNav />
      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.17em] text-[#b9ca98]">
                <Braces size={13} /> Integrations
              </div>
              <h1 className="mt-6 text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl">
                Keep your stack. Keep the security boundary.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#b9c3b5]">
                Unpirator fits around the backend you already trust. Your server authenticates the
                viewer, checks access and talks to Unpirator. The browser gets only what it needs to
                play.
              </p>
              <Link
                href="/docs"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#dcebbd] px-5 py-3 text-sm font-semibold text-[#1e2919]"
              >
                Open the integration guide <ArrowRight size={16} />
              </Link>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#171f17] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-xs text-[#889584]">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8da85f]" /> protected-playback-flow
                </span>
                <Code2 size={15} />
              </div>
              <div className="grid gap-px bg-white/5 sm:grid-cols-3">
                {[
                  [Database, "Your app", "Loads content + viewer access"],
                  [Server, "Your server", "Authorizes and adds trusted identity"],
                  [ShieldCheck, "Unpirator", "Creates protected playback"],
                ].map(([Icon, title, body], index) => (
                  <div key={title} className="relative bg-[#171f17] p-5">
                    <Icon className="text-[#afca7c]" size={20} />
                    <div className="mt-4 text-sm font-semibold">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-[#899486]">{body}</div>
                    {index < 2 && (
                      <ArrowRight className="absolute -right-2 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-[#9bad7b] sm:block" />
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 p-5 font-mono text-xs leading-6 text-[#bdc8b7]">
                <div>
                  <span className="text-[#7d8a78]">browser →</span> playbackRef + device context
                </div>
                <div>
                  <span className="text-[#7d8a78]">server →</span> viewer identity + authorization
                </div>
                <div>
                  <span className="text-[#7d8a78]">gateway →</span> protected media delivery
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f6f8f2] text-[#1d261a]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#728157]">
                  Supported patterns
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-.045em]">
                  Use the framework you already deploy.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[#6a7464]">
                  Different syntax, same security boundary: secret keys and access decisions stay on
                  the server.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stacks.map((stack) => (
                  <div
                    key={stack}
                    className="rounded-2xl border border-[#d8dfd1] bg-white px-4 py-4 text-sm font-semibold shadow-[0_10px_30px_rgba(34,47,27,.04)]"
                  >
                    {stack}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white text-[#1d261a]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                [
                  "Server route",
                  "Create the playback endpoint inside your application so your existing auth/session model remains authoritative.",
                ],
                [
                  "Player mount",
                  "Render the playback reference into the player. The player can request bootstrap access without receiving your secret key.",
                ],
                [
                  "Operational hooks",
                  "Use webhooks, session data and plan-enabled controls where your product actually needs them.",
                ],
              ].map(([title, body], index) => (
                <article key={title} className="rounded-[26px] border border-[#dce3d5] p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#87917e]">0{index + 1}</span>
                    <Check className="size-4 text-[#75914f]" />
                  </div>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-.02em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#687362]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
