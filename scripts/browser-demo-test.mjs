// Acceptance gate for protected playback (the-unpirator).
// Real Chrome (Playwright) against the DEPLOYED demo. Nothing counts as done
// until this passes.
//
// Per section (found via globalThis.__unpiratorPlayers, matched by state.mode):
//   mount time (info), time-to-first-frame, seek-resume +60s / +300s,
//   N-minute soak: stalls, "Playback interrupted", unexpected pauses.
// Sections run ONE AT A TIME; the other players are paused so they do not
// steal tunnel bandwidth (a paused player only buffers ~20s ahead, then idles).
//
// Usage (repo root, git-bash):
//   node scripts/browser-demo-test.mjs                  # full gate, 10-min soak
//   node scripts/browser-demo-test.mjs --minutes=1      # smoke run (INCOMPLETE by design)
//   node scripts/browser-demo-test.mjs --only=native    # substring match on label
//   node scripts/browser-demo-test.mjs --exclude=ab12cd34   # skip e.g. the dead Bunny asset
//   flags: --url=… --mount-wait=90 --headed
// Exit code: 0 PASS, 1 FAIL, 2 INCOMPLETE (skips/partial soak), 3 harness could not find players.
import { chromium } from "file:///F:/projects/the-unpirator/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const csv = (value) =>
  String(value)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const DEMO_URL = opt("url", "https://theunpirator-demo.pages.dev");
const SOAK_MINUTES = Number(opt("minutes", "10"));
const MOUNT_WAIT_MS = Number(opt("mount-wait", "90")) * 1000;
const ONLY = csv(opt("only", ""));
const EXCLUDE = csv(opt("exclude", ""));
const HEADED = args.includes("--headed");
const SOLO = args.includes("--solo"); // destroy sibling players (stops their pump/heartbeat); needs --only=<one section>

const LIMITS = { ttfMs: 6000, seekMs: 5000, stallMs: 2000, maxStalls: 3, gateMinutes: 10 };
const EXPECTED_MODES = ["native", "protected_hls", "protected_segments"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secs = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

// ---------- collectors (attributed to the section currently under test) ----------
let currentSection = "(mount)";
const logs = [];
const issues = [];
const pageErrors = [];
const requests = [];
const inflight = new Map();
const stripQuery = (url) => url.split("?")[0]; // never record ticket/token query strings
const classify = (url) => {
  const m =
    /\/v\/([0-9a-f-]{36})\/(integrity|ticket|bootstrap|chunk\/(?:video|audio)\/\d+\/\d+)(?:\?|$)/i.exec(
      url,
    );
  return m ? { kind: m[2].split("/")[0], detail: m[2], asset: m[1].slice(0, 8) } : null;
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: !HEADED,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

page.on("console", (msg) => {
  const text = msg.text();
  const type = msg.type();
  const tagged = text.includes("unpirator");
  if (type === "error" || (tagged && (type === "warning" || type === "info")))
    logs.push({ t: Date.now(), section: currentSection, type, text: text.slice(0, 240) });
});
page.on("pageerror", (err) =>
  pageErrors.push({ t: Date.now(), section: currentSection, text: String(err?.stack || err).slice(0, 400) }),
);
page.on("request", (req) => {
  const c = classify(req.url());
  if (c) inflight.set(req, { ...c, section: currentSection, start: Date.now() });
});
page.on("requestfinished", async (req) => {
  const info = inflight.get(req);
  if (!info) return;
  inflight.delete(req);
  const res = await req.response().catch(() => null);
  const serverMs = Number((/gateway;dur=(\d+)/.exec(res?.headers()["server-timing"] || "") || [])[1]);
  requests.push({
    ...info,
    end: Date.now(),
    status: res ? res.status() : 0,
    serverMs: Number.isFinite(serverMs) ? serverMs : null,
  });
});
page.on("requestfailed", (req) => {
  const failure = req.failure()?.errorText || "";
  const info = inflight.get(req);
  if (info) {
    inflight.delete(req);
    requests.push({ ...info, end: Date.now(), status: 0, failed: failure });
  }
  if (!/ERR_ABORTED/.test(failure))
    issues.push({ t: Date.now(), section: currentSection, text: `REQFAIL ${req.method()} ${stripQuery(req.url()).slice(0, 110)} ${failure}` });
});
page.on("response", (res) => {
  if (res.status() >= 400)
    issues.push({ t: Date.now(), section: currentSection, text: `HTTP ${res.status()} ${stripQuery(res.url()).slice(0, 130)}` });
});

// ---------- in-page harness: everything that touches the closed shadow runs here ----------
await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
const navAt = Date.now();

await page.evaluate(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const unwrap = (entry) => entry?.player ?? entry?.instance ?? entry;
  const list = () => Array.from(globalThis.__unpiratorPlayers ?? []).map(unwrap);
  const videoOf = (p) => p?.video ?? p?.protected?.video ?? null;
  const modeOf = (p) => p?.state?.mode ?? "unknown";
  const assetOf = (p) =>
    (/\/v\/([0-9a-f-]{36})\//i.exec(p?.state?.playbackUrl || "") || [])[1]?.slice(0, 8) ?? "";
  const headingOf = (p) => {
    let node = p?.root;
    for (let i = 0; node && i < 12; i += 1) {
      const card = node.closest?.("section, article, .card");
      const heading = card?.querySelector?.("h1, h2, h3");
      if (heading) return heading.textContent.trim().slice(0, 40);
      node = node.getRootNode?.()?.host ?? null;
    }
    return "";
  };
  const errorOf = (p) => {
    const text = p?.errorMessage?.textContent?.trim();
    if (text) return text;
    if (p?.terminalFailure) return "terminalFailure";
    if (p?.protected?.destroyed) return "runtime destroyed";
    const v = videoOf(p);
    return v?.error ? `video.error code ${v.error.code}` : "";
  };
  const inRanges = (buffered, t, margin) => {
    for (let i = 0; i < buffered.length; i += 1)
      if (buffered.start(i) <= t && buffered.end(i) >= t + margin) return true;
    return false;
  };
  const aheadOf = (v) => {
    for (let i = 0; i < v.buffered.length; i += 1)
      if (v.buffered.start(i) <= v.currentTime + 0.05 && v.buffered.end(i) > v.currentTime)
        return v.buffered.end(i) - v.currentTime;
    return 0;
  };

  const G = { p: null, v: null, m: null };

  function startMonitor(v, p) {
    const m = {
      stalls: [],
      errors: [],
      pauses: 0,
      pausedNoted: false,
      suppress: false,
      open: null,
      last: v.currentTime,
      lastAdvance: performance.now(),
    };
    m.timer = setInterval(() => {
      const now = performance.now();
      const t = v.currentTime;
      const advancing = Math.abs(t - m.last) > 0.01;
      m.last = t;
      const err = errorOf(p);
      if (err && !m.errors.some((e) => e.text === err))
        m.errors.push({ text: err, at: new Date().toISOString() });
      if (m.suppress) {
        m.open = null;
        m.lastAdvance = now;
        return;
      }
      if (v.paused || v.ended) {
        if (v.paused && !v.ended && !m.pausedNoted) {
          m.pauses += 1; // nobody pauses in this harness: a pause is the player's doing
          m.pausedNoted = true;
        }
        m.open = null;
        m.lastAdvance = now;
        return;
      }
      m.pausedNoted = false;
      if (advancing) {
        if (m.open !== null)
          m.stalls.push({ durMs: Math.round(now - m.open), atEpoch: Date.now(), atT: Number(t.toFixed(1)) });
        m.open = null;
        m.lastAdvance = now;
      } else if (m.open === null && now - m.lastAdvance > 500) {
        m.open = m.lastAdvance; // stall duration counts from the last frame that advanced
      }
    }, 100);
    return m;
  }

  function stopMonitor() {
    const m = G.m;
    if (!m) return { stalls: [], pauses: 0, errors: [] };
    clearInterval(m.timer);
    if (m.open !== null)
      m.stalls.push({ durMs: Math.round(performance.now() - m.open), atEpoch: Date.now(), unresolved: true });
    G.m = null;
    return { stalls: m.stalls, pauses: m.pauses, errors: m.errors };
  }

  window.__gate = {
    hookInfo() {
      const hook = globalThis.__unpiratorPlayers;
      const first = list()[0];
      return {
        type: typeof hook,
        isArray: Array.isArray(hook),
        length: hook?.length ?? hook?.size ?? null,
        firstKeys: first ? Object.keys(first).slice(0, 30) : [],
      };
    },
    describe() {
      return list().map((p, index) => ({
        index,
        mode: modeOf(p),
        provider: p?.state?.attestation?.provider ?? null,
        asset: assetOf(p),
        heading: headingOf(p),
        hasVideo: !!videoOf(p),
        error: errorOf(p),
      }));
    },
    pageCards() {
      return Array.from(document.querySelectorAll("unpirator-player")).map((el) => {
        const card = el.closest("section") || el.parentElement;
        return {
          heading: (card?.querySelector("h1, h2, h3")?.textContent || "").trim().slice(0, 40),
          text: (card?.querySelector("pre, .err, .ok, [class*=err]")?.textContent || "").trim().slice(0, 160),
        };
      });
    },
    select(index, solo) {
      stopMonitor();
      const players = list();
      players.forEach((p, i) => {
        if (i === index) return;
        const v = videoOf(p);
        if (solo) {
          // pause alone does not stop a sibling's pump/heartbeat/integrity traffic
          try { p.destroy(); } catch {}
        } else if (v) {
          v.muted = true;
          v.pause();
        }
      });
      G.p = players[index];
      G.v = videoOf(G.p);
      if (!G.v) return { ok: false };
      G.m = startMonitor(G.v, G.p);
      return { ok: true };
    },
    // Time from play() to first frame: currentTime > 0 && readyState >= 2 (and actually playing).
    async play(timeoutMs) {
      const v = G.v;
      v.muted = true;
      const t0 = performance.now();
      let playError = null;
      v.play().catch((e) => {
        playError = e?.name || String(e);
      });
      while (performance.now() - t0 < timeoutMs) {
        if (v.currentTime > 0.05 && v.readyState >= 2 && !v.paused)
          return { ms: Math.round(performance.now() - t0), playError };
        await sleep(25);
      }
      return { ms: null, playError, readyState: v.readyState, currentTime: v.currentTime };
    },
    // Resume = until !seeking && readyState>=3 && currentTime >= target+0.1 (includes ~0.1s of playback).
    async seek({ delta, absolute, timeoutMs = 60000 }) {
      const v = G.v;
      const duration = v.duration;
      const from = v.currentTime;
      const target = absolute ?? from + delta;
      if (!Number.isFinite(duration) || target > duration - 10)
        return { skipped: `target ${target.toFixed(0)}s too close to duration ${Number.isFinite(duration) ? duration.toFixed(0) : duration}s` };
      const bufferedHit = inRanges(v.buffered, target, 2);
      G.m.suppress = true;
      const t0 = performance.now();
      const epoch = Date.now();
      let seekedMs = null;
      v.addEventListener(
        "seeked",
        () => {
          seekedMs ??= Math.round(performance.now() - t0);
        },
        { once: true },
      );
      v.currentTime = target;
      if (v.paused) v.play().catch(() => {});
      let resumeMs = null;
      while (performance.now() - t0 < timeoutMs) {
        if (!v.seeking && v.readyState >= 3 && !v.paused && v.currentTime >= target + 0.1) {
          resumeMs = Math.round(performance.now() - t0);
          break;
        }
        await sleep(25);
      }
      G.m.suppress = false;
      G.m.last = v.currentTime;
      G.m.lastAdvance = performance.now();
      return { from: Number(from.toFixed(1)), target: Number(target.toFixed(1)), bufferedHit, seekedMs, resumeMs, epoch, error: resumeMs == null ? errorOf(G.p) : "" };
    },
    status() {
      const v = G.v;
      return {
        t: Number(v.currentTime.toFixed(1)),
        dur: Number.isFinite(v.duration) ? Math.round(v.duration) : null,
        rs: v.readyState,
        paused: v.paused,
        ended: v.ended,
        ahead: Number(aheadOf(v).toFixed(1)),
        w: v.videoWidth,
        stalls: G.m?.stalls.length ?? 0,
        stalledNow: G.m?.open != null,
        error: errorOf(G.p),
      };
    },
    stopMonitor,
  };
});
const call = (fn, ...callArgs) => page.evaluate(([f, a]) => window.__gate[f](...a), [fn, callArgs]);

// ---------- wait for the players to mount (BotGuard makes YouTube slow) ----------
const firstSeen = new Map(); // "mode|asset" -> ms since navigation
let described = [];
let lastChange = Date.now();
while (Date.now() - navAt < MOUNT_WAIT_MS) {
  described = await call("describe");
  for (const d of described) {
    const key = `${d.mode}|${d.asset}`;
    if (d.hasVideo && !firstSeen.has(key)) {
      firstSeen.set(key, Date.now() - navAt);
      lastChange = Date.now();
    }
  }
  const haveAll = EXPECTED_MODES.every((m) => described.some((d) => d.mode === m && d.hasVideo));
  if (haveAll && Date.now() - lastChange > 10_000) break; // stable for 10s, nothing else mounting
  await sleep(500);
}
described = await call("describe");

const labelOf = (d) => `${d.mode}${d.provider === "youtube" ? "/youtube" : ""} ${d.asset}`.trim();
let targets = described
  .filter((d) => d.hasVideo && EXPECTED_MODES.includes(d.mode))
  .map((d) => ({ ...d, label: labelOf(d), mountMs: firstSeen.get(`${d.mode}|${d.asset}`) ?? null }));
const haystack = (t) => `${t.label} ${t.heading}`.toLowerCase();
if (ONLY.length) targets = targets.filter((t) => ONLY.some((o) => haystack(t).includes(o)));
if (EXCLUDE.length) targets = targets.filter((t) => !EXCLUDE.some((o) => haystack(t).includes(o)));

if (SOLO && targets.length !== 1) {
  console.log(`--solo needs exactly one section (use --only=...); matched: ${targets.map((t) => t.label).join(" | ") || "none"}`);
  await browser.close();
  process.exit(3);
}

if (!targets.length) {
  console.log("HARNESS: no testable players found. Hook info + described players:");
  console.log(JSON.stringify({ hook: await call("hookInfo"), described, cards: await call("pageCards") }, null, 1));
  await browser.close();
  process.exit(3);
}
console.log(`Players mounted: ${described.map((d) => `${labelOf(d)}${d.hasVideo ? "" : " (no video)"}${d.error ? ` ERR:${d.error}` : ""}`).join(" | ")}`);
console.log(`Testing: ${targets.map((t) => t.label).join(" | ")}  (soak ${SOAK_MINUTES} min each)\n`);

// ---------- per-seek request breakdown: where did the resume time go? ----------
function summarizeSeek(label, seek) {
  if (!seek?.epoch) return null;
  const asset = label.split(" ").pop(); // label ends with the 8-char asset id
  const from = seek.epoch - 100;
  const to = seek.epoch + (seek.resumeMs ?? 60_000) + 500;
  const inWindow = requests.filter((r) => r.section === label && r.start >= from && r.start <= to);
  const own = inWindow.filter((r) => r.asset === asset);
  const out = {
    own: {},
    denied: own
      .filter((r) => r.status >= 400 || r.failed)
      .map((r) => `${r.detail} ${r.status || r.failed}@${r.start - seek.epoch}ms`),
    othersIntegrity: inWindow.filter((r) => r.asset !== asset && r.kind === "integrity").length,
  };
  for (const kind of ["integrity", "ticket", "chunk"]) {
    const rows = own.filter((r) => r.kind === kind).sort((a, b) => a.start - b.start);
    if (!rows.length) continue;
    out.own[kind] = {
      n: rows.length,
      firstAtMs: rows[0].start - seek.epoch,
      firstDurMs: rows[0].end - rows[0].start,
      firstServerMs: rows[0].serverMs,
      firstStatus: rows[0].status,
      maxDurMs: Math.max(...rows.map((r) => r.end - r.start)),
      lastEndAtMs: Math.max(...rows.map((r) => r.end)) - seek.epoch,
    };
  }
  return out;
}

async function runSection(target) {
  const label = target.label;
  currentSection = label;
  const sec = {
    label,
    mode: target.mode,
    asset: target.asset,
    mountMs: target.mountMs,
    startedAt: new Date().toISOString(),
    seeks: [],
    loopSeeks: [],
    notes: [],
    soakSeconds: 0,
    soakAborted: false,
  };
  try {
    await call("select", target.index, SOLO);
    const ttf = await call("play", 30_000);
    sec.ttfMs = ttf.ms;
    sec.playError = ttf.playError;
    if (ttf.ms == null) {
      sec.notes.push(`never reached first frame in 30s (readyState ${ttf.readyState}, t=${ttf.currentTime})`);
      sec.soakAborted = true;
      return sec;
    }
    console.log(`[${label}] first frame ${secs(ttf.ms)}`);
    await sleep(10_000); // let it play so the seeks start from a real playing state

    for (const delta of [60, 300]) {
      const seek = await call("seek", { delta });
      seek.delta = delta;
      if (!seek.skipped) {
        await sleep(8_000);
        seek.path = summarizeSeek(label, seek);
      }
      sec.seeks.push(seek);
      console.log(`[${label}] seek +${delta}s -> ${seek.skipped ? `SKIPPED (${seek.skipped})` : `resume ${secs(seek.resumeMs)}${seek.bufferedHit ? " (was buffered)" : ""}`}`);
    }

    const soakMs = SOAK_MINUTES * 60_000;
    const soakStart = Date.now();
    let lastPrint = 0;
    while (soakMs > 0 && Date.now() - soakStart < soakMs) {
      await sleep(Math.min(10_000, Math.max(0, soakMs - (Date.now() - soakStart))));
      const s = await call("status");
      if (Date.now() - lastPrint >= 30_000) {
        lastPrint = Date.now();
        console.log(`[${label}] +${Math.round((Date.now() - soakStart) / 1000)}s t=${s.t}/${s.dur} ahead=${s.ahead}s stalls=${s.stalls}${s.stalledNow ? " STALLED" : ""}${s.paused ? " PAUSED" : ""}`);
      }
      if (s.error) {
        sec.notes.push(`soak aborted at +${Math.round((Date.now() - soakStart) / 1000)}s: ${s.error}`);
        sec.soakAborted = true;
        break;
      }
      if (s.ended) {
        // Source shorter than the soak: rewind and keep going (measured separately, not a stall).
        const loop = await call("seek", { absolute: 1 });
        sec.loopSeeks.push(loop);
        sec.notes.push("source ended during soak; rewound to start");
      }
    }
    sec.soakSeconds = Math.round((Date.now() - soakStart) / 1000);
    return sec;
  } finally {
    const mon = await call("stopMonitor").catch(() => ({ stalls: [], pauses: 0, errors: [] }));
    sec.stalls = mon.stalls;
    sec.pauses = mon.pauses;
    sec.errors = mon.errors;
    sec.endedAt = new Date().toISOString();
  }
}

function grade(sec) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  add("time-to-first-frame", sec.ttfMs != null && sec.ttfMs < LIMITS.ttfMs, `${secs(sec.ttfMs)} (limit ${LIMITS.ttfMs / 1000}s)`);
  for (const delta of [60, 300]) {
    const s = sec.seeks.find((x) => x.delta === delta);
    const name = `seek-resume +${delta}s`;
    if (!s) add(name, null, "not run");
    else if (s.skipped) add(name, null, `skipped: ${s.skipped}`);
    else if (s.resumeMs == null) add(name, false, `never resumed in 60s ${s.error ? `(${s.error})` : ""}`);
    else if (s.bufferedHit) add(name, null, `${secs(s.resumeMs)} but target was already buffered — not a real test`);
    else add(name, s.resumeMs < LIMITS.seekMs, `${secs(s.resumeMs)} (limit ${LIMITS.seekMs / 1000}s)`);
  }
  const interrupts = (sec.errors?.length || 0) + (sec.pauses || 0);
  add("no interruptions", interrupts === 0, interrupts ? `errors: ${(sec.errors || []).map((e) => e.text).join(" / ") || "none"}; unexpected pauses: ${sec.pauses}` : "none");
  const long = (sec.stalls || []).filter((s) => s.durMs > LIMITS.stallMs);
  add(`stalls >${LIMITS.stallMs / 1000}s`, long.length <= LIMITS.maxStalls, `${long.length} (max ${LIMITS.maxStalls}); all stalls >0.5s: ${(sec.stalls || []).length}`);
  const fullSoak = SOAK_MINUTES >= LIMITS.gateMinutes;
  add(
    `${LIMITS.gateMinutes}-min soak`,
    sec.soakAborted ? false : fullSoak ? sec.soakSeconds >= LIMITS.gateMinutes * 60 - 15 : null,
    `${sec.soakSeconds}s of ${LIMITS.gateMinutes * 60}s${fullSoak ? "" : " (partial run, not the gate)"}`,
  );
  return checks;
}

// ---------- run ----------
const sections = [];
for (const target of targets) {
  const sec = await runSection(target);
  sec.checks = grade(sec);
  sections.push(sec);
}
currentSection = "(done)";

// Expected modes that never mounted are a FAIL, not a silent omission.
if (!ONLY.length) {
  for (const mode of EXPECTED_MODES) {
    if (!described.some((d) => d.mode === mode && d.hasVideo)) {
      sections.push({
        label: mode,
        missing: true,
        checks: [{ name: "mounted", pass: false, detail: `no ${mode} player within ${MOUNT_WAIT_MS / 1000}s; page cards: ${JSON.stringify(await call("pageCards"))}` }],
        seeks: [],
      });
    }
  }
}

// ---------- report ----------
const iso = (t) => new Date(t).toISOString();
let anyFail = false;
let anyIncomplete = false;
for (const sec of sections) {
  for (const c of sec.checks) {
    if (c.pass === false) anyFail = true;
    if (c.pass === null) anyIncomplete = true;
  }
}
const verdict = anyFail ? "FAIL" : anyIncomplete ? "INCOMPLETE" : "PASS";
const fmtPath = (p) => {
  if (!p || !Object.keys(p.own).length)
    return "no /gw requests observed for this asset (worker traffic may not be visible to the harness — don't read anything into this)";
  const parts = Object.entries(p.own).map(
    ([k, v]) =>
      `${k}x${v.n} first@${v.firstAtMs}ms dur ${v.firstDurMs}ms${v.firstServerMs != null ? ` (server ${v.firstServerMs}ms)` : ""} [${v.firstStatus}] max ${v.maxDurMs}ms done@${v.lastEndAtMs}ms`,
  );
  if (p.denied.length) parts.push(`DENIED: ${p.denied.join(", ")}`);
  parts.push(`other players' integrity in window: ${p.othersIntegrity}`);
  return parts.join(" | ");
};

console.log(`\n==================== GATE: ${verdict} ====================`);
console.log(`demo ${DEMO_URL} | soak ${SOAK_MINUTES} min/section | ${new Date().toISOString()}`);
for (const sec of sections) {
  console.log(`\n[${sec.label}]${sec.missing ? "" : ` mount ${secs(sec.mountMs)}${sec.mountMs > 25_000 ? " (slow)" : ""} | ${sec.startedAt} -> ${sec.endedAt}`}`);
  for (const c of sec.checks) console.log(`  ${c.pass === true ? "PASS" : c.pass === false ? "FAIL" : "SKIP"}  ${c.name}: ${c.detail}`);
  for (const s of sec.seeks) if (s.path !== undefined) console.log(`  seek +${s.delta}s path: ${fmtPath(s.path)}`);
  for (const note of sec.notes || []) console.log(`  note: ${note}`);
  const worst = (sec.stalls || []).sort((a, b) => b.durMs - a.durMs).slice(0, 3);
  if (worst.length) console.log(`  worst stalls: ${worst.map((s) => `${secs(s.durMs)}@t=${s.atT ?? "?"}`).join(", ")}`);
  const sectionLogs = logs.filter((l) => l.section === sec.label && l.type !== "info");
  if (sectionLogs.length) {
    console.log(`  warnings/errors (${sectionLogs.length}), last 5:`);
    for (const l of sectionLogs.slice(-5)) console.log(`    ${iso(l.t)} ${l.text}`);
  }
}
const pe = pageErrors.slice(0, 5);
if (pe.length) console.log(`\npage errors (${pageErrors.length}):\n${pe.map((e) => `  [${e.section}] ${e.text.split("\n")[0]}`).join("\n")}`);
const badGw = requests.filter((r) => r.status >= 400);
console.log(`\n/gw requests observed: ${requests.length} (integrity ${requests.filter((r) => r.kind === "integrity").length}, ticket ${requests.filter((r) => r.kind === "ticket").length}, chunk ${requests.filter((r) => r.kind === "chunk").length}); >=400: ${badGw.length}`);
const integrityByAsset = {};
for (const r of requests) if (r.kind === "integrity") integrityByAsset[r.asset] = (integrityByAsset[r.asset] || 0) + 1;
console.log(`integrity requests by asset: ${JSON.stringify(integrityByAsset)}`);
const median = (xs) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
for (const kind of ["integrity", "ticket", "chunk"]) {
  const rows = requests.filter((r) => r.kind === kind && r.status === 200);
  console.log(`  ${kind}: median wall ${median(rows.map((r) => r.end - r.start))}ms, median server ${median(rows.filter((r) => r.serverMs != null).map((r) => r.serverMs))}ms (n=${rows.length})`);
}
for (const r of badGw.slice(0, 8)) console.log(`  [${r.section}] ${r.status} ${r.detail} at ${iso(r.start)}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `scripts/gate-report-${stamp}.json`;
writeFileSync(reportPath, JSON.stringify({ verdict, demo: DEMO_URL, soakMinutes: SOAK_MINUTES, sections, logs: logs.slice(-600), issues: issues.slice(-200), pageErrors, requests }, null, 1));
await page.screenshot({ path: "scripts/demo-browser-after.png", fullPage: true });
console.log(`\nreport: ${reportPath}`);
await browser.close();
process.exit(verdict === "PASS" ? 0 : verdict === "FAIL" ? 1 : 2);
