import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  FileCode2,
  KeyRound,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";

export const metadata = {
  title: "Developer documentation | The Unpirator",
  description:
    "Install The Unpirator player, create secure playback sessions, and integrate protected video into Next.js, React, PHP, Django, Laravel, WordPress, or plain HTML.",
};

const sections = [
  ["overview", "Overview"],
  ["choose-package", "Choose a package"],
  ["dashboard-setup", "Dashboard setup"],
  ["nextjs", "Next.js quick start"],
  ["web-component", "Other platforms"],
  ["server-contract", "Server contract"],
  ["security", "Security checklist"],
  ["errors", "Errors"],
];

const platforms = [
  ["Next.js", "@unpirator/react + @unpirator/integration-nextjs"],
  ["React + another backend", "@unpirator/react; create the backend endpoint in your server"],
  ["PHP / Laravel", "@unpirator/web-component; create the backend endpoint in PHP"],
  ["Django / Flask", "@unpirator/web-component; create the backend endpoint in Python"],
  ["WordPress", "@unpirator/web-component; add a server-side PHP endpoint or plugin"],
  ["Plain HTML", "@unpirator/web-component plus a server endpoint"],
  ["Custom JavaScript", "@unpirator/player + @unpirator/sdk-js"],
];

const packages = [
  [
    "@unpirator/react",
    "React player",
    "The customer-facing component for React and Next.js applications.",
  ],
  [
    "@unpirator/integration-nextjs",
    "Next.js server bridge",
    "Creates protected sessions without exposing the workspace API key.",
  ],
  [
    "@unpirator/web-component",
    "Universal player",
    "A custom element for PHP, Django, Laravel, WordPress, and HTML.",
  ],
  [
    "@unpirator/sdk-js",
    "Browser SDK",
    "Device identity and session bootstrap helpers for custom integrations.",
  ],
  [
    "@unpirator/player",
    "Playback runtime",
    "The low-level engine for grants, refresh, heartbeat, HLS, and watermarking.",
  ],
];

const errors = [
  ["400 · VALIDATION_ERROR", "Invalid UUID, device ID, or source/asset combination."],
  ["401 · Unauthorized", "The server API key is missing, expired, or incorrect."],
  ["403 · Forbidden", "The site, domain, feature, policy, or viewer was rejected."],
  ["404 · Not found", "The asset or provider connection is not in this workspace."],
  ["429 · Rate limited", "A plan or security limit was reached. Respect Retry-After."],
  ["SOURCE_RESOLUTION_FAILED", "The provider could not produce a playable source."],
  ["SEGMENT_TICKET_DENIED", "The segment grant expired or gateway validation failed."],
];

function CodeBlock({ label, children }) {
  return (
    <div className="docs-code">
      <div className="docs-code-head">
        <span>{label}</span>
        <span>UNPIRATOR</span>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="marketing docs-shell">
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <PublicNav />

      <header className="docs-hero section-wrap">
        <div>
          <div className="eyebrow">
            <BookOpen size={14} /> DEVELOPER DOCUMENTATION · v0.1.0
          </div>
          <h1>
            Protected playback,
            <br /> wired into your stack.
          </h1>
          <p>
            Pick your platform, add one player, and keep the secret authorization step on your own
            server. This guide takes you from a verified site to the first protected stream.
          </p>
          <div className="docs-hero-actions">
            <a href="#nextjs" className="primary-cta">
              Start with Next.js <ArrowRight size={17} />
            </a>
            <a href="#choose-package" className="text-cta">
              Find my package <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
        <div className="docs-terminal" aria-label="Quick installation example">
          <div className="docs-terminal-top">
            <span>
              <i /> <i /> <i />
            </span>
            install
          </div>
          <code>
            <span>$</span> npm install @unpirator/react{`\n`}
            {"  "}@unpirator/integration-nextjs
          </code>
          <div className="docs-terminal-result">
            <ShieldCheck size={17} /> Ready for protected playback
          </div>
        </div>
      </header>

      <div className="docs-layout section-wrap">
        <aside className="docs-sidebar" aria-label="Documentation sections">
          <div className="docs-side-label">ON THIS PAGE</div>
          <nav>
            {sections.map(([href, label], index) => (
              <a href={`#${href}`} key={href}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {label}
              </a>
            ))}
          </nav>
          <div className="docs-side-help">
            <ShieldCheck size={19} />
            <strong>Need your workspace values?</strong>
            <p>Find site IDs and API keys inside the customer dashboard.</p>
            <Link href="/dashboard/integration">
              Open integration <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>

        <main id="docs-content" className="docs-content">
          <section id="overview" className="docs-section docs-overview">
            <div className="docs-kicker">01 · OVERVIEW</div>
            <h2>Two pieces. One secure boundary.</h2>
            <p className="docs-lead">
              Every integration has a browser player and a same-origin server endpoint. The player
              asks your server for access; your server authenticates the viewer and contacts The
              Unpirator using the secret workspace API key.
            </p>
            <div className="docs-flow" aria-label="Playback request flow">
              {[
                [FileCode2, "Your page", "Player requests access"],
                [ServerCog, "Your server", "Checks the viewer"],
                [KeyRound, "Control API", "Issues a short grant"],
                [ShieldCheck, "Media gateway", "Delivers the stream"],
              ].map(([Icon, title, text], index) => (
                <div className="docs-flow-item" key={title}>
                  <span>{index + 1}</span>
                  <Icon size={21} />
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              ))}
            </div>
            <div className="docs-callout">
              <LockKeyhole size={20} />
              <div>
                <strong>The API key never belongs in the browser.</strong>
                <p>
                  Store it in server-only environment variables. Never use `NEXT_PUBLIC_`, `VITE_`,
                  or another public prefix.
                </p>
              </div>
            </div>
          </section>

          <section id="choose-package" className="docs-section">
            <div className="docs-kicker">02 · CHOOSE A PACKAGE</div>
            <h2>Use the package made for your stack.</h2>
            <p className="docs-lead">
              Most customers install one UI package and one small server integration. Core packages
              are installed automatically as dependencies.
            </p>
            <div className="docs-table-wrap">
              <table className="docs-platform-table">
                <thead>
                  <tr>
                    <th>Customer platform</th>
                    <th>Package to use directly</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map(([platform, choice]) => (
                    <tr key={platform}>
                      <td>{platform}</td>
                      <td>{choice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="docs-package-grid">
              {packages.map(([name, title, description], index) => (
                <article key={name}>
                  <div>
                    <Boxes size={18} /> 0{index + 1}
                  </div>
                  <code>{name}</code>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="dashboard-setup" className="docs-section">
            <div className="docs-kicker">03 · DASHBOARD SETUP</div>
            <h2>Prepare the workspace once.</h2>
            <div className="docs-checklist">
              {[
                ["Create a site", "Use the exact production hostname where the player will run."],
                [
                  "Verify the hostname",
                  "Choose DNS, meta tag, or the root verification text file.",
                ],
                [
                  "Enable the provider",
                  "YouTube supports on-demand URLs; other providers use assets.",
                ],
                ["Create an API key", "Select the playback:create scope and save the secret once."],
              ].map(([title, text], index) => (
                <article key={title}>
                  <span>
                    <Check size={15} />
                  </span>
                  <div>
                    <small>STEP {index + 1}</small>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
            <CodeBlock label=".env.local">{`UNPIRATOR_API_URL=https://theunpirator.vercel.app/control-api
UNPIRATOR_API_KEY=up_live_replace_me
UNPIRATOR_SITE_ID=00000000-0000-0000-0000-000000000000`}</CodeBlock>
          </section>

          <section id="nextjs" className="docs-section">
            <div className="docs-kicker">04 · NEXT.JS QUICK START</div>
            <h2>Your first protected player.</h2>
            <p className="docs-lead">
              Next.js customers install the React player and the server integration. The route reads
              secrets on the server and returns only a short-lived playback session.
            </p>
            <CodeBlock label="terminal">
              npm install @unpirator/react @unpirator/integration-nextjs
            </CodeBlock>
            <h3 className="docs-subtitle">1. Create the server route</h3>
            <CodeBlock label="app/api/unpirator/playback/route.js">{`import { createUnpiratorPlaybackHandler }
  from "@unpirator/integration-nextjs";
import { auth } from "@/auth";

export const runtime = "nodejs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,
  resolveViewer: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      const error = new Error("Sign in required");
      error.status = 401;
      throw error;
    }
    return {
      id: session.user.id,
      label: session.user.email || session.user.id,
    };
  },
});`}</CodeBlock>
            <h3 className="docs-subtitle">2. Render the player</h3>
            <CodeBlock label="components/lesson-video.jsx">{`"use client";

import { useCallback } from "react";
import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ youtubeUrl, firebaseUser }) {
  const getAccessToken = useCallback(
    () => firebaseUser.getIdToken(),
    [firebaseUser]
  );
  return (
    <UnpiratorPlayer
      src={youtubeUrl}
      title="Lesson video"
      getAccessToken={getAccessToken}
      onError={(error) => console.error(error.code, error)}
    />
  );
}`}</CodeBlock>
            <div className="docs-note">
              YouTube uses <code>src</code>. Bunny, HLS, S3, R2, and direct media use a registered
              asset UUID: <code>{'<UnpiratorPlayer assetId="ASSET_UUID" />'}</code>
            </div>
            <div className="docs-callout">
              <KeyRound size={20} />
              <div>
                <strong>Firebase and bearer authentication are supported.</strong>
                <p>
                  `getAccessToken` resolves a fresh token before the session request. Your server
                  verifies it and derives the viewer identity; browser user fields are never
                  trusted.
                </p>
              </div>
            </div>
          </section>

          <section id="web-component" className="docs-section">
            <div className="docs-kicker">05 · OTHER PLATFORMS</div>
            <h2>One element for every browser stack.</h2>
            <p className="docs-lead">
              The Web Component works in PHP, Laravel, Django, Flask, WordPress, plain HTML, and
              other browser frameworks. Your backend still owns the secret session endpoint.
            </p>
            <CodeBlock label="your template">{`<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.1.0">
</script>

<unpirator-player
  src="https://www.youtube.com/watch?v=VIDEO_ID"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`}</CodeBlock>
            <div className="docs-attribute-grid">
              {[
                ["src", "YouTube URL"],
                ["asset-id", "Registered asset UUID"],
                ["endpoint", "Same-origin server route"],
                ["title", "Playback and audit label"],
                ["poster", "Optional poster URL"],
                ["autoplay", "Request browser autoplay"],
              ].map(([name, text]) => (
                <div key={name}>
                  <code>{name}</code>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="server-contract" className="docs-section">
            <div className="docs-kicker">06 · SERVER CONTRACT</div>
            <h2>What every backend must do.</h2>
            <ol className="docs-numbered">
              <li>Authenticate the viewer and check access to the requested lesson or content.</li>
              <li>Ignore browser-supplied user identity and API credentials.</li>
              <li>Call the Control API with the server-only workspace API key.</li>
              <li>Return its status and JSON unchanged with `Cache-Control: no-store`.</li>
            </ol>
            <CodeBlock label="POST /v1/playback/sessions">{`Authorization: Bearer up_live_replace_me
Content-Type: application/json

{
  "siteId": "SITE_UUID",
  "source": {
    "provider": "youtube_custom",
    "url": "https://youtube.com/watch?v=VIDEO_ID",
    "title": "Lesson video"
  },
  "externalUserId": "student-123",
  "displayLabel": "student@example.com",
  "deviceId": "stable-browser-device-id",
  "client": { "browser": "Chrome", "os": "Windows" }
}`}</CodeBlock>
            <p>
              For registered media, replace <code>source</code> with <code>assetId</code>. Use an
              immutable customer database ID for <code>externalUserId</code>; the display label can
              be an email or account reference used by the watermark.
            </p>
          </section>

          <section id="security" className="docs-section">
            <div className="docs-kicker">07 · SECURITY CHECKLIST</div>
            <h2>Ship without leaking the keys.</h2>
            <div className="docs-security-grid">
              {[
                "Store the API key only in server-side secret storage.",
                "Authorize the viewer before creating each playback session.",
                "Use the verified site ID matching the browser hostname.",
                "Keep the player endpoint same-origin and retain CSRF protection.",
                "Return Cache-Control: no-store from the session endpoint.",
                "Never log API keys, tokens, or complete signed playback URLs.",
                "Use HTTPS and rotate any secret exposed to a browser or repository.",
                "Destroy the player when the containing view is removed.",
              ].map((item) => (
                <div key={item}>
                  <ShieldCheck size={18} /> <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="errors" className="docs-section">
            <div className="docs-kicker">08 · ERRORS & DIAGNOSIS</div>
            <h2>Find the failing boundary quickly.</h2>
            <div className="docs-errors">
              {errors.map(([code, meaning]) => (
                <div key={code}>
                  <code>{code}</code>
                  <p>{meaning}</p>
                </div>
              ))}
            </div>
            <div className="docs-warning">
              <TriangleAlert size={20} />
              <p>
                If playback starts and later stops, capture the Network response, request ID,
                Control API log, and gateway log from the same attempt. Never share a complete
                signed playback URL publicly.
              </p>
            </div>
          </section>

          <section className="docs-finish">
            <div>
              <TerminalSquare size={25} />
              <div>
                <span>READY TO INTEGRATE?</span>
                <h2>Connect your first protected video.</h2>
              </div>
            </div>
            <Link href="/dashboard/integration" className="primary-cta">
              Open integration setup <ArrowUpRight size={17} />
            </Link>
          </section>
        </main>
      </div>

      <footer className="docs-footer section-wrap">
        <Link href="/" className="wordmark">
          <ShieldCheck size={19} /> unpirator.
        </Link>
        <p>Documentation for package version 0.1.x</p>
        <a href="https://www.npmjs.com/org/unpirator" target="_blank" rel="noreferrer">
          npm packages <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
