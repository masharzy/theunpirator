"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  Copy,
  FileCode2,
  KeyRound,
  Layers,
  LockKeyhole,
  Play,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";

/* ----------------------------------------------------------------------- */
/* Stack definitions — everything platform-specific lives here so adding   */
/* a new stack later is a single object, not a page rewrite.               */
/* ----------------------------------------------------------------------- */

const STACKS = {
  nextjs: {
    label: "Next.js",
    short: "Next.js",
    packages: "@unpirator/react @unpirator/integration-nextjs",
    install: "npm install @unpirator/react@0.1.12 @unpirator/integration-nextjs@0.1.1",
    sync: `import { createUnpiratorServerClient }
  from "@unpirator/integration-nextjs";

const unpirator = createUnpiratorServerClient({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
});

const synced = await unpirator.upsertPlaybackAsset({
  siteId: process.env.UNPIRATOR_SITE_ID,
  externalContentId: String(lesson.id),
  title: lesson.title,
  provider: "hls",
  sourceUrl: lesson.privateVideoUrl,
  allowedHosts: ["media.example.com"],
  providerConfig: {},
  securityPolicy: "strict",
});

await savePlaybackRef(lesson.id, synced.playbackRef);`,
    syncLabel: "server/content-sync.js",
    route: `import { createUnpiratorPlaybackHandler }
  from "@unpirator/integration-nextjs";
import { auth } from "@/auth";

export const runtime = "nodejs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,
  resolveViewer: async (request) => {
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
  authorizePlayback: async ({ body, viewer }) =>
    canViewLesson(viewer.id, body.playbackRef),
});`,
    routeLabel: "app/api/unpirator/playback/route.js",
    render: `"use client";

import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ playbackRef }) {
  return (
    <UnpiratorPlayer
      playbackRef={playbackRef}
      endpoint="/api/unpirator/playback"
      title="Lesson video"
      onError={(error) => console.error(error.code, error)}
    />
  );
}`,
    renderLabel: "components/lesson-video.jsx",
  },
  react: {
    label: "React",
    short: "React",
    packages: "@unpirator/react",
    install: "npm install @unpirator/react@0.1.12",
    sync: `// Call this from your OWN backend (Express, Fastify, etc.)
// — never from the browser. The API key must stay server-side.

const response = await fetch(
  \`\${process.env.UNPIRATOR_API_URL}/v1/playback/assets/upsert\`,
  {
    method: "POST",
    headers: {
      authorization: \`Bearer \${process.env.UNPIRATOR_API_KEY}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      siteId: process.env.UNPIRATOR_SITE_ID,
      externalContentId: String(lesson.id),
      title: lesson.title,
      provider: "hls",
      sourceUrl: lesson.privateVideoUrl,
      allowedHosts: ["media.example.com"],
      providerConfig: {},
      securityPolicy: "strict",
    }),
  },
);
const { playbackRef } = await response.json();
await savePlaybackRef(lesson.id, playbackRef);`,
    syncLabel: "server/content-sync.js",
    route: `// Your own server route — any Node backend.
// POST /api/unpirator/playback

app.post("/api/unpirator/playback", async (req, res) => {
  const viewer = await resolveViewerFromSession(req);
  if (!viewer) return res.status(401).json({ error: "Sign in required" });

  const allowed = await canViewLesson(viewer.id, req.body.playbackRef);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });

  const session = await fetch(
    \`\${process.env.UNPIRATOR_API_URL}/v1/playback/sessions\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${process.env.UNPIRATOR_API_KEY}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        siteId: process.env.UNPIRATOR_SITE_ID,
        assetId: req.body.playbackRef,
        externalUserId: viewer.id,
        displayLabel: viewer.label,
        deviceId: req.body.deviceId,
      }),
    },
  ).then((r) => r.json());

  res.set("cache-control", "no-store").status(201).json(session);
});`,
    routeLabel: "server/routes/playback.js",
    render: `import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ playbackRef }) {
  return (
    <UnpiratorPlayer
      playbackRef={playbackRef}
      endpoint="/api/unpirator/playback"
      title="Lesson video"
      onError={(error) => console.error(error.code, error)}
    />
  );
}`,
    renderLabel: "components/LessonVideo.jsx",
  },
  php: {
    label: "PHP / Laravel",
    short: "PHP",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.1.11">
</script>`,
    sync: `$payload = [
  'siteId' => getenv('UNPIRATOR_SITE_ID'),
  'externalContentId' => (string) $lesson->id,
  'title' => $lesson->title,
  'provider' => 'hls',
  'sourceUrl' => $lesson->private_video_url,
  'allowedHosts' => ['media.example.com'],
  'providerConfig' => new stdClass(),
  'securityPolicy' => 'strict',
];

$ch = curl_init(getenv('UNPIRATOR_API_URL') . '/v1/playback/assets/upsert');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . getenv('UNPIRATOR_API_KEY'),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode($payload),
]);
$result = json_decode(curl_exec($ch), true);
$lesson->unpirator_playback_ref = $result['playbackRef'];
$lesson->save();`,
    syncLabel: "app/Services/ContentSync.php",
    route: `// routes/web.php or a controller action
Route::post('/api/unpirator/playback', function (Request $request) {
    $viewer = Auth::user();
    if (! $viewer) {
        return response()->json(['error' => 'Sign in required'], 401);
    }
    if (! canViewLesson($viewer->id, $request->input('playbackRef'))) {
        return response()->json(['error' => 'Forbidden'], 403);
    }

    $ch = curl_init(env('UNPIRATOR_API_URL') . '/v1/playback/sessions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . env('UNPIRATOR_API_KEY'),
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'siteId' => env('UNPIRATOR_SITE_ID'),
            'assetId' => $request->input('playbackRef'),
            'externalUserId' => (string) $viewer->id,
            'displayLabel' => $viewer->email,
            'deviceId' => $request->input('deviceId'),
        ]),
    ]);
    $session = json_decode(curl_exec($ch), true);

    return response()->json($session)->header('Cache-Control', 'no-store');
});`,
    routeLabel: "routes/web.php",
    render: `<unpirator-player
  playback-ref="{{ $lesson->unpirator_playback_ref }}"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
    renderLabel: "resources/views/lesson.blade.php",
  },
  django: {
    label: "Django / Flask",
    short: "Django",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.1.11">
</script>`,
    sync: `import os, requests

payload = {
    "siteId": os.environ["UNPIRATOR_SITE_ID"],
    "externalContentId": str(lesson.id),
    "title": lesson.title,
    "provider": "hls",
    "sourceUrl": lesson.private_video_url,
    "allowedHosts": ["media.example.com"],
    "providerConfig": {},
    "securityPolicy": "strict",
}

response = requests.post(
    f"{os.environ['UNPIRATOR_API_URL']}/v1/playback/assets/upsert",
    json=payload,
    headers={"Authorization": f"Bearer {os.environ['UNPIRATOR_API_KEY']}"},
    timeout=10,
)
response.raise_for_status()
lesson.unpirator_playback_ref = response.json()["playbackRef"]
lesson.save()`,
    syncLabel: "content/sync.py",
    route: `# views.py
import os, requests
from django.http import JsonResponse

def unpirator_playback(request):
    viewer = getattr(request, "user", None)
    if not viewer or not viewer.is_authenticated:
        return JsonResponse({"error": "Sign in required"}, status=401)

    body = json.loads(request.body)
    if not can_view_lesson(viewer.id, body.get("playbackRef")):
        return JsonResponse({"error": "Forbidden"}, status=403)

    resp = requests.post(
        f"{os.environ['UNPIRATOR_API_URL']}/v1/playback/sessions",
        json={
            "siteId": os.environ["UNPIRATOR_SITE_ID"],
            "assetId": body.get("playbackRef"),
            "externalUserId": str(viewer.id),
            "displayLabel": viewer.email,
            "deviceId": body.get("deviceId"),
        },
        headers={"Authorization": f"Bearer {os.environ['UNPIRATOR_API_KEY']}"},
        timeout=10,
    )
    response = JsonResponse(resp.json(), status=resp.status_code)
    response["Cache-Control"] = "no-store"
    return response`,
    routeLabel: "views.py",
    render: `<unpirator-player
  playback-ref="{{ lesson.unpirator_playback_ref }}"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
    renderLabel: "templates/lesson.html",
  },
  html: {
    label: "Plain HTML",
    short: "HTML",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.1.11">
</script>`,
    sync: `// Any server-side script you control — Node, PHP, Python, etc.
// This must run server-side; never expose UNPIRATOR_API_KEY to the browser.

const res = await fetch(
  \`\${UNPIRATOR_API_URL}/v1/playback/assets/upsert\`,
  {
    method: "POST",
    headers: {
      authorization: \`Bearer \${UNPIRATOR_API_KEY}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      siteId: UNPIRATOR_SITE_ID,
      externalContentId: String(lesson.id),
      title: lesson.title,
      provider: "hls",
      sourceUrl: lesson.privateVideoUrl,
      allowedHosts: ["media.example.com"],
      providerConfig: {},
      securityPolicy: "strict",
    }),
  },
);
const { playbackRef } = await res.json();`,
    syncLabel: "sync-content.js (server-side)",
    route: `// Same-origin server endpoint, any stack
// POST /api/unpirator/playback

export async function handlePlayback(req, res) {
  const session = await fetch(
    \`\${UNPIRATOR_API_URL}/v1/playback/sessions\`,
    {
      method: "POST",
      headers: {
        authorization: \`Bearer \${UNPIRATOR_API_KEY}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        siteId: UNPIRATOR_SITE_ID,
        assetId: req.body.playbackRef,
        externalUserId: req.viewer.id,
        deviceId: req.body.deviceId,
      }),
    },
  ).then((r) => r.json());

  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(session);
}`,
    routeLabel: "api/unpirator/playback.js",
    render: `<unpirator-player
  playback-ref="OPAQUE_REFERENCE_FROM_YOUR_BACKEND"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
    renderLabel: "lesson.html",
  },
};

const STACK_ORDER = ["nextjs", "react", "php", "django", "html"];

/* ----------------------------------------------------------------------- */
/* Static reference data                                                   */
/* ----------------------------------------------------------------------- */

const sections = [
  ["overview", "Overview"],
  ["playground", "Live request flow"],
  ["private-sources", "Private source sync"],
  ["choose-package", "Choose a package"],
  ["dashboard-setup", "Dashboard setup"],
  ["integrate", "Integrate your stack"],
  ["server-contract", "Server contract"],
  ["playback-ref", "About playbackRef"],
  ["security", "Security checklist"],
  ["errors", "Errors"],
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
  ["400 · VALIDATION_ERROR", "Request body failed schema validation (bad UUID, missing field, wrong type)."],
  ["401 · UNAUTHORIZED", "The server API key is missing, expired, or incorrect."],
  ["403 · FORBIDDEN", "The site, domain, feature, policy, or viewer was rejected."],
  ["404 · NOT_FOUND / SITE_NOT_FOUND", "The site, asset, or provider connection is not in this workspace."],
  ["409 · CONNECTION_DISABLED", "The linked provider connection was disabled after the asset was created."],
  ["429 · RATE_LIMIT", "More than 240 playback requests/min from this key or IP. Respect the Retry-After header."],
  ["PROVIDER_DISABLED", "The provider's health check marked it unavailable; retry with backoff."],
  ["SOURCE_INVALID", "The source URL or provider configuration failed validation."],
];

const securityChecklist = [
  "Store the API key only in server-side secret storage.",
  "Authorize the viewer before creating each playback session.",
  "Use the verified site ID matching the browser hostname.",
  "Keep the player endpoint same-origin and retain CSRF protection.",
  "Return Cache-Control: no-store from the session endpoint.",
  "Never log API keys, tokens, or complete signed playback URLs.",
  "Use HTTPS and rotate any secret exposed to a browser or repository.",
  "Destroy the player when the containing view is removed.",
];

const flowSteps = [
  {
    icon: FileCode2,
    title: "Your page",
    text: "Player requests access",
    detail: "The UnpiratorPlayer mounts and calls your same-origin endpoint with playbackRef and a stable deviceId. No API key, no source URL ever leaves the browser.",
  },
  {
    icon: ServerCog,
    title: "Your server",
    text: "Checks the viewer",
    detail: "Your route authenticates the session, checks the viewer can access this lesson, then calls the Control API using the server-only API key.",
  },
  {
    icon: KeyRound,
    title: "Control API",
    text: "Issues a short grant",
    detail: "POST /v1/playback/sessions validates the asset, tenant, and policy, then returns a short-lived signed session — Cache-Control: no-store.",
  },
  {
    icon: ShieldCheck,
    title: "Media gateway",
    text: "Delivers the stream",
    detail: "The Cloudflare Worker verifies the Ed25519-signed grant at the edge and streams segments. It never accepts an arbitrary ?url= target.",
  },
];

/* ----------------------------------------------------------------------- */
/* Small building blocks                                                   */
/* ----------------------------------------------------------------------- */

function CodeBlock({ label, children, badge = "UNPIRATOR" }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : String(children ?? "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be unavailable; fail silently */
    }
  }

  return (
    <div className="docs-code">
      <div className="docs-code-head">
        <span>{label}</span>
        <button
          type="button"
          className={`docs-copy-btn${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={11} /> Copied
            </>
          ) : (
            <>
              <Copy size={11} /> {badge}
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function StackPicker({ stack, onChange, dense = false }) {
  return (
    <div className={`stack-picker${dense ? " stack-picker-dense" : ""}`} role="tablist" aria-label="Choose your stack">
      {STACK_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={stack === key}
          className={`stack-pill${stack === key ? " is-active" : ""}`}
          onClick={() => onChange(key)}
        >
          {STACKS[key].short}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Live request-flow playground                                            */
/* ----------------------------------------------------------------------- */

function Playground({ stack }) {
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [done, setDone] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function simulate() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDone(false);
    setRunning(true);
    setActiveStep(-1);
    flowSteps.forEach((_, index) => {
      const t = window.setTimeout(
        () => {
          setActiveStep(index);
          if (index === flowSteps.length - 1) {
            window.setTimeout(() => {
              setRunning(false);
              setDone(true);
            }, 700);
          }
        },
        550 * (index + 1),
      );
      timers.current.push(t);
    });
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(false);
    setDone(false);
    setActiveStep(-1);
  }

  const mockResponse = useMemo(
    () =>
      JSON.stringify(
        {
          sessionId: "sess_9f2c1a7e4b",
          token: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9…",
          tokenExpiresIn: 90,
          policy: "strict",
          gatewayUrl: "https://gateway.theunpirator.dev/v1/stream",
        },
        null,
        2,
      ),
    [],
  );

  return (
    <div className="playground">
      <div className="playground-head">
        <div>
          <span className="playground-eyebrow">
            <Layers size={13} /> INTERACTIVE — {STACKS[stack].label}
          </span>
          <h3>Simulate a protected playback request</h3>
          <p>
            Click simulate to watch a request travel the same boundary your real integration
            will use. Nothing here calls a live server — it's a local walkthrough of the exact
            hops in <code>POST /v1/playback/sessions</code>.
          </p>
        </div>
        <div className="playground-actions">
          <button type="button" className="primary-cta playground-run" onClick={simulate} disabled={running}>
            <Play size={15} /> {running ? "Running…" : "Simulate request"}
          </button>
          <button type="button" className="text-cta playground-reset" onClick={reset}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      <div className="playground-rail" aria-label="Request flow steps">
        {flowSteps.map((step, index) => {
          const Icon = step.icon;
          const state =
            index < activeStep || (index === activeStep && done && index === flowSteps.length - 1)
              ? "done"
              : index === activeStep
                ? "active"
                : "idle";
          return (
            <div key={step.title} className={`playground-node is-${state}`}>
              {index > 0 && <span className="playground-connector" aria-hidden="true" />}
              <div className="playground-node-icon">
                <Icon size={18} />
              </div>
              <strong>{step.title}</strong>
              <small>{step.text}</small>
              <p className="playground-node-detail">{step.detail}</p>
            </div>
          );
        })}
      </div>

      <div className={`playground-response${done ? " is-visible" : ""}`} aria-live="polite">
        <div className="docs-code-head">
          <span>Response · 201 Created</span>
          <span>Cache-Control: no-store</span>
        </div>
        <pre>
          <code>{mockResponse}</code>
        </pre>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                     */
/* ----------------------------------------------------------------------- */

export function DocsClient() {
  const [stack, setStack] = useState("nextjs");
  const [pickerDone, setPickerDone] = useState(false);
  const s = STACKS[stack];

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

          <div className="hero-stack-picker">
            <span className="hero-stack-label">I&apos;m building with</span>
            <StackPicker
              stack={stack}
              onChange={(next) => {
                setStack(next);
                setPickerDone(true);
              }}
            />
          </div>

          <div className="docs-hero-actions">
            <a href="#integrate" className="primary-cta">
              Start with {s.short} <ArrowRight size={17} />
            </a>
            <a href="#choose-package" className="text-cta">
              Find my package <ArrowUpRight size={17} />
            </a>
          </div>
          {pickerDone && (
            <p className="hero-stack-confirm">
              <Check size={13} /> Showing {s.label} examples through this page — switch anytime.
            </p>
          )}
        </div>
        <div className="docs-terminal" aria-label="Quick installation example">
          <div className="docs-terminal-top">
            <span>
              <i /> <i /> <i />
            </span>
            install · {s.short}
          </div>
          <code>
            <span>$</span> {s.install.split("\n")[0]}
            {s.install.split("\n")[1] ? (
              <>
                {"\n"}
                {s.install.split("\n").slice(1).join("\n")}
              </>
            ) : null}
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
              {flowSteps.map(({ icon: Icon, title, text }, index) => (
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

          <section id="playground" className="docs-section">
            <div className="docs-kicker">02 · TRY IT</div>
            <h2>Watch a request cross the boundary.</h2>
            <p className="docs-lead">
              This is the same four-hop path described above, animated step by step so it&apos;s
              obvious what your server is responsible for versus what The Unpirator handles.
            </p>
            <Playground stack={stack} />
          </section>

          <section id="private-sources" className="docs-section">
            <div className="docs-kicker">03 · PRIVATE SOURCE SYNC</div>
            <h2>Keep the original video URL out of the browser.</h2>
            <p className="docs-lead">
              When a lesson is created or updated, send its private source from your backend to the
              asset upsert API. Store the returned reference with the lesson and render only that
              reference in the player.
            </p>
            <div className="docs-flow" aria-label="Private source synchronization flow">
              {[
                [ServerCog, "Content backend", "Reads the private source"],
                [KeyRound, "Asset upsert", "Creates or updates once"],
                [Boxes, "Lesson record", "Stores playbackRef"],
                [ShieldCheck, "Browser player", "Receives no origin URL"],
              ].map(([Icon, title, text], index) => (
                <div className="docs-flow-item" key={title}>
                  <span>{index + 1}</span>
                  <Icon size={21} />
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              ))}
            </div>
            <CodeBlock label={s.syncLabel}>{s.sync}</CodeBlock>
            <div className="docs-callout">
              <LockKeyhole size={20} />
              <div>
                <strong>Synchronize on content save, not on every student page load.</strong>
                <p>
                  The unique key is site plus <code>externalContentId</code>. Repeating the request
                  reuses and updates the same asset row instead of creating duplicates. Your
                  playback endpoint must still authenticate the viewer and verify access to the
                  referenced lesson on every request.
                </p>
              </div>
            </div>
          </section>

          <section id="choose-package" className="docs-section">
            <div className="docs-kicker">04 · CHOOSE A PACKAGE</div>
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
                  {STACK_ORDER.map((key) => (
                    <tr key={key} className={key === stack ? "is-active-row" : undefined}>
                      <td>{STACKS[key].label}</td>
                      <td>{STACKS[key].packages}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Custom JavaScript</td>
                    <td>@unpirator/player + @unpirator/sdk-js</td>
                  </tr>
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
            <div className="docs-kicker">05 · DASHBOARD SETUP</div>
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
                  "YouTube supports on-demand URLs; other providers use registered assets.",
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

          <section id="integrate" className="docs-section">
            <div className="docs-kicker">06 · INTEGRATE YOUR STACK</div>
            <h2>Your first protected player, in {s.label}.</h2>
            <p className="docs-lead">
              Every stack follows the same three moves: sync the asset once, add a same-origin
              route that authorizes the viewer, then render the player with the reference — never
              the raw source URL.
            </p>
            <StackPicker stack={stack} onChange={setStack} dense />

            <h3 className="docs-subtitle">1. Synchronize the lesson when it is saved</h3>
            <CodeBlock label={s.syncLabel}>{s.sync}</CodeBlock>

            <h3 className="docs-subtitle">2. Create the authenticated playback route</h3>
            <CodeBlock label={s.routeLabel}>{s.route}</CodeBlock>

            <h3 className="docs-subtitle">3. Render only the reference</h3>
            <CodeBlock label={s.renderLabel}>{s.render}</CodeBlock>

            <div className="docs-note">
              The private URL is used only during server-side synchronization. The browser page,
              rendered markup, and player requests receive <code>playbackRef</code> only.
            </div>

            {stack !== "nextjs" && (
              <div className="docs-callout">
                <KeyRound size={20} />
                <div>
                  <strong>Same contract, every stack.</strong>
                  <p>
                    Every server route ultimately calls the same two Control API endpoints —
                    <code> /v1/playback/assets/upsert</code> and <code>/v1/playback/sessions</code>{" "}
                    — with a bearer API key. Only the HTTP client syntax changes.
                  </p>
                </div>
              </div>
            )}

            {(stack === "php" || stack === "django" || stack === "html") && (
              <div className="docs-attribute-grid" style={{ marginTop: 28 }}>
                {[
                  ["playback-ref", "Reference for a registered production asset"],
                  ["src", "Inline YouTube URL; visible when rendered into page markup"],
                  ["asset-id", "Registered asset UUID (same value as playback-ref today)"],
                  ["endpoint", "Same-origin server route"],
                  ["poster", "Optional poster URL"],
                  ["youtube-direct", "Boolean attribute — bypass the gateway for public YouTube"],
                ].map(([name, text]) => (
                  <div key={name}>
                    <code>{name}</code>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="server-contract" className="docs-section">
            <div className="docs-kicker">07 · SERVER CONTRACT</div>
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
  "assetId": "ASSET_UUID_OR_PLAYBACK_REF",
  "externalUserId": "student-123",
  "displayLabel": "student@example.com",
  "deviceId": "stable-browser-device-id",
  "client": { "browser": "Chrome", "os": "Windows" }
}`}</CodeBlock>
            <p>
              For an unregistered YouTube URL instead of a registered asset, replace{" "}
              <code>assetId</code> with a <code>source</code> object (
              <code>{`{ provider: "youtube_custom", url, title }`}</code>). Use an immutable
              customer database ID for <code>externalUserId</code>; the display label can be an
              email or account reference used by the watermark. Playback routes are rate-limited to{" "}
              <strong>240 requests per minute</strong> per API key or IP.
            </p>
          </section>

          <section id="playback-ref" className="docs-section">
            <div className="docs-kicker">08 · ABOUT PLAYBACKREF</div>
            <h2>What the reference actually is today.</h2>
            <p className="docs-lead">
              <code>playbackRef</code> is currently the asset&apos;s database UUID, returned
              directly from <code>/v1/playback/assets/upsert</code>. Treat it as a bearer-adjacent
              identifier, not a public value:
            </p>
            <div className="docs-security-grid" style={{ marginTop: 8 }}>
              <div>
                <ShieldCheck size={18} /> <span>Safe to store alongside the lesson row in your own database.</span>
              </div>
              <div>
                <ShieldCheck size={18} /> <span>Safe to send to the browser — it never resolves to a source URL client-side.</span>
              </div>
              <div>
                <ShieldAlert size={18} /> <span>Not opaque or signed — it is a UUID, so don&apos;t treat it as a secret credential on its own.</span>
              </div>
              <div>
                <ShieldAlert size={18} /> <span>Resolution still requires your server-side API key — a bare UUID alone can&apos;t start playback.</span>
              </div>
            </div>
            <div className="docs-note">
              Every resolution still passes through tenant and site ownership checks server-side,
              so a leaked reference on its own can&apos;t be replayed against another workspace.
              If you need the reference itself to be unguessable end-to-end, keep it out of public
              HTML attributes and pass it only through your authenticated route.
            </div>
          </section>

          <section id="security" className="docs-section">
            <div className="docs-kicker">09 · SECURITY CHECKLIST</div>
            <h2>Ship without leaking the keys.</h2>
            <div className="docs-security-grid">
              {securityChecklist.map((item) => (
                <div key={item}>
                  <ShieldCheck size={18} /> <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="errors" className="docs-section">
            <div className="docs-kicker">10 · ERRORS & DIAGNOSIS</div>
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