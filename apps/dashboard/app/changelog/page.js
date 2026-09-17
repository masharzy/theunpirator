import { PublicPage } from "@/components/public-site";
const entries = [
  [
    "Plan-driven protection",
    "Protection controls now come from concrete plan entitlements instead of customer-selectable security levels.",
  ],
  [
    "Protected playback references",
    "Customer servers can register private source metadata and render a playbackRef without exposing provider credentials to the browser.",
  ],
  [
    "Customer console expansion",
    "Workspace visibility now covers sessions, devices, usage, security events, billing and integration tooling.",
  ],
];
export default function ChangelogPage() {
  return (
    <PublicPage
      eyebrow="CHANGELOG"
      title="Product updates."
      intro="A concise record of meaningful changes to the Unpirator platform."
      cta={false}
    >
      <section className="mx-auto max-w-4xl px-5 py-16 md:px-8 md:py-24">
        <div className="space-y-5">
          {entries.map(([title, body], i) => (
            <article key={title} className="rounded-[26px] border border-[#dce3d5] bg-white p-7">
              <p className="text-xs font-black uppercase tracking-[.16em] text-[#78944f]">
                Update {String(i + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-.03em]">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#687362]">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicPage>
  );
}
