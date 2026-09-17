import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-site";

export const metadata = { title: "Privacy Policy | The Unpirator" };

const sections = [
  {
    id: "scope",
    title: "1. Scope",
    body: [
      "This Privacy Policy explains how The Unpirator processes information when customers create accounts, configure workspaces, connect media providers, integrate protected playback, manage viewers and devices, use billing features or contact support.",
      "The Unpirator is designed so that customers can use protected playback without sending unnecessary personal information. In many integrations, a stable opaque external user ID is sufficient for viewer-level controls.",
    ],
  },
  {
    id: "account-data",
    title: "2. Account and workspace information",
    body: [
      "We process information needed to create and operate an account and workspace, such as account email, organization or workspace name, authentication state, role, plan, billing status, site configuration, API-key metadata, webhook configuration, audit events and support communications.",
      "Authentication secrets such as passwords are handled through the authentication system and are not intended to be stored in readable form. Customers are responsible for protecting their own credentials and API keys.",
    ],
  },
  {
    id: "media-data",
    title: "3. Media and provider information",
    body: [
      "To create protected playback, customer servers may send media source information, provider references, storage configuration or provider credentials to The Unpirator. This information is used to resolve and deliver media through the protected playback path and is not intended to be exposed to viewers through browser code.",
      "Customers should send only the provider information required for the selected integration. Sensitive provider configuration may be encrypted or otherwise protected at rest where supported by the service architecture.",
    ],
  },
  {
    id: "viewer-data",
    title: "4. Viewer information",
    body: [
      "A customer server may send a stable external user ID so playback sessions, limits, revocation and security events can be associated with the correct viewer. We recommend opaque identifiers that do not directly reveal the viewer's identity.",
      "A display label, such as a name, email address, account label or student identifier, may be sent when the customer wants a readable label in the workspace, watermarking or operational tools. Display labels are optional for the standard playback flow unless a specific enabled feature requires one.",
      "The customer, not The Unpirator, determines whether a viewer is entitled to watch a particular video. Customers are responsible for the lawful basis, notices and permissions required for the end-user data they send to the service.",
    ],
  },
  {
    id: "device-data",
    title: "5. Device identifiers",
    body: [
      "The player or customer application may provide a random application-generated device ID. A stable device ID allows plan-enabled features such as device history, device limits, device blocking, revocation and more accurate session control to work across playback requests.",
      "Device ID is not intended to be a hardware serial number or invasive fingerprint. If a customer's plan does not require a device ID, protected playback may operate without one, although device-specific controls may be unavailable or less accurate.",
    ],
  },
  {
    id: "telemetry",
    title: "6. Playback, usage and security telemetry",
    body: [
      "We may process playback-session identifiers, asset and site references, timestamps, request outcomes, device context, client or browser context, IP-derived network information, usage counters, concurrency state, revocation state, security events, gateway activity and error logs.",
      "This information is used to create and validate protected sessions, enforce plan limits, detect abuse, operate revocation and device controls, troubleshoot failures, measure usage, support customers and maintain service reliability and security.",
    ],
  },
  {
    id: "billing",
    title: "7. Billing information",
    body: [
      "We process plan, subscription, invoice, payment-status and transaction metadata needed to operate paid access. Payment-card or financial details may be handled by a payment provider rather than stored directly by The Unpirator, depending on the payment method in use.",
      "We may retain billing records where required for accounting, dispute handling, fraud prevention or legal compliance.",
    ],
  },
  {
    id: "cookies",
    title: "8. Cookies and local storage",
    body: [
      "The web application may use essential cookies, browser storage or similar technologies for authentication state, workspace selection, security controls and product functionality. These mechanisms are used to keep the application working and are not described here as advertising trackers.",
      "If optional analytics or other non-essential tracking technologies are introduced, this Policy and any required consent controls should be updated before they are used where consent is required by law.",
    ],
  },
  {
    id: "purposes",
    title: "9. Why we process information",
    body: [
      "We process information to provide and secure the service, authenticate accounts, create protected playback sessions, enforce purchased plan features and limits, process billing, prevent abuse, maintain reliability, debug incidents, respond to support requests and comply with applicable legal obligations.",
      "We may also use aggregated or de-identified operational information to understand reliability, capacity and product performance where that information no longer reasonably identifies an individual or customer viewer.",
    ],
  },
  {
    id: "sharing",
    title: "10. Service providers and disclosures",
    body: [
      "We may use infrastructure, hosting, storage, database, email, monitoring, payment, support or security providers to operate the service. Those providers may process information only as needed to provide their services to The Unpirator, subject to their applicable contractual and security obligations.",
      "We may disclose information where reasonably necessary to comply with law, respond to valid legal process, protect the security or rights of customers or users, investigate abuse or fraud, or complete a corporate transaction such as a merger, acquisition or asset transfer. We do not sell customer conversation or playback data to advertisers.",
    ],
  },
  {
    id: "retention",
    title: "11. Retention",
    body: [
      "Retention depends on the type of information, the active plan, operational needs and legal requirements. Some security, session, audit or usage records may have plan-specific retention periods. Account and billing records may be retained longer where needed for compliance, fraud prevention, dispute resolution or accounting.",
      "When data is no longer needed for the purposes described here, we may delete, anonymize or aggregate it, subject to backups, legal holds and technical retention cycles.",
    ],
  },
  {
    id: "security",
    title: "12. Security",
    body: [
      "We use technical and organizational measures intended to protect customer and operational data, including access controls, separation of browser and server trust boundaries, short-lived playback authorization, secret-handling controls and encrypted handling of sensitive configuration where supported.",
      "No system can guarantee absolute security. Customers remain responsible for securing their own application, authentication system, API keys, provider credentials, domains, storage accounts and authorization logic.",
    ],
  },
  {
    id: "roles",
    title: "13. Customer and processor roles",
    body: [
      "For account, billing and direct customer relationship data, The Unpirator may determine the purposes and means of processing needed to operate the service. For viewer or end-user data submitted by a customer through its integration, the customer generally determines why that data is processed and The Unpirator processes it to provide the service on the customer's behalf.",
      "Where required, customers may request additional data-processing terms appropriate to their use case and applicable law.",
    ],
  },
  {
    id: "rights",
    title: "14. Access, correction and deletion requests",
    body: [
      "Account holders may use available product controls to review or update certain workspace information. Requests concerning account data, deletion or privacy questions can be submitted through our contact page.",
      "If you are an end user of one of our customers and your request concerns viewer data that customer submitted to The Unpirator, you should usually contact that customer first because it controls the viewer account and the purpose of the playback relationship. We may assist the customer with a valid request where appropriate.",
    ],
  },
  {
    id: "international",
    title: "15. International processing",
    body: [
      "Infrastructure and service providers may process information in countries other than the country where a customer or viewer is located. Where applicable law requires safeguards for international transfers, appropriate contractual or legal mechanisms should be used for those transfers.",
    ],
  },
  {
    id: "children",
    title: "16. Children and education customers",
    body: [
      "The Unpirator may be used by education platforms, but it is not designed to require a child's real name or email for standard protected playback. Education customers are responsible for determining whether they may lawfully send student or child data and for obtaining any notices, consents or agreements required for their users.",
      "Customers serving minors should minimize the data they send and use opaque viewer identifiers wherever practical.",
    ],
  },
  {
    id: "changes",
    title: "17. Changes to this Policy",
    body: [
      "We may update this Privacy Policy as the product, infrastructure or legal requirements change. The current version will be posted here with an updated effective date. Material changes may also be communicated through the product, account email or another reasonable channel.",
    ],
  },
  {
    id: "contact",
    title: "18. Contact",
    body: [
      "Privacy questions, account-data requests or security concerns can be submitted through the contact page. If a customer's separate agreement provides a dedicated privacy or security contact, that contact may also be used.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#171717]">
      <PublicNav />
      <main>
        <section className="border-b border-[#e5e5e5] bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#727272]">Legal</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-6xl">
              Privacy Policy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#666]">
              How The Unpirator handles workspace, viewer, device, playback and security data while
              operating protected video delivery.
            </p>
            <p className="mt-6 text-sm text-[#7a7a7a]">Effective September 17, 2026</p>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
          <aside className="hidden lg:block">
            <nav className="sticky top-28 space-y-2 text-sm text-[#666]" aria-label="Privacy sections">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="block py-1 hover:text-[#171717]">
                  {section.title.replace(/^\d+\.\s/, "")}
                </a>
              ))}
            </nav>
          </aside>

          <article className="max-w-3xl">
            <div className="rounded-2xl border border-[#e2e2e2] bg-white px-5 py-4 text-sm leading-6 text-[#606060]">
              Privacy by design: the standard integration can use opaque viewer IDs and a random
              application-generated device ID instead of requiring real-world identity data.
            </div>

            <div className="mt-10 divide-y divide-[#e6e6e6]">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 py-8 first:pt-0">
                  <h2 className="text-xl font-semibold tracking-[-.02em] sm:text-2xl">{section.title}</h2>
                  <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#5f5f5f]">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.id === "contact" && (
                      <p>
                        <Link className="font-semibold text-[#242424] underline underline-offset-4" href="/contact">Contact The Unpirator</Link>
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
