import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

export const metadata = { title: "Terms of Service | The Unpirator" };

const sections = [
  {
    id: "service",
    title: "1. The service",
    body: [
      "The Unpirator provides protected video-delivery infrastructure, including playback-session creation, media gateway delivery, viewer and device controls, watermarking, usage reporting, security events, integrations and related account tools. The exact capabilities available to a workspace depend on the active plan and the features enabled for that plan.",
      "The Unpirator is a protection and access-control layer. It does not guarantee that media displayed on a viewer's device can never be copied, screen-recorded, photographed, captured or otherwise reproduced. No browser-based playback system can make that promise.",
    ],
  },
  {
    id: "eligibility",
    title: "2. Accounts and authority",
    body: [
      "You may use the service only if you have authority to create and operate the workspace and to bind the organization you represent. You are responsible for the accuracy of account and billing information associated with your workspace.",
      "You are responsible for safeguarding passwords, API keys, provider credentials, recovery codes and other authentication material. Do not place secret API keys or provider credentials in browser code or other publicly accessible locations. You must notify us promptly if you believe a workspace or credential has been compromised.",
    ],
  },
  {
    id: "customer-content",
    title: "3. Customer content and media sources",
    body: [
      "You retain ownership of the videos, metadata, application data and other content you connect to the service. You must have all rights, licenses and permissions required to store, process, protect and deliver that content to your viewers.",
      "For supported integrations, your server may send media source information and provider configuration to The Unpirator so that protected playback can be created. Private source information is intended for server-to-server processing and must not be intentionally exposed through client-side integration code. You grant The Unpirator the limited rights necessary to process that information solely to provide, secure, troubleshoot and operate the service.",
      "You must not use the service to distribute content that you do not have the right to distribute, to bypass another service's access controls, or to facilitate infringement, fraud or unlawful access.",
    ],
  },
  {
    id: "viewers",
    title: "4. Viewers, devices and authorization",
    body: [
      "Your application remains responsible for authenticating viewers and deciding whether a viewer is entitled to access a particular video. The Unpirator may enforce additional plan-enabled controls after your application authorizes playback, such as device requirements, device limits, concurrency limits, session revocation or watermarking.",
      "Where your integration sends viewer information, use a stable opaque external user identifier whenever possible. Human-readable labels such as an email address or name are optional unless a particular feature you choose to use requires them. You are responsible for ensuring that any viewer data you send is lawful and appropriate for your use case.",
    ],
  },
  {
    id: "plans",
    title: "5. Plans, features and limits",
    body: [
      "Features are controlled by plan entitlements. A customer cannot enable a feature that is not included in the active plan. Limits may include sites, assets, API keys, webhooks, devices, concurrent streams, playback sessions, requests, bandwidth, playback minutes, retention periods or other resource limits shown in the product or order flow.",
      "We may introduce, rename, improve, replace or retire features as the service develops. We will not represent a feature as included in a plan when it is not enabled for that plan. Material changes to paid plan pricing or included allowances apply according to the applicable billing terms or renewal cycle presented to you.",
    ],
  },
  {
    id: "billing",
    title: "6. Billing and payments",
    body: [
      "Paid access is billed according to the price, billing interval, currency and limits shown when you subscribe or when an administrator assigns a plan. Taxes, payment-provider charges or other legally required amounts may be added where applicable.",
      "Unless a separate written agreement says otherwise, fees already paid are handled under the refund policy available on this site. Failure to pay amounts when due may result in restricted features, suspension or termination after any applicable notice or grace period.",
    ],
  },
  {
    id: "acceptable-use",
    title: "7. Acceptable use",
    body: [
      "You may not probe, exploit or interfere with the service; defeat rate limits or security controls; use automated traffic to degrade availability; access another customer's workspace; distribute malware; use stolen credentials; or use the platform in connection with unlawful, deceptive or abusive activity.",
      "Security testing of systems you do not own or have permission to test is prohibited. Additional rules in the Acceptable Use Policy form part of these Terms.",
    ],
  },
  {
    id: "availability",
    title: "8. Availability, changes and beta features",
    body: [
      "We work to keep the service available and reliable, but uninterrupted operation is not guaranteed. Maintenance, provider outages, internet failures, upstream storage problems, software defects, abuse mitigation or events outside reasonable control may interrupt service.",
      "Features identified as preview, beta, experimental or restricted may change more quickly, may have additional limitations and may be suspended or removed if necessary for security, compliance or reliability.",
    ],
  },
  {
    id: "suspension",
    title: "9. Suspension and termination",
    body: [
      "We may suspend or limit a workspace when reasonably necessary to protect the service, other customers or third parties; investigate suspected compromise or abuse; comply with law; prevent material security risk; or address non-payment or a material breach of these Terms.",
      "You may stop using the service at any time and may cancel paid access through the available account or billing controls, subject to the applicable billing cycle. After termination, access to the workspace may end and retained data may be deleted according to our operational and legal retention requirements.",
    ],
  },
  {
    id: "ip",
    title: "10. Intellectual property",
    body: [
      "The Unpirator software, branding, documentation, interfaces and service materials are owned by their respective rights holders and are protected by applicable intellectual-property laws. These Terms do not transfer ownership of the service to you.",
      "You may use our SDKs, packages, APIs and documentation only as permitted by their applicable license terms and for integrating with or operating the service. Feedback you voluntarily provide may be used to improve the product without an obligation to compensate you.",
    ],
  },
  {
    id: "disclaimers",
    title: "11. Disclaimers",
    body: [
      "To the maximum extent permitted by applicable law, the service is provided on an 'as is' and 'as available' basis. We do not warrant that every attack, recording method, browser modification, compromised endpoint or third-party failure can be prevented or detected.",
      "You remain responsible for your own application security, authorization logic, legal rights to the content you deliver, backups, business continuity and the configuration of third-party storage or media providers.",
    ],
  },
  {
    id: "liability",
    title: "12. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, The Unpirator and its operators will not be liable for indirect, incidental, special, consequential, exemplary or punitive damages, or for loss of profits, revenue, goodwill, business opportunities or data arising from use of the service.",
      "Nothing in these Terms excludes or limits liability where applicable law does not permit that exclusion or limitation. Any separate written agreement signed by both parties may contain different liability terms and will control to the extent of a conflict.",
    ],
  },
  {
    id: "privacy",
    title: "13. Privacy and data processing",
    body: [
      "Our Privacy Policy explains the categories of information processed through the service, including workspace data, viewer identifiers, device identifiers, playback telemetry and security events. By using the service, you acknowledge that processing as described in the Privacy Policy.",
      "Where a customer sends end-user information to The Unpirator on behalf of its own users, the customer is responsible for the notices, permissions and lawful basis required for that data. Additional data-processing terms may be agreed separately where required.",
    ],
  },
  {
    id: "changes",
    title: "14. Changes to these Terms",
    body: [
      "We may update these Terms as the service, laws or operational requirements change. The current version will be posted on this page with an updated effective date. If a change materially affects paid customers, we may provide additional notice through the product, account email or another reasonable channel.",
    ],
  },
  {
    id: "contact",
    title: "15. Contact",
    body: [
      "Questions about these Terms, account access or contractual matters can be sent through our contact page. If a separate order form or signed agreement identifies a different legal contact, use the contact specified there.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#171717]">
      <PublicNav />
      <main>
        <section className="border-b border-[#e5e5e5] bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#727272]">Legal</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-6xl">
              Terms of Service
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#666]">
              Rules for creating a workspace, connecting media and using The Unpirator's protected
              playback infrastructure.
            </p>
            <p className="mt-6 text-sm text-[#7a7a7a]">Effective September 17, 2026</p>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
          <aside className="hidden lg:block">
            <nav
              className="sticky top-28 space-y-2 text-sm text-[#666]"
              aria-label="Terms sections"
            >
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block py-1 hover:text-[#171717]"
                >
                  {section.title.replace(/^\d+\.\s/, "")}
                </a>
              ))}
            </nav>
          </aside>

          <article className="max-w-3xl">
            <div className="rounded-2xl border border-[#e2e2e2] bg-white px-5 py-4 text-sm leading-6 text-[#606060]">
              These Terms apply to use of The Unpirator unless a separate written agreement signed
              by both parties says otherwise.
            </div>

            <div className="mt-10 divide-y divide-[#e6e6e6]">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 py-8 first:pt-0">
                  <h2 className="text-xl font-semibold tracking-[-.02em] sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#5f5f5f]">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.id === "billing" && (
                      <p>
                        See the{" "}
                        <Link
                          className="font-semibold text-[#242424] underline underline-offset-4"
                          href="/refund-policy"
                        >
                          Billing & Refund Policy
                        </Link>{" "}
                        for additional details.
                      </p>
                    )}
                    {section.id === "acceptable-use" && (
                      <p>
                        See the{" "}
                        <Link
                          className="font-semibold text-[#242424] underline underline-offset-4"
                          href="/acceptable-use"
                        >
                          Acceptable Use Policy
                        </Link>
                        .
                      </p>
                    )}
                    {section.id === "privacy" && (
                      <p>
                        See the{" "}
                        <Link
                          className="font-semibold text-[#242424] underline underline-offset-4"
                          href="/privacy"
                        >
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    )}
                    {section.id === "contact" && (
                      <p>
                        <Link
                          className="font-semibold text-[#242424] underline underline-offset-4"
                          href="/contact"
                        >
                          Contact The Unpirator
                        </Link>
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
