// Optional real-MSE smoke test. Requires local ffmpeg and Chrome.
/* global URL, document, window, MediaSource, fetch, setInterval, console, TextEncoder, Event */
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
import { createRequire } from "node:module";
const { chromium } = createRequire(new URL("../apps/dashboard/package.json", import.meta.url))(
  "@playwright/test",
);

const directory = await mkdtemp(path.join(tmpdir(), "unpirator-seek-"));
let browser;
try {
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "60",
      "-map",
      "0:v",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-filter:v:1",
      "scale=320:180",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "20",
      "-c:a",
      "aac",
      "-f",
      "dash",
      "-seg_duration",
      "2",
      "-use_timeline",
      "1",
      "manifest.mpd",
    ],
    { windowsHide: true, cwd: directory },
  );
  const mpd = await readFile(path.join(directory, "manifest.mpd"), "utf8");
  const manifest = { durationMs: 60000, video: [], audio: [] };
  for (const [i, track] of ["video", "video", "audio"].entries()) {
    const representation = [...mpd.matchAll(/<Representation\b[^>]*>[\s\S]*?<\/Representation>/g)][
      i
    ][0];
    const timescale = Number(/timescale="(\d+)"/.exec(representation)[1]);
    const segments = [];
    for (const match of representation.matchAll(/<S\s[^>]*d="(\d+)"[^>]*\/>/g)) {
      const repeats = Number(/r="(\d+)"/.exec(match[0])?.[1] || 0);
      for (let n = 0; n <= repeats; n++)
        segments.push({
          sequence: segments.length + 1,
          durationMs: (Number(match[1]) / timescale) * 1000,
        });
    }
    manifest[track].push({
      mimeType: `${track}/mp4`,
      codec: /codecs="([^"]+)"/.exec(representation)[1],
      height: i === 1 ? 180 : 90,
      qualityLabel: i === 1 ? "180p" : "90p",
      segments,
    });
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  let mediaKey;
  let expireRefresh = false;
  let bootstrapCount = 0;
  const tickets = new Map();
  await page.route("https://seek.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/session") {
      bootstrapCount++;
      expireRefresh = false;
      return json({
        sessionId: `test-${bootstrapCount}`,
        playbackUrl: "https://seek.test/v/asset/media",
        refreshUrl: "https://seek.test/v/asset/refresh",
        token: "test-token",
        tokenExpiresIn: 90,
        mode: "protected_segments",
        watermark: { enabled: true, label: "Test viewer" },
      });
    }
    if (pathname === "/v/asset/refresh")
      return expireRefresh
        ? json({ error: { code: "TOKEN_EXPIRED" } }, 401)
        : json({ token: "refreshed", tokenExpiresIn: 90 });
    if (pathname === "/v/asset/bootstrap") {
      const { publicKey } = route.request().postDataJSON();
      const publicCryptoKey = await crypto.subtle.importKey(
        "jwk",
        publicKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
      const raw = crypto.getRandomValues(new Uint8Array(32));
      mediaKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
      const wrapped = await crypto.subtle.encrypt("RSA-OAEP", publicCryptoKey, raw);
      return json({ manifest, wrappedKey: Buffer.from(wrapped).toString("base64") });
    }
    if (pathname === "/v/asset/integrity" || pathname === "/v/asset/media")
      return json({ ok: true });
    if (pathname === "/v/asset/ticket") {
      const ticket = crypto.randomUUID();
      tickets.set(ticket, route.request().postDataJSON());
      return json({ ticket });
    }
    if (pathname.startsWith("/v/asset/chunk/")) {
      const ticket = new URL(route.request().url()).searchParams.get("ticket");
      const item = tickets.get(ticket);
      if (!item) return json({ error: { code: "SEGMENT_TICKET_INVALID" } }, 403);
      tickets.delete(ticket);
      const stream = item.track === "video" ? item.variant : 2;
      const file = item.sequence
        ? `chunk-stream${stream}-${String(item.sequence).padStart(5, "0")}.m4s`
        : `init-stream${stream}.m4s`;
      const raw = await readFile(path.join(directory, file));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const context = "test-context";
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
        mediaKey,
        raw,
      );
      return route.fulfill({
        body: Buffer.from(encrypted),
        headers: {
          "content-type": "application/octet-stream",
          "x-unpirator-iv": Buffer.from(iv).toString("base64"),
          "x-unpirator-context": context,
        },
      });
    }
    if (pathname === "/")
      return route.fulfill({ contentType: "text/html", body: "<video muted controls></video>" });
    if (pathname === "/index.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: (await readFile("packages/player/src/index.js", "utf8")).replace(
          'import Hls from "hls.js";',
          "const Hls = { isSupported: () => false };",
        ),
      });
    if (pathname === "/segment-timeline.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: await readFile("packages/player/src/segment-timeline.js", "utf8"),
      });
    return route.fulfill({
      contentType: "application/octet-stream",
      body: await readFile(path.join(directory, path.basename(pathname))),
    });
  });
  await page.goto("https://seek.test/");
  await page.evaluate(async (manifest) => {
    const { ProtectedSegmentRuntime } = await import("/index.js");
    const video = document.querySelector("video");
    const runtime = new ProtectedSegmentRuntime({
      video,
      onError: (error) => {
        window.failure = error.message;
      },
    });
    window.runtime = runtime;
    runtime.manifest = manifest;
    runtime.videoVariant = runtime.audioVariant = 0;
    runtime.mediaSource = new MediaSource();
    video.src = URL.createObjectURL(runtime.mediaSource);
    await new Promise((resolve) =>
      runtime.mediaSource.addEventListener("sourceopen", resolve, { once: true }),
    );
    runtime.mediaSource.duration = 60;
    runtime.request = async (track, variant, sequence) => {
      const stream = track === "video" ? variant : 2;
      const file = sequence
        ? `chunk-stream${stream}-${String(sequence).padStart(5, "0")}.m4s`
        : `init-stream${stream}.m4s`;
      return (await fetch(`/${file}`)).arrayBuffer();
    };
    runtime.sendIntegrity = async () => {};
    for (const track of ["video", "audio"]) {
      const descriptor = manifest[track][0];
      runtime[`${track}Buffer`] = runtime.mediaSource.addSourceBuffer(
        `${descriptor.mimeType}; codecs="${descriptor.codec}"`,
      );
    }
    for (const track of ["video", "audio"]) {
      await runtime.append(track, 0, 0, runtime[`${track}Buffer`]);
    }
    video.addEventListener("seeking", runtime.onSeeking);
    runtime.pump = setInterval(() => runtime.fillBuffer().catch(runtime.fail), 100);
    await runtime.fillBuffer();
    await video.play();
  }, manifest);
  await page.waitForFunction(() => document.querySelector("video").currentTime > 0.3);
  for (const target of [40, 5, 55, 15]) {
    await page.evaluate((target) => {
      document.querySelector("video").currentTime = target;
    }, target);
    await page.waitForFunction(
      (target) => {
        const v = document.querySelector("video");
        return !v.seeking && v.currentTime > target + 0.3;
      },
      target,
      { timeout: 15000 },
    );
    const state = await page.evaluate(() => ({
      time: document.querySelector("video").currentTime,
      failure: window.failure || null,
    }));
    if (state.failure) throw new Error(state.failure);
    console.log(JSON.stringify({ seek: target, ...state }));
  }
  await page.evaluate(async () => {
    await window.runtime.setQuality(1);
  });
  await page.waitForFunction(
    () => document.querySelector("video").currentTime > 16 && !window.failure,
  );
  console.log(
    JSON.stringify({
      qualitySwitch: await page.evaluate(() => ({
        variant: window.runtime.videoVariant,
        time: document.querySelector("video").currentTime,
        failure: window.failure || null,
      })),
    }),
  );
  await page.evaluate(async () => {
    document.querySelector("video").pause();
    await window.runtime.setQuality(0);
  });
  if (!(await page.evaluate(() => document.querySelector("video").paused)))
    throw new Error("Quality switch unpaused the video");
  await page.evaluate(async () => {
    window.runtime.destroy();
    document.body.innerHTML = '<div id="player" style="width:640px;height:360px"></div>';
    const { mountProtectedPlayer } = await import("/index.js");
    window.player = await mountProtectedPlayer({
      element: "#player",
      bootstrap: async () => (await fetch("/session")).json(),
      onError: (error) => {
        window.failure = error.message;
      },
    });
    window.player.video.muted = true;
    await window.player.video.play();
  });
  await page.waitForFunction(() => window.player.video.currentTime > 0.3);
  await page.evaluate(() => {
    window.player.video.currentTime = 20;
  });
  await page.waitForFunction(
    () => !window.player.video.seeking && window.player.video.currentTime > 20.3,
  );
  expireRefresh = true;
  await page.evaluate(async () => {
    window.player.video.pause();
    window.player.tokenRefreshedAt = Date.now() - 30 * 60000;
    try {
      await window.player.ensureFreshToken();
    } catch (error) {
      window.player.handlePlaybackError(error);
    }
    await window.player.recovering;
  });
  const recovered = await page.evaluate(() => ({
    time: window.player.video.currentTime,
    paused: window.player.video.paused,
    error: window.player.errorMessage?.textContent || null,
  }));
  if (bootstrapCount !== 2 || recovered.time < 20 || !recovered.paused || recovered.error)
    throw new Error(`Recovery failed: ${JSON.stringify(recovered)}`);
  await page.evaluate(async () => {
    window.player.retryButton.click();
    await window.player.recovering;
  });
  await page.waitForFunction(
    () => window.player.video.currentTime > 20.8 && !window.player.video.paused,
  );
  const selectCount = await page.evaluate(
    () => window.player.controls.querySelectorAll("option").length,
  );
  if (selectCount !== 2) throw new Error("Quality menu missing");
  await page.evaluate(async () => {
    const select = window.player.controls.querySelector("select");
    select.value = String(window.player.protected.videoVariant === 0 ? 1 : 0);
    select.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(
    () => !window.player.controls.querySelector("select").disabled && !window.player.errorMessage,
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/player-recovery-quality.png" });
  console.log(
    JSON.stringify({
      encryptedWorkerPlayback: "passed",
      expiredRefreshRecovery: recovered,
      manualReload: "passed",
      qualityOptions: selectCount,
    }),
  );
} finally {
  await browser?.close();
  if (
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("unpirator-seek-")
  )
    await rm(directory, { recursive: true, force: true });
}
