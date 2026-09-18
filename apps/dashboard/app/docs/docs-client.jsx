"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  Copy,
  Database,
  EyeOff,
  FileCode2,
  KeyRound,
  LockKeyhole,
  Play,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  Video,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";

/*
 * DOCS REWRITE GOAL
 * -----------------
 * 1) Explain the real runtime path first.
 * 2) Never make an undefined customer helper look like an Unpirator API.
 * 3) Mark CUSTOMER APP / UNPIRATOR / AUTOMATIC PLAYER responsibilities.
 * 4) Treat existing customer video libraries as the source of truth.
 * 5) Show exactly where playbackRef comes from and how it reaches the player.
 */

const STACKS = {
  nextjs: {
    label: "Next.js",
    short: "Next.js",
    packages: "@unpirator/react @unpirator/integration-nextjs",
    install: "npm install @unpirator/react@0.2.0 @unpirator/integration-nextjs@0.2.0",
    serverLabel: "Your class page / server loader",
    server: `import { createUnpiratorServerClient } from "@unpirator/integration-nextjs";

const unpirator = createUnpiratorServerClient({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
});

export default async function ClassPage({ params }) {
  // YOUR APP: load the video the same way you already do today.
  const lesson = await db.lesson.findUnique({
    where: { id: params.id },
  });

  // YOUR APP decides which fields map to Unpirator.
  // lesson.id and lesson.privateVideoUrl are examples from YOUR database.
  const { playbackRef } = await unpirator.upsertPlaybackAsset({
    siteId: process.env.UNPIRATOR_SITE_ID,
    externalContentId: String(lesson.id),
    title: lesson.title,
    provider: "hls",
    sourceUrl: lesson.privateVideoUrl,
    allowedHosts: ["media.example.com"],
    providerConfig: {},
  });

  // Only playbackRef crosses into the rendered player.
  return <LessonVideo playbackRef={playbackRef} />;
}`,
    routeLabel: "app/api/unpirator/playback/route.js",
    route: `import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";
import { auth } from "@/auth";

export const runtime = "nodejs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,

  // YOUR APP: replace this with your real authentication.
  resolveViewer: async () => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.email) {
      const error = new Error("Sign in required");
      error.status = 401;
      throw error;
    }

    return {
      id: session.user.id, // stays inside YOUR authorization callback
      email: session.user.email, // trusted identity forwarded to Unpirator
    };
  },

  // YOUR APP: replace this with your real course/subscription check.
  authorizePlayback: async ({ body, viewer }) => {
    const lesson = await db.lesson.findFirst({
      where: { unpiratorPlaybackRef: body.playbackRef },
    });

    if (!lesson) return false;

    return hasCourseAccess(viewer.id, lesson.courseId);
  },
});`,
    playerLabel: "components/lesson-video.jsx",
    player: `"use client";

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
  },

  react: {
    label: "React + Node backend",
    short: "React",
    packages: "@unpirator/react",
    install: "npm install @unpirator/react@0.2.0",
    serverLabel: "Your existing server/controller",
    server: `// YOUR APP SERVER — Express example.
// The browser must never receive video.privateUrl or UNPIRATOR_API_KEY.

app.get("/api/classes/:id", async (req, res) => {
  const video = await db.videos.findById(req.params.id);

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
        externalContentId: String(video.id),
        title: video.title,
        provider: video.provider,
        sourceUrl: video.privateUrl,
        allowedHosts: video.allowedHosts || [],
        providerConfig: video.providerConfig || {},
      }),
    },
  );

  if (!response.ok) {
    return res.status(response.status).json(await response.json());
  }

  const { playbackRef } = await response.json();

  // Return the data your page needs, but never the private source URL.
  return res.json({
    id: video.id,
    title: video.title,
    playbackRef,
  });
});`,
    routeLabel: "server/routes/playback.js",
    route: `app.post("/api/unpirator/playback", async (req, res) => {
  // YOUR APP: resolve the signed-in user from your real session/auth system.
  const viewer = await getLoggedInUser(req);
  if (!viewer?.email) {
    return res.status(401).json({ error: "Sign in required" });
  }

  // YOUR APP: map playbackRef back to your content, then check entitlement.
  const video = await db.videos.findOne({
    unpiratorPlaybackRef: req.body.playbackRef,
  });

  const allowed =
    video && (await hasCourseAccess(viewer.id, video.courseId));

  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const upstream = await fetch(
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
        email: viewer.email,
        deviceId: req.body.deviceId,
        viewerIp: String(req.headers["x-forwarded-for"] || req.ip || "")
          .split(",")[0].trim(),
        viewerUserAgent: String(req.headers["user-agent"] || ""),
        client: req.body.client || {},
      }),
    },
  );

  const body = await upstream.json();

  // Session responses contain short-lived authorization material.
  // no-store prevents browsers/CDNs/proxies from caching and replaying it.
  res.set("Cache-Control", "no-store");
  return res.status(upstream.status).json(body);
});`,
    playerLabel: "components/LessonVideo.jsx",
    player: `import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ playbackRef }) {
  return (
    <UnpiratorPlayer
      playbackRef={playbackRef}
      endpoint="/api/unpirator/playback"
    />
  );
}`,
  },

  php: {
    label: "PHP / Laravel",
    short: "PHP",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.2.0">
</script>`,
    serverLabel: "Controller that already loads your class",
    server: `// YOUR APP: load the video from your own DB as usual.
$lesson = Lesson::findOrFail($id);

$payload = [
  'siteId' => env('UNPIRATOR_SITE_ID'),
  'externalContentId' => (string) $lesson->id,
  'title' => $lesson->title,
  'provider' => 'hls',
  'sourceUrl' => $lesson->private_video_url,
  'allowedHosts' => ['media.example.com'],
  'providerConfig' => new stdClass(),
];

$ch = curl_init(env('UNPIRATOR_API_URL') . '/v1/playback/assets/upsert');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . env('UNPIRATOR_API_KEY'),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode($payload),
]);

$result = json_decode(curl_exec($ch), true);
$playbackRef = $result['playbackRef'];

// Render the page with $playbackRef.
// Do NOT render $lesson->private_video_url into HTML.`,
    routeLabel: "routes/web.php / controller",
    route: `Route::post('/api/unpirator/playback', function (Request $request) {
    $viewer = Auth::user();
    if (! $viewer || ! $viewer->email) {
        return response()->json(['error' => 'Sign in required'], 401);
    }

    // YOUR APP: find the content and check course/subscription access.
    $lesson = Lesson::where(
        'unpirator_playback_ref',
        $request->input('playbackRef')
    )->first();

    if (! $lesson || ! hasCourseAccess($viewer->id, $lesson->course_id)) {
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
            'email' => strtolower($viewer->email),
            'deviceId' => $request->input('deviceId'),
            'viewerIp' => $request->ip(),
            'viewerUserAgent' => (string) $request->userAgent(),
        ]),
    ]);

    $session = json_decode(curl_exec($ch), true);

    return response()
        ->json($session)
        ->header('Cache-Control', 'no-store');
});`,
    playerLabel: "resources/views/lesson.blade.php",
    player: `<unpirator-player
  playback-ref="{{ $playbackRef }}"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
  },

  django: {
    label: "Django / Flask",
    short: "Django",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.2.0">
</script>`,
    serverLabel: "View/controller that already loads your class",
    server: `# YOUR APP: load your existing video record.
lesson = Lesson.objects.get(pk=lesson_id)

payload = {
    "siteId": os.environ["UNPIRATOR_SITE_ID"],
    "externalContentId": str(lesson.id),
    "title": lesson.title,
    "provider": "hls",
    "sourceUrl": lesson.private_video_url,
    "allowedHosts": ["media.example.com"],
    "providerConfig": {},
}

response = requests.post(
    f"{os.environ['UNPIRATOR_API_URL']}/v1/playback/assets/upsert",
    json=payload,
    headers={
        "Authorization":
          f"Bearer {os.environ['UNPIRATOR_API_KEY']}"
    },
    timeout=10,
)
response.raise_for_status()

playback_ref = response.json()["playbackRef"]

# Render playback_ref into the template.
# Never render lesson.private_video_url into the browser.`,
    routeLabel: "views.py",
    route: `def unpirator_playback(request):
    viewer = getattr(request, "user", None)
    if not viewer or not viewer.is_authenticated or not viewer.email:
        return JsonResponse({"error": "Sign in required"}, status=401)

    body = json.loads(request.body)

    # YOUR APP: resolve content and check entitlement.
    lesson = Lesson.objects.filter(
        unpirator_playback_ref=body.get("playbackRef")
    ).first()

    if not lesson or not has_course_access(viewer.id, lesson.course_id):
        return JsonResponse({"error": "Forbidden"}, status=403)

    resp = requests.post(
        f"{os.environ['UNPIRATOR_API_URL']}/v1/playback/sessions",
        json={
            "siteId": os.environ["UNPIRATOR_SITE_ID"],
            "assetId": body.get("playbackRef"),
            "email": viewer.email.lower(),
            "deviceId": body.get("deviceId"),
            "viewerIp": request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
              or request.META.get("REMOTE_ADDR", ""),
            "viewerUserAgent": request.META.get("HTTP_USER_AGENT", ""),
        },
        headers={
            "Authorization":
              f"Bearer {os.environ['UNPIRATOR_API_KEY']}"
        },
        timeout=10,
    )

    response = JsonResponse(resp.json(), status=resp.status_code)
    response["Cache-Control"] = "no-store"
    return response`,
    playerLabel: "templates/lesson.html",
    player: `<unpirator-player
  playback-ref="{{ playback_ref }}"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
  },

  html: {
    label: "HTML + server endpoint",
    short: "HTML",
    packages: "@unpirator/web-component",
    install: `<script type="module"
  src="https://esm.sh/@unpirator/web-component@0.2.0">
</script>`,
    serverLabel: "Any server-side language you control",
    server: `// Static HTML alone cannot hold UNPIRATOR_API_KEY securely.
// Run this on a backend you control.

const video = await YOUR_DATABASE.loadVideo(contentId);

const response = await fetch(
  \`\${UNPIRATOR_API_URL}/v1/playback/assets/upsert\`,
  {
    method: "POST",
    headers: {
      authorization: \`Bearer \${UNPIRATOR_API_KEY}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      siteId: UNPIRATOR_SITE_ID,
      externalContentId: String(video.id),
      title: video.title,
      provider: video.provider,
      sourceUrl: video.privateUrl,
      allowedHosts: video.allowedHosts || [],
      providerConfig: video.providerConfig || {},
    }),
  },
);

const { playbackRef } = await response.json();

// Render playbackRef into your HTML template.
// Never render video.privateUrl.`,
    routeLabel: "POST /api/unpirator/playback on your backend",
    route: `// The player calls this endpoint automatically after it mounts.
// Your server must:
// 1) identify the logged-in user,
// 2) verify access to the requested content,
// 3) call /v1/playback/sessions with the server-only API key,
// 4) return the response with Cache-Control: no-store.`,
    playerLabel: "lesson.html",
    player: `<unpirator-player
  playback-ref="{{ PLAYBACK_REF_FROM_YOUR_SERVER }}"
  endpoint="/api/unpirator/playback"
  title="Lesson video">
</unpirator-player>`,
  },
};

const STACK_ORDER = ["nextjs", "react", "php", "django", "html"];

const sections = [
  ["start", "Start here"],
  ["journey", "Watch the full journey"],
  ["integration", "Integrate your stack"],
  ["request", "What the player sends"],
  ["packages", "Packages"],
  ["setup", "Dashboard setup"],
  ["playback-ref", "About playbackRef"],
  ["security", "Security rules"],
  ["errors", "Errors"],
];

const packages = [
  ["@unpirator/react", "React player", "UI component for React and Next.js."],
  [
    "@unpirator/integration-nextjs",
    "Next.js server bridge",
    "Server helpers for asset upsert and protected session creation.",
  ],
  [
    "@unpirator/web-component",
    "Universal player",
    "Custom element for PHP, Laravel, Django, Flask and HTML templates.",
  ],
  [
    "@unpirator/sdk-js",
    "Browser SDK",
    "Device identity and session/bootstrap helpers for custom integrations.",
  ],
  [
    "@unpirator/player",
    "Playback runtime",
    "Low-level grants, refresh, heartbeat, HLS and watermark runtime.",
  ],
];

const errors = [
  ["400 · VALIDATION_ERROR", "A required field is missing or has the wrong type."],
  ["401 · UNAUTHORIZED", "The server API key is missing, expired or incorrect."],
  ["403 · FORBIDDEN", "Site, domain, policy or viewer access was rejected."],
  ["404 · NOT_FOUND", "The site or asset does not exist in this workspace."],
  ["409 · CONNECTION_DISABLED", "The linked provider connection is disabled."],
  ["429 · RATE_LIMIT", "Too many requests. Respect Retry-After."],
  ["DOMAIN_MISMATCH", "The playback hostname does not match the verified site."],
  ["SOURCE_INVALID", "The source URL/provider configuration could not be used."],
];

const animationSteps = [
  {
    label: "Student enters class",
    caption: "Browser requests the customer's normal class page.",
  },
  {
    label: "Customer server loads video",
    caption: "The server reads the existing video record from the customer's own database.",
  },
  {
    label: "Private source stays out of the browser",
    caption:
      "The source URL remains server-side and is sent only over server-to-server HTTPS to Unpirator.",
  },
  {
    label: "Server calls Unpirator",
    caption:
      "The server sends content ID, title, provider and private source over server-to-server HTTPS.",
  },
  {
    label: "Unpirator returns playbackRef",
    caption: "Unpirator finds or updates the asset and returns a browser-safe reference.",
  },
  {
    label: "Page renders the player",
    caption: "Only playbackRef reaches the custom player tag/component.",
  },
  {
    label: "Player requests a session",
    caption:
      "After mount, the player automatically POSTs playbackRef + device data to the customer's playback endpoint.",
  },
  {
    label: "Customer authorizes the viewer",
    caption: "The customer server checks login, course access and subscription state.",
  },
  {
    label: "Protected playback starts",
    caption: "Unpirator returns a short-lived session and the player starts protected delivery.",
  },
];

function CodeBlock({ label, children, badge = "COPY" }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : String(children ?? "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be blocked in some embedded browsers.
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
          aria-label={`Copy ${label}`}
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
    <div
      className={`stack-picker${dense ? " stack-picker-dense" : ""}`}
      role="tablist"
      aria-label="Choose your stack"
    >
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

function Responsibility({ type, title, children }) {
  return (
    <div className={`docs-responsibility docs-responsibility-${type}`}>
      <span>
        {type === "customer" ? "YOUR APP" : type === "automatic" ? "AUTOMATIC" : "UNPIRATOR"}
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function JourneyAnimation() {
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
    },
    [],
  );

  function reset() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setRunning(false);
    setStep(-1);
  }

  function play() {
    reset();
    setRunning(true);

    animationSteps.forEach((_, index) => {
      const timer = window.setTimeout(
        () => {
          setStep(index);
          if (index === animationSteps.length - 1) {
            const doneTimer = window.setTimeout(() => setRunning(false), 1200);
            timers.current.push(doneTimer);
          }
        },
        1250 * index + 250,
      );

      timers.current.push(timer);
    });
  }

  const active = Math.max(step, 0);

  return (
    <div className={`journey-demo journey-step-${active}`}>
      <div className="journey-toolbar">
        <div>
          <span className="journey-eyebrow">INTERACTIVE ARCHITECTURE</span>
          <h3>Watch one student open one existing class.</h3>
          <p>This is the complete path — from your database record to the first protected frame.</p>
        </div>
        <div className="journey-actions">
          <button type="button" className="primary-cta" onClick={play} disabled={running}>
            <Play size={15} /> {running ? "Running…" : step >= 0 ? "Replay" : "Start animation"}
          </button>
          <button type="button" className="text-cta" onClick={reset}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      <div className="journey-stage" aria-live="polite">
        <div className="journey-browser">
          <div className="journey-browser-top">
            <span>
              <i />
              <i />
              <i />
            </span>
            <div>academy.example.com/classes/physics-12</div>
          </div>

          <div className="journey-browser-page">
            <div className="journey-course-head">
              <div className="journey-avatar">
                <UserRound size={16} />
              </div>
              <div>
                <small>PHYSICS · CLASS 12</small>
                <strong>Wave motion & oscillation</strong>
              </div>
            </div>

            <div
              className={`journey-video ${step >= 5 ? "is-player" : ""} ${step >= 8 ? "is-playing" : ""}`}
            >
              {step < 5 ? (
                <>
                  <Video size={28} />
                  <span>{step < 0 ? "Open this class" : "Loading class…"}</span>
                </>
              ) : (
                <>
                  <div className="journey-player-bar">
                    <ShieldCheck size={15} /> UNPIRATOR PLAYER
                  </div>
                  <div className="journey-player-center">
                    {step >= 8 ? <Play size={28} fill="currentColor" /> : <LockKeyhole size={28} />}
                    <span>
                      {step >= 8 ? "Protected playback started" : "Requesting protected session…"}
                    </span>
                  </div>
                  <div className="journey-player-progress">
                    <i className={step >= 8 ? "is-playing" : ""} />
                  </div>
                </>
              )}
            </div>

            <div className="journey-browser-data">
              <span className={step >= 5 ? "is-on" : ""}>
                playbackRef: <code>pb_7dk…91q</code>
              </span>
              <span className="is-secret">
                <EyeOff size={12} /> sourceUrl: never rendered
              </span>
            </div>
          </div>
        </div>

        <div className={`journey-backend ${step >= 1 ? "is-visible" : ""}`}>
          <div className="journey-panel-head">
            <ServerCog size={17} />
            <span>CUSTOMER SERVER</span>
          </div>

          <div className={`journey-backend-row ${step >= 1 ? "is-active" : ""}`}>
            <Database size={15} />
            <div>
              <strong>Load existing video</strong>
              <code>db.lesson.find("physics-12")</code>
            </div>
          </div>

          <div className={`journey-backend-row private ${step >= 2 ? "is-active" : ""}`}>
            <LockKeyhole size={15} />
            <div>
              <strong>Private fields available here</strong>
              <code>privateVideoUrl = https://media…/master.m3u8</code>
            </div>
          </div>

          <div className={`journey-backend-row ${step >= 6 ? "is-active" : ""}`}>
            <FileCode2 size={15} />
            <div>
              <strong>Automatic player request</strong>
              <code>POST /api/unpirator/playback</code>
            </div>
          </div>

          <div className={`journey-backend-row ${step >= 7 ? "is-active" : ""}`}>
            <ShieldCheck size={15} />
            <div>
              <strong>Authenticate + authorize</strong>
              <code>viewer → course access → allow / deny</code>
            </div>
          </div>
        </div>

        <div className={`journey-unpirator ${step >= 3 ? "is-visible" : ""}`}>
          <div className="journey-panel-head">
            <ShieldCheck size={17} />
            <span>UNPIRATOR</span>
          </div>

          <div className={`journey-unpirator-card ${step >= 3 ? "is-active" : ""}`}>
            <small>SERVER → SERVER</small>
            <strong>Resolve / upsert asset</strong>
            <code>contentId + provider + private source</code>
          </div>

          <div className={`journey-unpirator-card ${step >= 4 ? "is-active" : ""}`}>
            <small>RESPONSE</small>
            <strong>Return playbackRef</strong>
            <code>pb_7dk…91q</code>
          </div>

          <div className={`journey-unpirator-card ${step >= 8 ? "is-active" : ""}`}>
            <small>PROTECTED SESSION</small>
            <strong>Short-lived grant + gateway</strong>
            <code>Cache-Control: no-store</code>
          </div>
        </div>

        <div className={`journey-packet packet-source ${step === 3 ? "is-moving" : ""}`}>
          <LockKeyhole size={12} /> PRIVATE SOURCE
        </div>

        <div className={`journey-packet packet-ref ${step === 4 ? "is-moving" : ""}`}>
          <KeyRound size={12} /> playbackRef
        </div>

        <div className={`journey-packet packet-session ${step === 6 ? "is-moving" : ""}`}>
          <ShieldCheck size={12} /> session request
        </div>
      </div>

      <div className="journey-caption">
        <span>{step < 0 ? "READY" : String(step + 1).padStart(2, "0")}</span>
        <div>
          <strong>{step < 0 ? "Press Start animation" : animationSteps[step].label}</strong>
          <p>
            {step < 0
              ? "Nothing in this demo calls a live customer database. It visualizes the exact production responsibility split."
              : animationSteps[step].caption}
          </p>
        </div>
      </div>

      <div className="journey-legend">
        <span>
          <i className="customer" /> Customer code
        </span>
        <span>
          <i className="unpirator" /> Unpirator
        </span>
        <span>
          <i className="private" /> Private — browser never receives this
        </span>
      </div>
    </div>
  );
}

export function DocsClient() {
  const [stack, setStack] = useState("nextjs");
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
            <BookOpen size={14} /> DEVELOPER DOCUMENTATION · TESTED 0.1.x
          </div>
          <h1>
            Your videos stay yours.
            <br /> Playback stays protected.
          </h1>
          <p>
            Keep source URLs out of the browser. Your server sends them privately to Unpirator, and
            Unpirator handles protected playback.
          </p>

          <div className="hero-stack-picker">
            <span className="hero-stack-label">I&apos;m building with</span>
            <StackPicker stack={stack} onChange={setStack} />
          </div>

          <div className="docs-hero-actions">
            <a href="#integration" className="primary-cta">
              Integrate {s.short} <ArrowRight size={17} />
            </a>
            <a href="#journey" className="text-cta">
              Watch the flow <ArrowUpRight size={17} />
            </a>
          </div>
        </div>

        <div className="docs-terminal" aria-label="Quick installation example">
          <div className="docs-terminal-top">
            <span>
              <i />
              <i />
              <i />
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
            <Check size={17} /> Package installed — continue with the server steps below
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
            <strong>Need workspace values?</strong>
            <p>
              Open your site&apos;s Integration page to copy Site ID, API URL and create a server
              API key.
            </p>
            <Link href="/dashboard/integration">
              Open integration <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>

        <main id="docs-content" className="docs-content">
          <section id="start" className="docs-section docs-overview">
            <div className="docs-kicker">01 · START HERE</div>
            <h2>One class page. Two server calls. No source URL in the browser.</h2>
            <p className="docs-lead">
              You do <strong>not</strong> need to move your existing video library into an Unpirator
              admin panel. Your own database remains the source of truth.
            </p>

            <div className="docs-important-flow">
              <article>
                <span>1</span>
                <ServerCog size={21} />
                <strong>Load your existing video on your server</strong>
                <p>
                  Your server already knows the class ID, title, provider and private source URL.
                </p>
              </article>
              <article>
                <span>2</span>
                <KeyRound size={21} />
                <strong>Send that server-side video data to Unpirator</strong>
                <p>
                  Unpirator finds/updates the asset and returns <code>playbackRef</code>.
                </p>
              </article>
              <article>
                <span>3</span>
                <FileCode2 size={21} />
                <strong>Render only playbackRef into our player</strong>
                <p>The private source URL never enters HTML, React props or browser Network.</p>
              </article>
              <article>
                <span>4</span>
                <ShieldCheck size={21} />
                <strong>The player requests playback automatically</strong>
                <p>
                  Your playback endpoint checks the logged-in user before Unpirator creates a
                  session.
                </p>
              </article>
            </div>

            <div className="docs-callout">
              <LockKeyhole size={20} />
              <div>
                <strong>
                  Important: “lesson”, “video”, “course” and your database functions belong to YOUR
                  application.
                </strong>
                <p>
                  Unpirator does not magically know your <code>lesson.id</code>, source URL or
                  course permissions. The examples below show where your existing app data maps into
                  the integration.
                </p>
              </div>
            </div>

            <div className="docs-responsibility-grid">
              <Responsibility type="customer" title="Your existing application">
                Loads the class/video, knows the private source, knows who the student is and
                decides whether that student can watch.
              </Responsibility>
              <Responsibility type="unpirator" title="Unpirator">
                Registers/resolves the source, returns playbackRef, creates short-lived playback
                sessions and protects media delivery.
              </Responsibility>
              <Responsibility type="automatic" title="The player package">
                Receives playbackRef, creates stable device metadata, calls your playback endpoint
                and handles the protected playback lifecycle.
              </Responsibility>
            </div>
          </section>

          <section id="journey" className="docs-section">
            <div className="docs-kicker">02 · WATCH THE FULL JOURNEY</div>
            <h2>See exactly where every value comes from.</h2>
            <p className="docs-lead">
              This animation follows one student from the moment they enter an existing class page
              until the first protected frame starts. Watch where the private source stops and where
              <code> playbackRef</code> begins.
            </p>
            <JourneyAnimation />
          </section>

          <section id="integration" className="docs-section">
            <div className="docs-kicker">03 · INTEGRATE YOUR STACK</div>
            <h2>Do these three things — in this order.</h2>

            <StackPicker stack={stack} onChange={setStack} dense />

            <div className="docs-step-banner">
              <span>STEP 1 · SERVER-SIDE</span>
              <strong>
                Wherever your app already loads a class/video, send that private video data to
                Unpirator and receive playbackRef.
              </strong>
              <p>
                You choose the file/controller/loader. This runs on your server because the private
                source URL and API key must never enter the browser. Unpirator receives and stores
                the source only on its server side as protected asset metadata.
              </p>
            </div>

            <div className="docs-field-map">
              <div>
                <small>EXAMPLE NAME</small>
                <code>video.id</code>
                <span>→ externalContentId</span>
              </div>
              <div>
                <small>EXAMPLE NAME</small>
                <code>video.privateUrl</code>
                <span>→ sourceUrl</span>
              </div>
              <div>
                <small>UNPIRATOR RETURNS</small>
                <code>playbackRef</code>
                <span>→ pass this to the player</span>
              </div>
            </div>

            <CodeBlock label={s.serverLabel}>{s.server}</CodeBlock>

            <div className="docs-step-banner">
              <span>STEP 2 · SERVER-SIDE SECURITY BOUNDARY</span>
              <strong>
                Create one playback endpoint that authenticates and authorizes the student.
              </strong>
              <p>
                The player calls this endpoint automatically. Any functions such as
                <code> getLoggedInUser</code> or <code>hasCourseAccess</code> are intentionally
                marked as YOUR APP because only your application knows its auth and purchase rules.
              </p>
            </div>

            <CodeBlock label={s.routeLabel}>{s.route}</CodeBlock>

            <div className="docs-note">
              The Next.js helper is deny-by-default: <code>resolveViewer</code> and
              <code>authorizePlayback</code> are required. <code>resolveViewer</code> must return
              the authenticated viewer email; protected playback does not accept a browser-chosen
              guest identity.
            </div>

            <div className="docs-step-banner">
              <span>STEP 3 · BROWSER</span>
              <strong>
                Render the player with playbackRef — never with the private source URL.
              </strong>
              <p>
                The <code>playbackRef</code> came from Step 1. After mount, the player automatically
                calls the endpoint from Step 2.
              </p>
            </div>

            <CodeBlock label={s.playerLabel}>{s.player}</CodeBlock>
          </section>

          <section id="request" className="docs-section">
            <div className="docs-kicker">04 · WHAT THE PLAYER SENDS</div>
            <h2>No browser-trusted identity. Here is where each field comes from.</h2>

            <div className="docs-origin-table">
              <div>
                <code>playbackRef</code>
                <strong>From Step 1</strong>
                <p>Unpirator returns it after your server resolves/upserts the video.</p>
              </div>
              <div>
                <code>deviceId</code>
                <strong>Required · generated automatically</strong>
                <p>
                  The official SDK generates a random stable UUID. It is not a hardware fingerprint.
                  It links the authenticated email to the device/session history and enables device
                  controls.
                </p>
              </div>
              <div>
                <code>email</code>
                <strong>Required · resolved by YOUR server</strong>
                <p>
                  Your backend reads the authenticated viewer email from its own trusted session or
                  verified access token. The browser never supplies a trusted viewer email.
                </p>
              </div>
              <div>
                <code>viewerIp / viewerUserAgent</code>
                <strong>Derived by YOUR server</strong>
                <p>
                  Forward the incoming viewer request context so Security Center shows the viewer
                  device/network context instead of your Node/PHP/Python server request.
                </p>
              </div>
              <div>
                <code>siteId</code>
                <strong>From server environment</strong>
                <p>The verified Unpirator site ID copied from your dashboard.</p>
              </div>
            </div>

            <CodeBlock label="Automatic browser request">{`POST /api/unpirator/playback
Content-Type: application/json

{
  "playbackRef": "pb_7dk...91q",
  "deviceId": "device_...",
  "client": {
    "browser": "Chrome",
    "os": "Windows"
  }
}`}</CodeBlock>

            <div className="docs-note">
              Your server adds the trusted <code>email</code>, <code>siteId</code>, viewer request
              context and server-only API key before calling Unpirator. The player supplies the
              required random stable <code>deviceId</code>. Any email included in browser JSON must
              be ignored.
            </div>

            <div className="docs-callout">
              <LockKeyhole size={20} />
              <div>
                <strong>Why Cache-Control: no-store?</strong>
                <p>
                  A playback-session response contains short-lived authorization material.{" "}
                  <code>no-store</code>
                  tells browsers, proxies and CDNs not to cache and reuse that response.
                </p>
              </div>
            </div>
          </section>

          <section id="packages" className="docs-section">
            <div className="docs-kicker">05 · PACKAGES</div>
            <h2>Install the layer made for your stack.</h2>

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

          <section id="setup" className="docs-section">
            <div className="docs-kicker">06 · DASHBOARD SETUP</div>
            <h2>Prepare the workspace once.</h2>

            <div className="docs-checklist">
              {[
                ["Create a site", "Use the exact production hostname where the player will run."],
                ["Verify the hostname", "Complete one of the offered verification methods."],
                [
                  "Enable your provider",
                  "Configure the provider/connection used by your video source.",
                ],
                [
                  "Create a server API key",
                  "Keep it in server-only secret storage. Never expose it with NEXT_PUBLIC_ or VITE_.",
                ],
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

          <section id="playback-ref" className="docs-section">
            <div className="docs-kicker">07 · ABOUT PLAYBACKREF</div>
            <h2>Where it comes from, where it goes, and what it is not.</h2>

            <div className="docs-ref-line">
              <span>Your DB video</span>
              <ArrowRight size={16} />
              <span>Your server</span>
              <ArrowRight size={16} />
              <span>Unpirator asset resolve</span>
              <ArrowRight size={16} />
              <strong>playbackRef</strong>
              <ArrowRight size={16} />
              <span>Player</span>
            </div>

            <div className="docs-security-grid">
              <div>
                <ShieldCheck size={18} />
                <span>It is returned by Unpirator after server-side asset resolution.</span>
              </div>
              <div>
                <ShieldCheck size={18} />
                <span>It is safe to pass to the authorized playback page.</span>
              </div>
              <div>
                <ShieldCheck size={18} />
                <span>
                  It does not contain the private source URL or provider Authorization header.
                </span>
              </div>
              <div>
                <LockKeyhole size={18} />
                <span>
                  It is not the permission check. Your server still authorizes the logged-in viewer
                  for every session.
                </span>
              </div>
            </div>
          </section>

          <section id="security" className="docs-section">
            <div className="docs-kicker">08 · SECURITY RULES</div>
            <h2>The four rules that should never be optional.</h2>

            <ol className="docs-numbered">
              <li>
                Keep <code>UNPIRATOR_API_KEY</code> on your server only.
              </li>
              <li>Keep the original private source URL on your server only.</li>
              <li>Authenticate and authorize the viewer before each protected playback session.</li>
              <li>
                Return playback-session responses with <code>Cache-Control: no-store</code>.
              </li>
            </ol>
          </section>

          <section id="errors" className="docs-section">
            <div className="docs-kicker">09 · ERRORS & DIAGNOSIS</div>
            <h2>Find the failing boundary quickly.</h2>

            <div className="docs-errors">
              {errors.map(([code, meaning]) => (
                <div key={code}>
                  <code>{code}</code>
                  <p>{meaning}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="docs-finish">
            <div>
              <TerminalSquare size={25} />
              <div>
                <span>READY TO INTEGRATE?</span>
                <h2>Connect your first existing class.</h2>
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
        <p>Developer documentation · packages 0.1.x</p>
        <a href="https://www.npmjs.com/org/unpirator" target="_blank" rel="noreferrer">
          npm packages <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
