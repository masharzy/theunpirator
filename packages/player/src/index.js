import Hls from "hls.js";

const positions = [
  ["8%", "8%"],
  ["65%", "10%"],
  ["35%", "42%"],
  ["8%", "78%"],
  ["65%", "76%"],
];

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
    this.video.setAttribute("controlsList", "nodownload");
    this.root.appendChild(this.video);
    this.state = await this.bootstrap();
    this.setupWatermark(this.state.watermark);
    await this.attachMedia();
    this.scheduleRefresh();
    this.scheduleHeartbeat();
    return this;
  }

  async attachMedia() {
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

  async refreshToken() {
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
      this.video?.pause();
      throw new Error("Playback token refresh failed");
    }
    const data = await response.json();
    this.state.token = data.token;
    this.state.tokenExpiresIn = data.tokenExpiresIn;
    if (!this.hls && this.video?.src) {
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
    this.timers.push(setInterval(() => this.refreshToken().catch(this.onError), everyMs));
  }

  scheduleHeartbeat() {
    this.timers.push(
      setInterval(async () => {
        try {
          const url = new URL(this.state.playbackUrl);
          url.searchParams.delete("token");
          const response = await fetch(url.toString(), {
            method: "POST",
            headers: { Authorization: `Bearer ${this.state.token}` },
          });
          if (response.status === 401) await this.refreshToken();
          if (response.status === 403) {
            this.video.pause();
            this.onError(new Error("Playback session ended"));
          }
        } catch (error) {
          this.onError(error);
        }
      }, 30_000),
    );
  }

  setupWatermark(policy) {
    if (!policy?.enabled) return;
    const mark = document.createElement("div");
    mark.textContent = `${policy.label || "Viewer"} • ${policy.sessionCode || ""}`;
    Object.assign(mark.style, {
      position: "absolute",
      zIndex: "20",
      pointerEvents: "none",
      opacity: "0.34",
      fontSize: "14px",
      fontFamily: "system-ui,sans-serif",
      color: "white",
      textShadow: "0 1px 3px rgba(0,0,0,.8)",
      transition: "all 600ms ease",
      userSelect: "none",
    });
    this.root.appendChild(mark);
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
    for (const timer of this.timers) clearInterval(timer);
    clearTimeout(this.watermarkTimer);
    this.hls?.destroy();
    this.video?.pause();
    this.root.innerHTML = "";
  }
}

export async function mountProtectedPlayer(options) {
  const player = new ProtectedPlayer(options);
  await player.mount();
  return player;
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
