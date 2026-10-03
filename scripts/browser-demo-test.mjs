// Real-browser verification of the demo page: opens Chrome, plays every
// section, collects errors and video state. This is the acceptance gate —
// nothing counts as done until this passes.
import { chromium } from "file:///F:/projects/the-unpirator/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";

const DEMO_URL = "https://theunpirator-demo.pages.dev";
const results = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  if (msg.type() === "warning" && msg.text().includes("unpirator")) consoleErrors.push(`WARN ${msg.text().slice(0, 200)}`);
  if (msg.type() === "info" && msg.text().includes("unpirator")) consoleErrors.push(`INFO ${msg.text().slice(0, 200)}`);
});
page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err).slice(0, 600)));
page.on("requestfailed", (req) => {
  const failure = req.failure()?.errorText || "";
  if (!/ERR_ABORTED/.test(failure)) consoleErrors.push(`REQFAIL ${req.method()} ${req.url().slice(0, 110)} ${failure}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url().slice(0, 130)}`);
});

await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(12_000);

const sections = await page.evaluate(() => {
  const players = [...document.querySelectorAll("unpirator-player")];
  return players.map((el, i) => {
    const card = el.closest("section") || el.parentElement;
    const heading = card?.querySelector("h2, h3")?.textContent?.trim() || `player-${i}`;
    const err = card?.querySelector("pre, [class*=err]")?.textContent?.trim() || "";
    const video = el.shadowRoot?.querySelector("video");
    return {
      heading: heading.slice(0, 60),
      error: err.slice(0, 160),
      hasVideo: !!video,
      readyState: video?.readyState ?? -1,
      currentTime: video?.currentTime ?? -1,
      videoWidth: video?.videoWidth ?? 0,
      paused: video?.paused ?? null,
    };
  });
});

// Try playing every video, then poll state for up to 75s (BotGuard first run
// can take 10-30s before the player reports ready).
await page.evaluate(async () => {
  for (const el of document.querySelectorAll("unpirator-player")) {
    const video = el.shadowRoot?.querySelector("video");
    if (video) {
      video.muted = true;
      try { await video.play(); } catch {}
    }
  }
});
const polls = [];
for (let i = 0; i < 7; i += 1) {
  await page.waitForTimeout(10_000);
  polls.push(
    await page.evaluate(() =>
      [...document.querySelectorAll("unpirator-player")].map((el) => {
        const card = el.closest("section") || el.parentElement;
        const findVideo = (root) => {
          if (!root) return null;
          for (const v of root.querySelectorAll("video")) return v;
          for (const el2 of root.querySelectorAll("*")) {
            const found = findVideo(el2.shadowRoot);
            if (found) return found;
          }
          return null;
        };
        const video = findVideo(el.shadowRoot) || el.querySelector("video");
        const container = el.shadowRoot?.querySelector("[part=player]");
        return {
          heading: (card?.querySelector("h2, h3")?.textContent?.trim() || "").slice(0, 28),
          error: (card?.querySelector(".err, .ok")?.textContent?.trim() || "").slice(0, 110),
          t: Number((video?.currentTime ?? -1).toFixed(1)),
          w: video?.videoWidth ?? 0,
          openShadowTags: [...(container?.children || [])].map((c) => c.tagName).join(","),
        };
      }),
    ),
  );
}

const after = await page.evaluate(() =>
  [...document.querySelectorAll("unpirator-player")].map((el) => {
    const card = el.closest("section") || el.parentElement;
    // search shadow roots and light DOM recursively for the video element
    const findVideo = (root) => {
      if (!root) return null;
      for (const v of root.querySelectorAll("video")) return v;
      for (const el2 of root.querySelectorAll("*")) {
        const found = findVideo(el2.shadowRoot);
        if (found) return found;
      }
      return null;
    };
    const video = findVideo(el.shadowRoot) || el.querySelector("video");
    return {
      heading: (card?.querySelector("h2, h3")?.textContent?.trim() || "").slice(0, 60),
      error: (card?.querySelector("pre, [class*=err], .err, .ok")?.textContent?.trim() || "").slice(0, 160),
      hasVideo: !!video,
      readyState: video?.readyState ?? -1,
      currentTime: Number((video?.currentTime ?? -1).toFixed(2)),
      videoWidth: video?.videoWidth ?? 0,
      paused: video?.paused ?? null,
      hasControls: video?.controls ?? null,
    };
  }),
);

await page.screenshot({ path: "scripts/demo-browser-after.png", fullPage: true });
console.log(JSON.stringify({ polls, pageErrors: pageErrors.slice(0, 6), consoleErrors: consoleErrors.slice(0, 16) }, null, 1));
await browser.close();
