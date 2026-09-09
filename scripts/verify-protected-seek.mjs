// Optional real-MSE smoke test. Requires local ffmpeg and Chrome.
/* global URL, document, window, MediaSource, fetch, setInterval, console */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  const manifest = { durationMs: 60000 };
  for (const [i, track] of ["video", "audio"].entries()) {
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
    manifest[track] = [
      { mimeType: `${track}/mp4`, codec: /codecs="([^"]+)"/.exec(representation)[1], segments },
    ];
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.route("https://seek.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
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
      const stream = track === "video" ? 0 : 1;
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
} finally {
  await browser?.close();
  if (
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("unpirator-seek-")
  )
    await rm(directory, { recursive: true, force: true });
}
