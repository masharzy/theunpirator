import Hls from "hls.js";
import { sequenceAtTime } from "./segment-timeline.js";
import { installPlayerExperience } from "./player-experience.js";

const positions = [
  ["8%", "8%"],
  ["65%", "10%"],
  ["35%", "42%"],
  ["8%", "78%"],
  ["65%", "76%"],
];

const youtubeMinterCache = new Map();
const BOTGUARD_TIMEOUT_MS = 12_000;

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_");
}

function withTimeout(promise, message, timeoutMs = BOTGUARD_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

async function gatewayJson(baseUrl, path, token, body = {}) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data?.error?.message || `Browser verification failed (${response.status})`);
  return data;
}

async function initializeYoutubeMinter(baseUrl, token) {
  const { challenge } = await gatewayJson(baseUrl, "attestation/create", token);
  if (
    typeof challenge?.interpreterJavascript !== "string" ||
    typeof challenge?.program !== "string" ||
    typeof challenge?.globalName !== "string"
  )
    throw new Error("YouTube browser challenge was invalid");
  new Function(challenge.interpreterJavascript)();
  const vm = globalThis[challenge.globalName];
  if (!vm?.a) throw new Error("YouTube browser verification could not start");
  let setup;
  const functionsReady = new Promise((resolve) => {
    setup = (asyncSnapshotFunction, shutdownFunction) =>
      resolve({ asyncSnapshotFunction, shutdownFunction });
  });
  vm.a(challenge.program, setup, true, undefined, () => {}, [[], []]);
  const { asyncSnapshotFunction, shutdownFunction } = await withTimeout(
    functionsReady,
    "YouTube browser verification timed out",
  );
  if (typeof asyncSnapshotFunction !== "function")
    throw new Error("YouTube browser verification was unavailable");
  const webPoSignalOutput = [];
  const botguardResponse = await withTimeout(
    new Promise((resolve, reject) => {
      try {
        asyncSnapshotFunction(resolve, [undefined, undefined, webPoSignalOutput, undefined]);
      } catch (error) {
        reject(error);
      }
    }),
    "YouTube browser verification timed out",
  );
  const integrity = await gatewayJson(baseUrl, "attestation/integrity", token, {
    botguardResponse,
  });
  const getMinter = webPoSignalOutput[0];
  if (typeof getMinter !== "function")
    throw new Error("YouTube browser token generator was unavailable");
  const mint = await getMinter(decodeBase64Url(integrity.integrityToken));
  if (typeof mint !== "function") throw new Error("YouTube browser token generator failed");
  return {
    expiresAt:
      Date.now() + Math.max(60, Number(integrity.estimatedTtlSeconds || 3600) - 600) * 1000,
    mint,
    shutdownFunction,
  };
}

async function youtubeMinter(baseUrl, token) {
  const current = youtubeMinterCache.get(baseUrl);
  if (current && current.expiresAt > Date.now()) return current;
  if (current?.promise) return current.promise;
  const promise = initializeYoutubeMinter(baseUrl, token)
    .then((result) => {
      youtubeMinterCache.set(baseUrl, result);
      return result;
    })
    .catch((error) => {
      youtubeMinterCache.delete(baseUrl);
      throw error;
    });
  youtubeMinterCache.set(baseUrl, { promise, expiresAt: Date.now() + BOTGUARD_TIMEOUT_MS });
  return promise;
}

async function createProviderProof(state, baseUrl) {
  if (state.attestation?.provider !== "youtube") return null;
  const contentBinding = state.attestation.contentBinding;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(contentBinding || ""))
    throw new Error("YouTube browser verification binding was invalid");
  const { mint } = await youtubeMinter(baseUrl, state.token);
  const bytes = await mint(new TextEncoder().encode(contentBinding));
  if (!(bytes instanceof Uint8Array) || !bytes.length)
    throw new Error("YouTube browser token was invalid");
  return { type: "youtube_web", contentBinding, token: encodeBase64Url(bytes) };
}

export class ProtectedPlayer {
  constructor({ element, bootstrap, refreshEndpoint, onError = console.error }) {
    this.root = typeof element === "string" ? document.querySelector(element) : element;
    if (!this.root) throw new Error("ProtectedPlayer target element not found");
    this.bootstrap = bootstrap;
    this.refreshEndpoint = refreshEndpoint;
    this.onError = onError;
    this.hls = null;
    this.state = null;
    this.timers = [];
  }

  async mount() {
    this.root.innerHTML = "";
    this.root.style.position = "relative";
    this.video = document.createElement("video");
    this.video.controls = true;
    this.video.playsInline = true;
    this.video.crossOrigin = "use-credentials";
    this.video.preload = "metadata";
    this.video.style.width = "100%";
    this.video.style.height = "100%";
    this.video.style.background = "#07110b";
    this.video.setAttribute("controlsList", "nodownload");
    this.root.appendChild(this.video);
    this.state = await this.bootstrap();
    this.tokenRefreshedAt = Date.now();
    if (this.state.mode === "protected_segments") this.setupProtectedSurface();
    this.setupWatermark(this.state.watermark);
    await this.attachMedia();
    this.scheduleRefresh();
    this.scheduleHeartbeat();
    this.onVisible = () => {
      if (!document.hidden)
        this.ensureFreshToken().catch((error) => this.handlePlaybackError(error));
    };
    document.addEventListener("visibilitychange", this.onVisible);
    this.video.addEventListener("play", this.onVisible);
    this.cleanupExperience = installPlayerExperience(this);
    return this;
  }

  setupProtectedSurface() {
    this.host = document.createElement("div");
    this.host.style.cssText =
      "display:block;position:relative;width:100%;height:100%;overflow:hidden;background:#07110b";
    this.root.replaceChildren(this.host);
    this.surface = this.host.attachShadow({ mode: "closed" });
    this.frame = document.createElement("div");
    this.frame.style.cssText =
      "position:relative;width:100%;height:100%;overflow:hidden;background:#07110b";
    this.frame.appendChild(this.video);
    this.surface.appendChild(this.frame);
  }

  async attachMedia() {
    if (this.state.mode === "protected_segments") {
      await this.attachProtectedSegments();
      return;
    }
    const url = new URL(this.state.playbackUrl);
    url.searchParams.delete("token");
    if (this.state.mode === "hls" && Hls.isSupported()) {
      this.hls = new Hls({
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
          xhr.setRequestHeader("Authorization", `Bearer ${this.state.token}`);
        },
      });
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) this.onError(data);
      });
      this.hls.loadSource(url.toString());
      this.hls.attachMedia(this.video);
    } else {
      this.video.src = this.state.playbackUrl;
    }
  }

  async attachProtectedSegments() {
    if (!window.MediaSource || !window.Worker || !crypto?.subtle)
      throw new Error("This browser does not support protected playback");
    this.protected = new ProtectedSegmentRuntime({
      video: this.video,
      root: this.root,
      surface: this.surface,
      host: this.host,
      watermark: this.watermarkElement,
      state: this.state,
      onError: (error) => this.handlePlaybackError(error),
      refreshToken: () => this.refreshToken(),
      ensureToken: () => this.ensureFreshToken(),
      startPosition: this.restorePosition || 0,
    });
    await this.protected.mount();
    this.installPlaybackControls();
  }

  async refreshToken() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.performRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  async performRefresh() {
    const endpoint = this.refreshEndpoint
      ? this.refreshEndpoint(this.state)
      : this.state.refreshUrl;
    if (!endpoint) return;
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${this.state.token}` },
    });
    if (!response.ok) {
      if (response.status !== 401) this.video?.pause();
      const data = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Playback token refresh failed"), {
        code: data.error?.code,
        status: response.status,
      });
    }
    const data = await response.json();
    this.state.token = data.token;
    this.state.tokenExpiresIn = data.tokenExpiresIn;
    this.tokenRefreshedAt = Date.now();
    this.protected?.setToken(data.token);
    if (!this.protected && !this.hls && this.video?.src) {
      const position = this.video.currentTime;
      const wasPlaying = !this.video.paused;
      const nextUrl = new URL(this.state.playbackUrl);
      nextUrl.searchParams.set("token", data.token);
      this.state.playbackUrl = nextUrl.toString();
      this.video.addEventListener(
        "loadedmetadata",
        () => {
          this.video.currentTime = position;
          if (wasPlaying) this.video.play().catch(this.onError);
        },
        { once: true },
      );
      this.video.src = this.state.playbackUrl;
    }
  }

  scheduleRefresh() {
    const everyMs = Math.max(20_000, (Number(this.state.tokenExpiresIn || 90) - 25) * 1000);
    this.timers.push(
      setInterval(() => {
        if (
          this.destroyed ||
          this.recovering ||
          this.errorMessage ||
          (document.hidden && this.video?.paused)
        )
          return;
        this.ensureFreshToken().catch((error) => this.handlePlaybackError(error));
      }, everyMs),
    );
  }
  async ensureFreshToken() {
    if (this.destroyed) throw new Error("Player stopped");
    if (this.refreshing) return this.refreshing;
    if (
      Date.now() - (this.tokenRefreshedAt || 0) >=
      Math.max(10, Number(this.state.tokenExpiresIn || 90) - 25) * 1000
    )
      await this.refreshToken();
  }
  installPlaybackControls() {
    this.controls?.remove();
    const controls = document.createElement("div");
    controls.style.cssText =
      "position:absolute;right:12px;top:12px;z-index:30;display:flex;gap:8px;align-items:center;padding:6px;border-radius:8px;background:rgba(0,0,0,.8);color:white;font:14px system-ui";
    const label = document.createElement("label");
    label.textContent = "Quality ";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Video quality");
    select.style.cssText =
      "background:#151515;color:white;border:1px solid #777;border-radius:4px;padding:6px";
    this.protected.manifest.video.forEach((variant, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = variant.qualityLabel || `${variant.height || index + 1}p`;
      select.appendChild(option);
    });
    select.value = String(this.protected.videoVariant);
    select.onchange = async () => {
      select.disabled = true;
      try {
        await this.protected.setQuality(Number(select.value));
      } catch (error) {
        this.handlePlaybackError(error);
      } finally {
        select.disabled = false;
        select.value = String(this.protected.videoVariant);
      }
    };
    label.appendChild(select);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.hidden = true;
    retry.textContent = "Reload video";
    retry.style.cssText =
      "background:white;color:#111;border:0;border-radius:4px;padding:7px 10px;cursor:pointer";
    retry.onclick = () =>
      this.recoverPlayback(true).catch((error) => this.showPlaybackError(error));
    controls.append(label, retry);
    (this.frame || this.root).appendChild(controls);
    this.controls = controls;
    this.retryButton = retry;
  }
  handlePlaybackError(error) {
    if (this.destroyed || this.recovering) return;
    if (error.code === "TOKEN_EXPIRED") {
      this.recoverPlayback(false).catch((failure) => this.showPlaybackError(failure));
      return;
    }
    this.showPlaybackError(error);
  }
  showPlaybackError(error) {
    if (this.destroyed) return;
    this.video?.pause();
    this.protected?.destroy();
    this.terminalFailure = error.status === 403;
    if (!this.errorMessage) {
      this.errorMessage = document.createElement("div");
      this.errorMessage.setAttribute("role", "status");
      this.errorMessage.style.cssText =
        "position:absolute;left:10%;right:10%;top:45%;padding:16px;border-radius:8px;background:rgba(0,0,0,.9);color:white;text-align:center;font:16px system-ui;z-index:30";
      (this.frame || this.root).appendChild(this.errorMessage);
    }
    this.errorMessage.textContent = this.terminalFailure
      ? "Playback access is no longer available."
      : "Playback interrupted. Use Reload video to continue.";
    if (this.retryButton) {
      this.retryButton.hidden = this.terminalFailure;
      this.retryButton.disabled = this.terminalFailure;
    }
    // Consumers may unmount on onError; keep recoverable failures inside the player.
    if (this.terminalFailure) this.onError(error);
  }
  async recoverPlayback(manual = false) {
    if (this.recovering) return this.recovering;
    if (this.destroyed || this.terminalFailure) return;
    this.recovering = this.performRecovery(manual).finally(() => {
      this.recovering = null;
      if (this.retryButton) this.retryButton.disabled = this.terminalFailure === true;
    });
    return this.recovering;
  }
  async performRecovery(manual) {
    const position = this.video.currentTime;
    const play = manual || !this.video.paused;
    if (this.retryButton) this.retryButton.disabled = true;
    this.protected?.destroy();
    this.video.pause();
    try {
      await this.refreshToken();
    } catch (error) {
      if (error.status !== 401 || error.code !== "TOKEN_EXPIRED") throw error;
      // This callback is the application's authenticated, entitlement-checked
      // backend bridge. Never renew access using browser-supplied identity.
      this.state = await this.bootstrap();
      this.tokenRefreshedAt = Date.now();
    }
    if (this.destroyed) return;
    this.restorePosition = position;
    clearTimeout(this.watermarkTimer);
    this.watermarkElement?.remove();
    this.setupWatermark(this.state.watermark);
    await this.attachMedia();
    this.restorePosition = 0;
    this.errorMessage?.remove();
    this.errorMessage = null;
    if (this.retryButton) this.retryButton.hidden = true;
    if (play && !this.destroyed) await this.video.play();
  }

  scheduleHeartbeat() {
    this.timers.push(
      setInterval(async () => {
        try {
          if (
            this.destroyed ||
            this.recovering ||
            this.errorMessage ||
            (document.hidden && this.video?.paused)
          )
            return;
          await this.ensureFreshToken();
          const url = new URL(this.state.playbackUrl);
          url.searchParams.delete("token");
          const response = await fetch(url.toString(), {
            method: "POST",
            headers: { Authorization: `Bearer ${this.state.token}` },
          });
          if (response.status === 401) await this.refreshToken();
          if (response.status === 403) {
            this.video.pause();
            this.handlePlaybackError(
              Object.assign(new Error("Playback session ended"), { status: 403 }),
            );
          }
        } catch (error) {
          this.handlePlaybackError(error);
        }
      }, 30_000),
    );
  }

  setupWatermark(policy) {
    if (!policy?.enabled) return;
    const mark = document.createElement("canvas");
    mark.width = 440;
    mark.height = 42;
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = `${policy.label || "Viewer"} • ${policy.sessionCode || ""}`;
    const context = mark.getContext("2d");
    context.font = "600 15px system-ui,sans-serif";
    context.fillStyle = "rgba(255,255,255,.78)";
    context.shadowColor = "rgba(0,0,0,.85)";
    context.shadowBlur = 4;
    context.fillText(`${policy.label || "Viewer"} • ${policy.sessionCode || ""}`, 8, 27);
    Object.assign(mark.style, {
      position: "absolute",
      zIndex: "20",
      pointerEvents: "none",
      opacity: "0.34",
      width: "min(440px,72%)",
      height: "42px",
      transition: "all 600ms ease",
      userSelect: "none",
    });
    (this.frame || this.root).appendChild(mark);
    this.watermarkElement = mark;
    const move = () => {
      const [left, top] = positions[Math.floor(Math.random() * positions.length)];
      mark.style.left = left;
      mark.style.top = top;
    };
    move();
    const min = Number(policy.minMoveSeconds || 20);
    const max = Number(policy.maxMoveSeconds || 45);
    const loop = () => {
      move();
      this.watermarkTimer = setTimeout(loop, (min + Math.random() * (max - min)) * 1000);
    };
    this.watermarkTimer = setTimeout(loop, min * 1000);
  }

  destroy() {
    this.destroyed = true;
    this.cleanupExperience?.();
    this.cleanupExperience = null;
    if (this.onVisible) document.removeEventListener("visibilitychange", this.onVisible);
    this.video?.removeEventListener?.("play", this.onVisible);
    for (const timer of this.timers) clearInterval(timer);
    clearTimeout(this.watermarkTimer);
    this.hls?.destroy();
    this.protected?.destroy();
    this.video?.pause();
    this.root.innerHTML = "";
  }
}

function segmentWorkerRuntime() {
  let token = "";
  let baseUrl = "";
  let key = null;
  let pairPromise;
  const prepareKey = () =>
    (pairPromise ||= crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      false,
      ["encrypt", "unwrapKey"],
    ));
  const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const auth = () => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });
  async function json(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(
        new Error(data?.error?.message || `Protected request failed (${response.status})`),
        { code: data?.error?.code, status: response.status },
      );
    return data;
  }
  self.onmessage = async ({ data }) => {
    try {
      if (data.type === "prepare") {
        await prepareKey();
        return;
      }
      if (data.type === "bootstrap") {
        token = data.token;
        baseUrl = data.baseUrl;
        const pair = await prepareKey();
        const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
        const result = await json(
          await fetch(`${baseUrl}/bootstrap`, {
            method: "POST",
            credentials: "include",
            headers: auth(),
            body: JSON.stringify({
              publicKey,
              playerBuild: "protected-v1",
              providerProof: data.providerProof,
            }),
          }),
        );
        key = await crypto.subtle.unwrapKey(
          "raw",
          fromBase64(result.wrappedKey),
          pair.privateKey,
          { name: "RSA-OAEP" },
          { name: "AES-GCM" },
          false,
          ["decrypt"],
        );
        self.postMessage({ type: "ready", manifest: result.manifest });
        return;
      }
      if (data.type === "token") {
        token = data.token;
        return;
      }
      if (data.type === "integrity") {
        await json(
          await fetch(`${baseUrl}/integrity`, {
            method: "POST",
            credentials: "include",
            headers: auth(),
            body: JSON.stringify({
              sequence: data.sequence,
              tampered: data.tampered === true,
              positionSeconds: data.positionSeconds,
              videoVariant: data.videoVariant,
              audioVariant: data.audioVariant,
            }),
          }),
        );
        self.postMessage({ type: "integrity", id: data.id });
        return;
      }
      if (data.type === "segment") {
        if (!key) throw new Error("Protected player key unavailable");
        let response;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const ticket = await json(
            await fetch(`${baseUrl}/ticket`, {
              method: "POST",
              credentials: "include",
              headers: auth(),
              body: JSON.stringify({
                track: data.track,
                variant: data.variant,
                sequence: data.sequence,
              }),
            }),
          );
          response = await fetch(
            `${baseUrl}/chunk/${data.track}/${data.variant}/${data.sequence}?ticket=${encodeURIComponent(ticket.ticket)}`,
            { credentials: "include", headers: { Authorization: `Bearer ${token}` } },
          );
          if (response.ok) break;
          if (response.status === 401 || response.status === 403 || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        }
        if (!response?.ok) await json(response);
        const context = response.headers.get("x-unpirator-context") || "";
        const decrypted = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: fromBase64(response.headers.get("x-unpirator-iv") || ""),
            additionalData: new TextEncoder().encode(context),
          },
          key,
          await response.arrayBuffer(),
        );
        self.postMessage(
          {
            type: "segment",
            id: data.id,
            track: data.track,
            sequence: data.sequence,
            buffer: decrypted,
          },
          [decrypted],
        );
      }
    } catch (error) {
      self.postMessage({
        type: "error",
        id: data.id,
        message: error.message || "Protected playback failed",
        code: error.code,
        status: error.status,
      });
    }
  };
}

export class ProtectedSegmentRuntime {
  constructor({
    video,
    root,
    surface,
    host,
    watermark,
    state,
    onError,
    refreshToken,
    ensureToken,
    startPosition = 0,
  }) {
    this.video = video;
    this.root = root;
    this.surface = surface;
    this.host = host;
    this.watermark = watermark;
    this.state = state;
    this.onError = onError;
    this.refreshToken = refreshToken;
    this.ensureToken = ensureToken;
    this.startPosition = startPosition;
    this.pending = new Map();
    this.nextId = 1;
    this.nextSequence = 1;
    this.cursors = { video: 1, audio: 1 };
    this.generation = 0;
    this.destroyed = false;
  }
  async mount() {
    const mediaUrl = new URL(this.state.playbackUrl);
    mediaUrl.search = "";
    const baseUrl = mediaUrl.toString().replace(/\/media$/, "");
    this.baseUrl = baseUrl;
    const workerUrl = URL.createObjectURL(
      new Blob([`(${segmentWorkerRuntime.toString()})()`], { type: "text/javascript" }),
    );
    this.workerUrl = workerUrl;
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = ({ data }) => this.onWorkerMessage(data);
    const ready = new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
    });
    ready.catch(() => {});
    this.worker.postMessage({ type: "prepare" });
    await this.ensureToken?.();
    const providerProof = await createProviderProof(this.state, baseUrl);
    this.worker.postMessage({
      type: "bootstrap",
      baseUrl,
      token: this.state.token,
      providerProof,
    });
    this.manifest = await ready;
    this.videoVariant = chooseVideoVariant(this.manifest.video);
    this.audioVariant = 0;
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.video.src = this.objectUrl;
    await new Promise((resolve, reject) => {
      this.mediaSource.addEventListener("sourceopen", resolve, { once: true });
      this.mediaSource.addEventListener("error", reject, { once: true });
    });
    this.videoBuffer = this.mediaSource.addSourceBuffer(
      `${this.manifest.video[this.videoVariant].mimeType}; codecs="${this.manifest.video[this.videoVariant].codec}"`,
    );
    this.audioBuffer = this.mediaSource.addSourceBuffer(
      `${this.manifest.audio[this.audioVariant].mimeType}; codecs="${this.manifest.audio[this.audioVariant].codec}"`,
    );
    this.mediaSource.duration = this.manifest.durationMs / 1000;
    this.startPosition = Math.min(this.startPosition, Math.max(0, this.mediaSource.duration - 0.1));
    this.authorizationPosition = this.startPosition;
    for (const track of ["video", "audio"])
      this.cursors[track] = sequenceAtTime(
        this.manifest[track][this[`${track}Variant`]].segments,
        this.startPosition,
      );
    await this.sendIntegrity(false);
    await Promise.all([
      this.append("video", this.videoVariant, 0, this.videoBuffer),
      this.append("audio", this.audioVariant, 0, this.audioBuffer),
    ]);
    this.video.currentTime = this.startPosition;
    this.authorizationPosition = undefined;
    this.video.addEventListener("seeking", this.onSeeking);
    await this.fillBuffer();
    this.heartbeat = setInterval(() => {
      if (!this.destroyed && !(document.hidden && this.video.paused))
        this.sendIntegrity(false).catch(this.fail);
    }, 5_000);
    this.pump = setInterval(() => this.fillBuffer().catch(this.fail), 1_000);
    this.installIntegrityGuard();
  }
  onWorkerMessage(data) {
    if (data.type === "ready") {
      this.ready?.resolve(data.manifest);
      return;
    }
    if (data.type === "error") {
      const error = Object.assign(new Error(data.message), {
        code: data.code,
        status: data.status,
      });
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id).reject(error);
        this.pending.delete(data.id);
      } else this.ready?.reject(error);
      return;
    }
    if (data.type === "segment" && this.pending.has(data.id)) {
      this.pending.get(data.id).resolve(data.buffer);
      this.pending.delete(data.id);
    }
    if (data.type === "integrity" && this.pending.has(data.id)) {
      this.pending.get(data.id).resolve();
      this.pending.delete(data.id);
    }
  }
  request(track, variant, sequence) {
    return this.callWorker({ type: "segment", track, variant, sequence });
  }
  async callWorker(data, retry = true) {
    if (this.destroyed) throw new Error("Player stopped");
    await this.ensureToken?.();
    if (this.destroyed) throw new Error("Player stopped");
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Playback request timed out"));
      }, 60000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.worker.postMessage({ ...data, id });
    try {
      return await promise;
    } catch (error) {
      if (retry && error.code === "TOKEN_EXPIRED" && this.refreshToken && !this.destroyed) {
        await this.refreshToken();
        return this.callWorker(data, false);
      }
      throw error;
    }
  }
  async append(track, variant, sequence, sourceBuffer, generation = this.generation) {
    const buffer = await this.request(track, variant, sequence);
    if (this.destroyed || (sequence !== 0 && generation !== this.generation)) return;
    await appendBuffer(sourceBuffer, buffer);
  }
  onSeeking = () => {
    if (this.destroyed) return;
    this.generation += 1;
    for (const track of ["video", "audio"]) {
      const descriptor = this.manifest[track][this[`${track}Variant`]];
      this.cursors[track] = sequenceAtTime(descriptor.segments, this.video.currentTime);
    }
    this.fillBuffer().catch(this.fail);
  };
  async fillBuffer() {
    if (
      this.destroyed ||
      this.loading ||
      this.switching ||
      (typeof document !== "undefined" && document.hidden && this.video.paused)
    )
      return;
    this.loading = true;
    const generation = this.generation;
    try {
      await this.sendIntegrity(false);
      if (generation !== this.generation || this.destroyed) return;
      const results = await Promise.allSettled(
        ["video", "audio"].map(async (track) => {
          const variant = this[`${track}Variant`];
          const sourceBuffer = this[`${track}Buffer`];
          const descriptor = this.manifest[track][variant];
          await cleanBuffer(sourceBuffer, this.video.currentTime, this.mediaSource.duration);
          if (generation !== this.generation || this.destroyed) return;
          const ahead = bufferedAhead({
            buffered: sourceBuffer.buffered,
            currentTime: this.video.currentTime,
          });
          if (ahead >= 20) return;
          // Buffered ranges survive seeks. Resume at the end of the target range,
          // independently for audio and video (their segment durations differ).
          if (ahead > 0)
            this.cursors[track] = Math.max(
              this.cursors[track],
              sequenceAtTime(descriptor.segments, this.video.currentTime + ahead + 0.001),
            );
          const sequence = this.cursors[track];
          if (sequence > descriptor.segments.length) return;
          await this.append(track, variant, sequence, sourceBuffer, generation);
          if (generation === this.generation) this.cursors[track] = sequence + 1;
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      this.nextSequence = Math.max(this.cursors.video, this.cursors.audio);
      if (
        generation === this.generation &&
        ["video", "audio"].every(
          (track) =>
            this.cursors[track] > this.manifest[track][this[`${track}Variant`]].segments.length,
        ) &&
        this.mediaSource.readyState === "open"
      )
        this.mediaSource.endOfStream();
    } catch (error) {
      if (!this.destroyed && generation === this.generation) throw error;
    } finally {
      this.loading = false;
      if (!this.destroyed && generation !== this.generation) this.fillBuffer().catch(this.fail);
    }
  }
  sendIntegrity(tampered) {
    this.integrityQueue = (this.integrityQueue || Promise.resolve())
      .catch(() => {})
      .then(() => this.dispatchIntegrity(tampered));
    return this.integrityQueue;
  }
  dispatchIntegrity(tampered) {
    if (!this.worker) return Promise.resolve();
    return this.callWorker({
      type: "integrity",
      sequence: this.nextSequence,
      tampered,
      positionSeconds: this.authorizationPosition ?? this.video.currentTime,
      videoVariant: this.videoVariant,
      audioVariant: this.audioVariant,
    });
  }
  async setQuality(variant) {
    if (!Number.isInteger(variant) || !this.manifest.video[variant])
      throw new Error("Invalid quality");
    if (this.destroyed || this.switching || variant === this.videoVariant) return;
    this.switching = true;
    this.generation++;
    try {
      while (this.loading && !this.destroyed)
        await new Promise((resolve) => setTimeout(resolve, 25));
      if (this.destroyed) return;
      const descriptor = this.manifest.video[variant];
      const previous = this.manifest.video[this.videoVariant];
      if (previous.codec !== descriptor.codec && !this.videoBuffer.changeType)
        throw new Error("This browser cannot switch this quality");
      await removeBuffer(this.videoBuffer, 0, this.mediaSource.duration);
      if (this.videoBuffer.changeType)
        this.videoBuffer.changeType(`${descriptor.mimeType}; codecs="${descriptor.codec}"`);
      this.videoVariant = variant;
      await this.sendIntegrity(false);
      await this.append("video", variant, 0, this.videoBuffer);
      this.cursors.video = sequenceAtTime(descriptor.segments, this.video.currentTime);
    } finally {
      this.switching = false;
    }
    await this.fillBuffer();
  }
  installIntegrityGuard() {
    this.originalParent = this.video.parentNode;
    const verify = () => {
      const watermarkStyle = this.watermark ? getComputedStyle(this.watermark) : null;
      if (
        !this.video.isConnected ||
        this.video.parentNode !== this.originalParent ||
        !this.host?.isConnected ||
        (this.watermark &&
          (!this.watermark.isConnected ||
            watermarkStyle.display === "none" ||
            watermarkStyle.visibility === "hidden" ||
            Number(watermarkStyle.opacity) < 0.08))
      )
        this.tamper();
    };
    this.observers = [this.root, this.surface].filter(Boolean).map((target) => {
      const observer = new MutationObserver(verify);
      observer.observe(target, { childList: true, subtree: true, attributes: true });
      return observer;
    });
    this.visibilityGuard = setInterval(verify, 1_000);
  }
  tamper() {
    if (this.destroyed) return;
    // Dispatch before terminating the worker; a queued worker message would be
    // lost on destroy. Server still validates the signed token and origin.
    if (this.baseUrl)
      fetch(`${this.baseUrl}/integrity`, {
        method: "POST",
        keepalive: true,
        headers: {
          Authorization: `Bearer ${this.state.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tampered: true }),
      }).catch(() => {});
    this.destroy();
    this.root.replaceChildren();
    this.onError(
      Object.assign(new Error("Player integrity lost"), {
        code: "PLAYER_INTEGRITY_LOST",
        status: 403,
      }),
    );
  }
  setToken(token) {
    this.worker?.postMessage({ type: "token", token });
  }
  fail = (error) => {
    this.onError(error);
    this.destroy();
  };
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ready?.reject(new Error("Player stopped"));
    clearInterval(this.heartbeat);
    clearInterval(this.pump);
    this.video.removeEventListener("seeking", this.onSeeking);
    for (const observer of this.observers || []) observer.disconnect();
    clearInterval(this.visibilityGuard);
    this.worker?.terminate();
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    for (const pending of this.pending.values()) pending.reject(new Error("Player stopped"));
    this.pending.clear();
  }
}

function chooseVideoVariant(variants) {
  const connection = navigator.connection;
  const target = connection?.saveData || Number(connection?.downlink || 10) < 2 ? 480 : 720;
  const candidates = variants
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(a.item.height) - Number(b.item.height));
  return (candidates.filter(({ item }) => Number(item.height) <= target).pop() || candidates[0])
    .index;
}

function appendBuffer(sourceBuffer, buffer) {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Protected media buffer failed"));
    };
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", done);
      sourceBuffer.removeEventListener("error", failed);
    };
    sourceBuffer.addEventListener("updateend", done, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    sourceBuffer.appendBuffer(buffer);
  });
}

function removeBuffer(sourceBuffer, start, end) {
  if (!Number.isFinite(end) || end <= start || !sourceBuffer.buffered.length)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", done);
      sourceBuffer.removeEventListener("error", failed);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Media buffer cleanup failed"));
    };
    sourceBuffer.addEventListener("updateend", done, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    try {
      sourceBuffer.remove(start, end);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function cleanBuffer(sourceBuffer, position, duration) {
  if (!sourceBuffer.buffered.length) return;
  const behind = position - 45;
  if (behind > 0 && sourceBuffer.buffered.start(0) < behind - 5)
    await removeBuffer(sourceBuffer, 0, behind);
  const ranges = sourceBuffer.buffered;
  if (ranges.length && ranges.end(ranges.length - 1) > position + 95)
    await removeBuffer(sourceBuffer, position + 90, duration);
}

function bufferedAhead(video) {
  for (let index = 0; index < video.buffered.length; index += 1)
    if (
      video.buffered.start(index) <= video.currentTime &&
      video.buffered.end(index) >= video.currentTime
    )
      return video.buffered.end(index) - video.currentTime;
  return 0;
}

export async function mountProtectedPlayer(options) {
  const player = new ProtectedPlayer(options);
  await player.mount();
  return player;
}

export function mountDirectYoutubePlayer({ element, src, title = "YouTube video" } = {}) {
  const root = typeof element === "string" ? document.querySelector(element) : element;
  if (!root) throw new Error("YouTube player target element not found");
  const videoId = youtubeVideoId(src);
  if (!videoId) throw new Error("A valid YouTube URL is required");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0`;
  iframe.title = title;
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = "display:block;width:100%;height:100%;border:0;background:#07110b";
  root.replaceChildren(iframe);
  return {
    iframe,
    video: null,
    destroy() {
      iframe.src = "about:blank";
      if (iframe.parentNode === root) root.replaceChildren();
    },
  };
}

function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") return validYoutubeId(url.pathname.split("/").filter(Boolean)[0]);
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const candidate =
        url.searchParams.get("v") ||
        (["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null);
      return validYoutubeId(candidate);
    }
  } catch {
    return null;
  }
  return null;
}

function validYoutubeId(value) {
  return /^[A-Za-z0-9_-]{6,20}$/.test(value || "") ? value : null;
}

function youtubeUrlFromElement(element) {
  const value = element.dataset?.youtubeUrl || element.getAttribute("src") || "";
  try {
    const url = new URL(value, window.location.href);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com"))
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function stableDeviceId(storageKey) {
  try {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function protectYoutubeEmbeds({
  endpoint = "/api/unpirator/playback",
  selector = 'iframe[src*="youtube.com"], iframe[src*="youtu.be"], [data-youtube-url]',
  deviceStorageKey = "unpirator_device_id",
  onError = console.error,
} = {}) {
  const mounted = new Map();
  const deviceId = stableDeviceId(deviceStorageKey);

  const protectedPlaybackSupported = () => {
    const ua = navigator.userAgent || "";
    return (
      /(Chrome|Chromium|Edg)\/[0-9]+/i.test(ua) &&
      !/(1DM|\bIDM\b|Download Manager|;\s*wv\)|\bWebView\b)/i.test(ua) &&
      Boolean(window.MediaSource && window.Worker && crypto?.subtle)
    );
  };

  async function protect(element) {
    if (element.dataset?.unpiratorProtected === "true") return;
    const youtubeUrl = youtubeUrlFromElement(element);
    if (!youtubeUrl) return;
    element.dataset.unpiratorProtected = "true";
    const root = document.createElement("div");
    root.className = element.className;
    root.style.cssText = element.style.cssText;
    root.style.width = element.getAttribute("width") || root.style.width || "100%";
    const width = Number(element.getAttribute("width"));
    const height = Number(element.getAttribute("height"));
    root.style.aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
    element.replaceWith(root);
    try {
      if (!protectedPlaybackSupported())
        throw new Error("Use a supported secure browser to watch this video");
      const player = await mountProtectedPlayer({
        element: root,
        onError,
        bootstrap: async () => {
          const response = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              youtubeUrl,
              deviceId,
              client: { browser: navigator.userAgent.slice(0, 100) },
            }),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data?.error?.message || "Playback authorization failed");
          return data;
        },
      });
      mounted.set(root, player);
    } catch (error) {
      root.textContent = "This video is temporarily unavailable.";
      root.setAttribute("role", "alert");
      onError(error);
    }
  }

  const scan = (scope = document) => {
    if (scope.matches?.(selector)) protect(scope);
    scope.querySelectorAll?.(selector).forEach(protect);
  };
  scan();
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const player of mounted.values()) player.destroy();
    mounted.clear();
  };
}
