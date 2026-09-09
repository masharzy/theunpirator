import { mountDirectYoutubePlayer, mountProtectedPlayer } from "@unpirator/player";
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

const ElementBase = globalThis.HTMLElement || class {};

export class UnpiratorPlayerElement extends ElementBase {
  static observedAttributes = ["src", "asset-id", "endpoint", "poster", "youtube-direct"];

  constructor() {
    super();
    if (!this.attachShadow) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{display:block;width:100%;aspect-ratio:var(--unpirator-aspect-ratio,16/9);background:#07110b}
      [part=player]{position:relative;width:100%;height:100%;overflow:hidden;background:#07110b}
      [part=status]{box-sizing:border-box;display:grid;place-items:center;width:100%;height:100%;padding:24px;
        color:#dce8df;background:#07110b;font:500 14px/1.5 system-ui,sans-serif;text-align:center}
    `;
    this.container = document.createElement("div");
    this.container.part = "player";
    shadow.append(style, this.container);
  }

  connectedCallback() {
    this.mount();
  }

  disconnectedCallback() {
    this.player?.destroy();
    this.player = null;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.mount();
  }

  set currentUser(value) {
    this._currentUser = value;
    if (this.isConnected) this.mount();
  }

  get currentUser() {
    return this._currentUser;
  }

  async mount() {
    if (!this.container) return;
    const generation = (this.generation || 0) + 1;
    this.generation = generation;
    this.player?.destroy();
    this.player = null;
    const src = this.getAttribute("src") || undefined;
    const assetId = this.getAttribute("asset-id") || undefined;
    if (Boolean(src) === Boolean(assetId)) {
      this.showError("Set either src or asset-id.");
      return;
    }
    this.container.innerHTML = '<div part="status">Preparing protected playback...</div>';
    try {
      if (this.hasAttribute("youtube-direct")) {
        const player = mountDirectYoutubePlayer({
          element: this.container,
          src,
          title: this.getAttribute("title") || "YouTube video",
        });
        if (this.generation !== generation) return player.destroy();
        this.player = player;
        this.dispatchEvent(new CustomEvent("unpirator-ready", { bubbles: true }));
        return;
      }
      const player = await mountProtectedPlayer({
        element: this.container,
        bootstrap: createPlaybackBootstrap({
          endpoint: this.getAttribute("endpoint") || "/api/unpirator/playback",
          src,
          assetId,
          title: this.getAttribute("title") || undefined,
          currentUser: this.currentUser,
        }),
        onError: (error) => this.fail(error),
      });
      if (this.generation !== generation) return player.destroy();
      this.player = player;
      if (this.hasAttribute("poster")) player.video.poster = this.getAttribute("poster");
      if (this.hasAttribute("autoplay")) player.video.play().catch(() => {});
      this.dispatchEvent(new CustomEvent("unpirator-ready", { bubbles: true }));
    } catch (error) {
      if (this.generation === generation) this.fail(error);
    }
  }

  fail(error) {
    this.showError("Protected playback is temporarily unavailable.");
    this.dispatchEvent(new CustomEvent("unpirator-error", { bubbles: true, detail: { error } }));
  }

  showError(message) {
    if (this.container)
      this.container.innerHTML = `<div part="status" role="alert">${message}</div>`;
  }
}

export function defineUnpiratorPlayer(name = "unpirator-player") {
  if (globalThis.customElements && !customElements.get(name))
    customElements.define(name, UnpiratorPlayerElement);
  return UnpiratorPlayerElement;
}

defineUnpiratorPlayer();
