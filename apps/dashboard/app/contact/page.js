import Link from "next/link";
import { PublicPage } from "@/components/public-site";
const options = [
  [
    "Sales & plan questions",
    "Review live plan pricing and create a workspace when you're ready.",
    "/pricing",
    "View pricing",
  ],
  [
    "Integration help",
    "Start with the implementation guide and stack-specific examples.",
    "/docs",
    "Open docs",
  ],
  [
    "Existing customers",
    "Use Support inside your workspace so the request stays connected to the correct account.",
    "/dashboard/support",
    "Open support",
  ],
];
export default function ContactPage() {
  return (
    <PublicPage
      eyebrow="CONTACT"
      title="Get to the right place quickly."
      intro="Choose the path that matches what you need. We do not publish a fake sales inbox just to fill a page."
      cta={false}
    >
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 md:grid-cols-3 md:px-8 md:py-24">
        {options.map(([title, body, href, label]) => (
          <article key={title} className="rounded-[28px] border border-[#dce3d5] bg-white p-7">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-3 min-h-20 text-sm leading-6 text-[#687362]">{body}</p>
            <Link
              className="mt-6 inline-flex rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
              href={href}
            >
              {label}
            </Link>
          </article>
        ))}
      </section>
    </PublicPage>
  );
}
