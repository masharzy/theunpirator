const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
const HIDE_DELAY_MS = 2800;
const DOUBLE_TAP_MS = 300;
const RAPID_SEEK_CHAIN_MS = 780;
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 12;
const MINIMIZE_COMMIT_FRACTION = 0.24;
const FULLSCREEN_EXIT_FRACTION = 0.22;
const SPEED_STORAGE_KEY = "unpirator_player_speed";

const svg = (path, viewBox = "0 0 24 24") =>
  `<svg viewBox="${viewBox}" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;

const ICONS = {
  back: svg("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"),
  previous: svg("M6 6h2v12H6zM19 6.5v11L10 12z"),
  next: svg("M16 6h2v12h-2zM5 6.5v11L14 12z"),
  play: svg("M8 5v14l11-7z"),
  pause: svg("M6 5h4v14H6zm8 0h4v14h-4z"),
  volume: svg(
    "M3 9v6h4l5 4V5L7 9H3zm12.5 3A3.5 3.5 0 0 0 14 9.13v5.74A3.5 3.5 0 0 0 15.5 12zm0-7.1v2.06a7 7 0 0 1 0 10.08v2.06a9 9 0 0 0 0-14.2z",
  ),
  muted: svg(
    "M3 9v6h4l5 4V5L7 9H3zm12.6 3 2.2-2.2-1.4-1.4-2.2 2.2L12 8.4 10.6 9.8l2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4-2.2-2.2z",
  ),
  settings: svg(
    "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.87 3h-3.84l-.36 3.18c-.58.24-1.12.55-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58c-.05.31-.08.64-.08.94s.03.63.08.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.04.7 1.62.94l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.55 1.62-.94l2.39.96 1.92-3.32-2.02-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z",
  ),
  minimize: svg("M6 7h12v10H6V7zm2 2v6h8V9H8zm5 2h2v3h-3v-2h1v-1z"),
  fullscreen: svg(
    "M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3Zm-3-12v2h3v3h2V5h-5Z",
  ),
  fullscreenExit: svg(
    "M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z",
  ),
};

function styles(node, values) {
  Object.assign(node.style, values);
  return node;
}

function control(node) {
  node.dataset.unpiratorUiControl = "true";
  return node;
}

function button(label, icon, size = 44, circle = false) {
  const item = control(document.createElement("button"));
  item.type = "button";
  item.setAttribute("aria-label", label);
  item.innerHTML = icon;
  styles(item, {
    width: `${size}px`,
    height: `${size}px`,
    flex: `0 0 ${size}px`,
    border: "0",
    borderRadius: "999px",
    padding: circle ? "12px" : "10px",
    display: "grid",
    placeItems: "center",
    background: circle ? "rgba(66,72,77,.72)" : "transparent",
    color: "#fff",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  });
  const child = item.querySelector("svg");
  if (child) styles(child, { width: "100%", height: "100%" });
  return item;
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(tail).padStart(2, "0")}`
    : `${minutes}:${String(tail).padStart(2, "0")}`;
}

function speedLabel(value) {
  return `${Number(value)}×`;
}

function persistedSpeed() {
  try {
    const value = Number(localStorage.getItem(SPEED_STORAGE_KEY));
    return SPEEDS.includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

function persistSpeed(value) {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(value));
  } catch {}
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input,textarea,select,[contenteditable='true'],[role='textbox']"));
}

export function installPlayerExperience(player) {
  const video = player?.video;
  const frame = player?.frame || player?.root;
  if (!video || !frame || typeof document === "undefined") return () => {};

  const desktopQuery = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  let desktopMode = desktopQuery ? desktopQuery.matches : !navigator.maxTouchPoints;
  let destroyed = false;
  let visible = !desktopMode;
  let pointerInside = false;
  let keyboardActive = false;
  let spaceHoldTimer;
  let spaceHoldActive = false;
  let spaceHoldRestoreRate = 1;
  let spacePressArmed = false;
  let seeking = false;
  let experience = {};
  let hideTimer;
  let singleTapTimer;
  let rapidSeekTimer;
  let longPressTimer;
  let pointerStart;
  let draggingDown = false;
  let dragProgress = 0;
  let holdActive = false;
  let holdRestoreRate = 1;
  let pendingTapAt = 0;
  let pendingTapSide = 0;
  let rapidSide = 0;
  let rapidSeconds = 0;
  let rapidUntil = 0;
  let recoveryErrorVisible = false;
  let observerQueued = false;
  let lastPlayingVisual = null;

  video.controls = false;
  video.playsInline = true;
  video.setAttribute("controlsList", "nodownload");
  video.playbackRate = persistedSpeed();
  styles(video, {
    width: "100%",
    height: "100%",
    display: "block",
    background: "#000",
    objectFit: "contain",
    cursor: "default",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
  });
  styles(frame, {
    background: "#000",
    overflow: "hidden",
    transformOrigin: "50% 50%",
    outline: "none",
  });
  frame.tabIndex = -1;

  const ui = document.createElement("div");
  ui.dataset.unpiratorPlayerUi = "true";
  styles(ui, {
    position: "absolute",
    inset: "0",
    zIndex: "28",
    color: "#fff",
    fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    userSelect: "none",
    pointerEvents: "none",
    opacity: visible ? "1" : "0",
  });

  const desktopTitleBar = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 0 auto 0",
    minHeight: "82px",
    padding: "18px 22px 28px",
    boxSizing: "border-box",
    display: "none",
    alignItems: "flex-start",
    background: "linear-gradient(to bottom,rgba(0,0,0,.82),rgba(0,0,0,.42),transparent)",
    pointerEvents: "none",
  });
  const desktopTitle = styles(document.createElement("div"), {
    maxWidth: "min(860px,82%)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "16px",
    fontWeight: "700",
    textShadow: "0 2px 6px rgba(0,0,0,.85)",
  });
  desktopTitleBar.appendChild(desktopTitle);

  const mobileTop = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 0 auto 0",
    height: "62px",
    padding: "6px 6px 6px 4px",
    boxSizing: "border-box",
    display: desktopMode ? "none" : "flex",
    alignItems: "center",
    gap: "2px",
    background: "linear-gradient(to bottom,rgba(0,0,0,.72),rgba(0,0,0,0))",
    pointerEvents: "auto",
  });
  mobileTop.dataset.unpiratorUiControl = "true";
  const backButton = button("Back", ICONS.back, 46);
  const mobileTitle = styles(document.createElement("div"), {
    minWidth: "0",
    flex: "1",
    height: "46px",
    display: "flex",
    visibility: "hidden",
    alignItems: "center",
    paddingLeft: "2px",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: "13.5px",
    fontWeight: "700",
    textShadow: "0 1px 4px rgba(0,0,0,.75)",
  });
  const speedBadge = control(document.createElement("button"));
  speedBadge.type = "button";
  styles(speedBadge, {
    display: "none",
    width: "48px",
    height: "30px",
    border: "0",
    borderRadius: "999px",
    background: "rgba(28,28,28,.65)",
    color: "#fff",
    fontSize: "11.5px",
    fontWeight: "700",
    cursor: "pointer",
  });
  const mobileSettingsButton = button("Playback settings", ICONS.settings, 44);
  const mobileMinimizeButton = button("Mini player", ICONS.minimize, 44);
  mobileTop.append(backButton, mobileTitle, speedBadge, mobileSettingsButton, mobileMinimizeButton);

  const mobileCenter = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    height: "76px",
    display: desktopMode ? "none" : "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "18px",
    pointerEvents: "auto",
  });
  mobileCenter.dataset.unpiratorUiControl = "true";
  const previousButton = button("Previous class", ICONS.previous, 56, true);
  const mobilePlayPause = button("Play", ICONS.play, 70, true);
  const nextButton = button("Next class", ICONS.next, 56, true);
  mobileCenter.append(previousButton, mobilePlayPause, nextButton);

  const bottom = styles(document.createElement("div"), {
    position: "absolute",
    inset: "auto 0 0 0",
    minHeight: "68px",
    padding: desktopMode ? "0 16px 8px" : "0 6px 4px 8px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    background: "linear-gradient(to top,rgba(0,0,0,.82),rgba(0,0,0,.26),transparent)",
    pointerEvents: "auto",
  });
  bottom.dataset.unpiratorUiControl = "true";

  const seekHit = control(
    styles(document.createElement("div"), {
      position: "relative",
      height: desktopMode ? "18px" : "28px",
      display: "flex",
      alignItems: "center",
      cursor: "pointer",
      touchAction: "none",
    }),
  );
  seekHit.setAttribute("role", "slider");
  seekHit.setAttribute("aria-label", "Video progress");
  seekHit.tabIndex = 0;
  const seekBase = styles(document.createElement("div"), {
    position: "absolute",
    left: "0",
    right: "0",
    height: desktopMode ? "4px" : "3px",
    borderRadius: "999px",
    background: "rgba(78,78,78,.74)",
    overflow: "hidden",
  });
  const seekBuffered = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 auto 0 0",
    width: "0%",
    background: "rgba(220,220,220,.70)",
  });
  const seekPlayed = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 auto 0 0",
    width: "0%",
    background: "#ff0046",
  });
  const seekThumb = styles(document.createElement("div"), {
    position: "absolute",
    left: "0%",
    top: "50%",
    width: desktopMode ? "12px" : "12px",
    height: desktopMode ? "12px" : "12px",
    borderRadius: "999px",
    background: "#ff0046",
    transform: "translate(-50%,-50%) scale(.78)",
  });
  seekBase.append(seekBuffered, seekPlayed);
  seekHit.append(seekBase, seekThumb);

  const bottomRow = styles(document.createElement("div"), {
    height: desktopMode ? "46px" : "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  });
  const desktopLeft = styles(document.createElement("div"), {
    display: desktopMode ? "flex" : "none",
    alignItems: "center",
    gap: "8px",
  });
  const desktopPlayPause = button("Play", ICONS.play, 42, true);
  const volumeButton = button("Mute", ICONS.volume, 42, true);
  const desktopTime = styles(document.createElement("div"), {
    minWidth: "108px",
    height: "40px",
    padding: "0 16px",
    boxSizing: "border-box",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(82,88,93,.78)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "700",
    fontVariantNumeric: "tabular-nums",
    textShadow: "0 1px 3px rgba(0,0,0,.55)",
  });
  desktopTime.textContent = "0:00 / 0:00";
  desktopLeft.append(desktopPlayPause, volumeButton, desktopTime);

  const mobileTime = styles(document.createElement("div"), {
    display: desktopMode ? "none" : "block",
    flex: "1",
    fontSize: "12px",
    fontWeight: "500",
    textShadow: "0 1px 4px rgba(0,0,0,.8)",
  });
  mobileTime.textContent = "0:00 / 0:00";

  const desktopRight = styles(document.createElement("div"), {
    display: desktopMode ? "flex" : "none",
    alignItems: "center",
    gap: "4px",
  });
  const desktopSettingsButton = button("Playback settings", ICONS.settings, 42);
  const desktopMinimizeButton = button("Mini player", ICONS.minimize, 42);
  const fullscreenButton = button("Full screen", ICONS.fullscreen, 44);
  desktopRight.append(desktopSettingsButton, desktopMinimizeButton, fullscreenButton);

  const mobileRight = styles(document.createElement("div"), {
    display: desktopMode ? "none" : "flex",
    alignItems: "center",
  });
  const mobileFullscreenButton = button("Full screen", ICONS.fullscreen, 48);
  mobileRight.appendChild(mobileFullscreenButton);
  bottomRow.append(desktopLeft, mobileTime, desktopRight, mobileRight);
  bottom.append(seekHit, bottomRow);

  const loading = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    minWidth: "118px",
    height: "38px",
    padding: "0 14px",
    boxSizing: "border-box",
    borderRadius: "999px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(28,28,28,.72)",
    fontSize: "13px",
    fontWeight: "700",
    pointerEvents: "none",
  });
  loading.textContent = "Loading…";

  const fastBadge = styles(document.createElement("div"), {
    position: "absolute",
    top: "22px",
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: "116px",
    height: "40px",
    padding: "0 14px",
    boxSizing: "border-box",
    borderRadius: "999px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(28,28,28,.72)",
    fontSize: "13px",
    fontWeight: "700",
    zIndex: "35",
    pointerEvents: "none",
  });

  const settingsPanel = control(
    styles(document.createElement("div"), {
      position: "absolute",
      right: "12px",
      bottom: desktopMode ? "64px" : "auto",
      top: desktopMode ? "auto" : "54px",
      zIndex: "36",
      width: "min(300px,calc(100% - 24px))",
      maxHeight: "calc(100% - 74px)",
      overflowY: "auto",
      display: "none",
      padding: "10px",
      borderRadius: "12px",
      background: "rgba(20,20,20,.96)",
      boxShadow: "0 14px 40px rgba(0,0,0,.38)",
      pointerEvents: "auto",
    }),
  );

  const seekFeedback = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0",
    zIndex: "33",
    display: "none",
    pointerEvents: "none",
    opacity: "0",
    transform: "scale(.975)",
  });
  const seekBubble = styles(document.createElement("div"), {
    position: "absolute",
    top: "0",
    height: "100%",
    width: "68%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "rgba(58,58,58,.57)",
    color: "#fff",
    fontWeight: "700",
  });
  const arrowRow = styles(document.createElement("div"), {
    display: "flex",
    alignItems: "center",
    gap: "3px",
  });
  const arrowNodes = [90, 165, 255].map((alpha) => {
    const node = document.createElement("span");
    node.textContent = "›";
    styles(node, { fontSize: "30px", lineHeight: "1", opacity: String(alpha / 255) });
    arrowRow.appendChild(node);
    return node;
  });
  const seekLabel = styles(document.createElement("div"), {
    fontSize: "13.5px",
    fontWeight: "700",
    textShadow: "0 1px 3px rgba(0,0,0,.65)",
  });
  seekBubble.append(arrowRow, seekLabel);
  seekFeedback.appendChild(seekBubble);

  const errorPanel = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    zIndex: "40",
    width: "min(390px,calc(100% - 34px))",
    display: "none",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    padding: "18px",
    borderRadius: "16px",
    background: "rgba(10,10,10,.90)",
    color: "#fff",
    textAlign: "center",
    pointerEvents: "auto",
  });
  errorPanel.dataset.unpiratorUiControl = "true";

  ui.append(
    desktopTitleBar,
    mobileTop,
    mobileCenter,
    bottom,
    loading,
    fastBadge,
    settingsPanel,
    seekFeedback,
  );
  frame.append(ui, errorPanel);

  const pulse = (node, strong = false) => {
    node.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: `scale(${strong ? 0.82 : 0.9})`, opacity: 0.66 },
        { transform: "scale(1)", opacity: node.disabled ? 0.33 : 1 },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  };

  const isPlayerFullscreen = () => {
    const full = document.fullscreenElement;
    if (!full) return false;
    return full === frame || full === player.host || full === player.root || full.contains?.(frame);
  };

  const updateTitleVisibility = () => {
    const title = typeof experience.title === "string" ? experience.title.trim() : "";
    mobileTitle.textContent = title;
    desktopTitle.textContent = title;
    mobileTitle.style.visibility = !desktopMode && visible && title ? "visible" : "hidden";
    desktopTitleBar.style.display =
      desktopMode && visible && title && isPlayerFullscreen() ? "flex" : "none";
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (desktopMode) return;
    if (!video.paused && !video.ended && !seeking && settingsPanel.style.display === "none")
      hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  const setVisible = (next, immediate = false) => {
    if (destroyed) return;
    if (desktopMode && next && !pointerInside && !isPlayerFullscreen()) next = false;
    visible = next;
    clearTimeout(hideTimer);
    if (!next) settingsPanel.style.display = "none";
    mobileTop.style.pointerEvents = next && !desktopMode ? "auto" : "none";
    mobileCenter.style.pointerEvents = next && !desktopMode ? "auto" : "none";
    bottom.style.pointerEvents = next ? "auto" : "none";
    ui.getAnimations().forEach((item) => item.cancel());
    if (immediate) {
      ui.style.opacity = next ? "1" : "0";
    } else {
      ui.animate([{ opacity: next ? 0 : 1 }, { opacity: next ? 1 : 0 }], {
        duration: desktopMode ? 100 : next ? 230 : 190,
        easing: next ? "cubic-bezier(.1,.72,.2,1)" : "ease-out",
        fill: "forwards",
      }).onfinish = () => {
        if (!destroyed) ui.style.opacity = next ? "1" : "0";
      };
    }
    updateTitleVisibility();
    if (next) scheduleHide();
  };

  const updatePlayPause = (animate = true) => {
    const playing = !video.paused && !video.ended;
    if (lastPlayingVisual === playing) return;
    lastPlayingVisual = playing;
    for (const node of [desktopPlayPause, mobilePlayPause]) {
      node.innerHTML = playing ? ICONS.pause : ICONS.play;
      node.setAttribute("aria-label", playing ? "Pause" : "Play");
      const child = node.querySelector("svg");
      if (child) styles(child, { width: "100%", height: "100%" });
      if (animate && !desktopMode) {
        node.animate(
          [
            { transform: `rotate(${playing ? -5 : 5}deg) scale(.78)` },
            { transform: "rotate(0deg) scale(1)" },
          ],
          { duration: 175, easing: "cubic-bezier(.2,1.45,.35,1)" },
        );
      }
    }
    if (playing) scheduleHide();
    else clearTimeout(hideTimer);
  };

  const updateVolume = () => {
    const muted = video.muted || Number(video.volume) === 0;
    volumeButton.innerHTML = muted ? ICONS.muted : ICONS.volume;
    volumeButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    const child = volumeButton.querySelector("svg");
    if (child) styles(child, { width: "100%", height: "100%" });
  };

  const updateFullscreen = () => {
    const full = isPlayerFullscreen();
    for (const node of [fullscreenButton, mobileFullscreenButton]) {
      node.innerHTML = full ? ICONS.fullscreenExit : ICONS.fullscreen;
      node.setAttribute("aria-label", full ? "Exit full screen" : "Full screen");
      const child = node.querySelector("svg");
      if (child) styles(child, { width: "100%", height: "100%" });
    }
    updateTitleVisibility();
  };

  const updateSpeedBadge = () => {
    const rate = Number(video.playbackRate || 1);
    speedBadge.textContent = speedLabel(rate);
    speedBadge.style.display = !desktopMode && Math.abs(rate - 1) >= 0.001 ? "inline-flex" : "none";
    speedBadge.style.alignItems = "center";
    speedBadge.style.justifyContent = "center";
  };

  const updateProgress = () => {
    const duration = Number(video.duration);
    const current = Number(video.currentTime || 0);
    const ratio =
      Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
    let buffered = 0;
    if (Number.isFinite(duration) && duration > 0 && video.buffered?.length) {
      try {
        for (let i = 0; i < video.buffered.length; i += 1) {
          if (video.buffered.start(i) <= current && video.buffered.end(i) >= current) {
            buffered = Math.min(1, video.buffered.end(i) / duration);
            break;
          }
        }
      } catch {}
    }
    seekPlayed.style.width = `${ratio * 100}%`;
    seekBuffered.style.width = `${buffered * 100}%`;
    seekThumb.style.left = `${ratio * 100}%`;
    const text = `${formatTime(current)} / ${formatTime(duration)}`;
    desktopTime.textContent = text;
    mobileTime.textContent = text;
  };

  const seekToPointer = (event) => {
    const rect = seekHit.getBoundingClientRect();
    const duration = Number(video.duration);
    if (!rect.width || !Number.isFinite(duration) || duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    video.currentTime = duration * ratio;
    updateProgress();
  };

  const seekBy = (seconds) => {
    const duration = Number(video.duration);
    const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    video.currentTime = Math.max(0, Math.min(upper, Number(video.currentTime || 0) + seconds));
    updateProgress();
  };

  const showSeekFeedback = (side, seconds) => {
    if (desktopMode) return;
    clearTimeout(rapidSeekTimer);
    seekFeedback.style.display = "block";
    if (side < 0) {
      seekBubble.style.left = "-18%";
      seekBubble.style.right = "auto";
      seekBubble.style.borderRadius = "0 999px 999px 0";
      arrowNodes.forEach((node, index) => {
        node.textContent = "‹";
        node.style.opacity = String([255, 165, 90][index] / 255);
      });
    } else {
      seekBubble.style.right = "-18%";
      seekBubble.style.left = "auto";
      seekBubble.style.borderRadius = "999px 0 0 999px";
      arrowNodes.forEach((node, index) => {
        node.textContent = "›";
        node.style.opacity = String([90, 165, 255][index] / 255);
      });
    }
    seekLabel.textContent = `${seconds} seconds`;
    seekFeedback.getAnimations().forEach((item) => item.cancel());
    seekFeedback.animate(
      [
        { opacity: Number(seekFeedback.style.opacity || 0), transform: "scale(.975)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 130, easing: "cubic-bezier(.2,0,0,1)", fill: "forwards" },
    );
    seekFeedback.style.opacity = "1";
    seekFeedback.style.transform = "scale(1)";
    rapidSeekTimer = setTimeout(() => {
      const fade = seekFeedback.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.025)" },
        ],
        { duration: 210, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
      );
      fade.onfinish = () => {
        if (!destroyed) {
          seekFeedback.style.display = "none";
          seekFeedback.style.opacity = "0";
          seekFeedback.style.transform = "scale(1)";
        }
      };
    }, 620);
  };

  const togglePlayback = () => {
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = async () => {
    const target = player.host || frame;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen?.();
    } catch {}
  };

  const canMiniPlayer = () =>
    typeof experience.onMinimize === "function" ||
    Boolean(document.pictureInPictureEnabled && video.requestPictureInPicture);

  const requestMiniPlayer = async () => {
    if (typeof experience.onMinimize === "function") {
      experience.onMinimize();
      return;
    }
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture?.();
      else await video.requestPictureInPicture();
    } catch {}
  };

  const renderSettings = () => {
    settingsPanel.replaceChildren();
    const section = (label) => {
      const node = styles(document.createElement("div"), {
        margin: "2px 2px 8px",
        fontSize: "12px",
        fontWeight: "800",
        color: "rgba(255,255,255,.72)",
      });
      node.textContent = label;
      return node;
    };
    const choice = (label, active, onClick) => {
      const node = control(document.createElement("button"));
      node.type = "button";
      node.textContent = `${active ? "✓ " : ""}${label}`;
      styles(node, {
        minHeight: "38px",
        border: "0",
        borderRadius: "9px",
        padding: "8px 10px",
        background: active ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: active ? "800" : "600",
        cursor: "pointer",
        textAlign: "left",
      });
      node.onclick = onClick;
      return node;
    };
    settingsPanel.appendChild(section("Playback speed"));
    const speedGrid = styles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "repeat(3,minmax(0,1fr))",
      gap: "6px",
      marginBottom: "12px",
    });
    SPEEDS.forEach((rate) => {
      speedGrid.appendChild(
        choice(speedLabel(rate), Math.abs(video.playbackRate - rate) < 0.001, () => {
          video.playbackRate = rate;
          persistSpeed(rate);
          updateSpeedBadge();
          settingsPanel.style.display = "none";
          if (!desktopMode) setVisible(true);
        }),
      );
    });
    settingsPanel.appendChild(speedGrid);
    const variants = player.protected?.manifest?.video || [];
    if (variants.length) {
      settingsPanel.appendChild(section("Quality"));
      const qualityGrid = styles(document.createElement("div"), {
        display: "grid",
        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
        gap: "6px",
      });
      variants.forEach((variant, index) => {
        qualityGrid.appendChild(
          choice(
            variant.qualityLabel || `${variant.height || index + 1}p`,
            Number(player.protected?.videoVariant) === index,
            async (event) => {
              event.currentTarget.disabled = true;
              try {
                await player.protected?.setQuality(index);
                renderSettings();
              } catch (error) {
                player.handlePlaybackError?.(error);
              }
            },
          ),
        );
      });
      settingsPanel.appendChild(qualityGrid);
    }
  };

  const applyExperience = () => {
    const title = typeof experience.title === "string" ? experience.title.trim() : "";
    mobileTitle.textContent = title;
    desktopTitle.textContent = title;
    backButton.style.display = typeof experience.onBack === "function" ? "grid" : "none";
    const miniAvailable = canMiniPlayer();
    mobileMinimizeButton.style.display = miniAvailable ? "grid" : "none";
    desktopMinimizeButton.style.display = miniAvailable ? "grid" : "none";
    previousButton.style.display = typeof experience.onPrevious === "function" ? "grid" : "none";
    nextButton.style.display = typeof experience.onNext === "function" ? "grid" : "none";
    previousButton.disabled = experience.hasPrevious === false;
    nextButton.disabled = experience.hasNext === false;
    previousButton.style.opacity = previousButton.disabled ? ".33" : "1";
    nextButton.style.opacity = nextButton.disabled ? ".33" : "1";
    updateTitleVisibility();
  };

  player.setExperienceOptions = (next = {}) => {
    experience = { ...experience, ...next };
    applyExperience();
  };
  applyExperience();

  const applyModeLayout = () => {
    mobileTop.style.display = desktopMode ? "none" : "flex";
    mobileCenter.style.display = desktopMode ? "none" : "flex";
    desktopLeft.style.display = desktopMode ? "flex" : "none";
    desktopRight.style.display = desktopMode ? "flex" : "none";
    mobileTime.style.display = desktopMode ? "none" : "block";
    mobileRight.style.display = desktopMode ? "none" : "flex";
    bottom.style.padding = desktopMode ? "0 16px 8px" : "0 6px 4px 8px";
    bottomRow.style.height = desktopMode ? "46px" : "38px";
    seekHit.style.height = desktopMode ? "18px" : "28px";
    seekBase.style.height = desktopMode ? "4px" : "3px";
    settingsPanel.style.top = desktopMode ? "auto" : "54px";
    settingsPanel.style.bottom = desktopMode ? "64px" : "auto";
    updateSpeedBadge();
    updateTitleVisibility();
  };

  const resetDrag = () => {
    draggingDown = false;
    dragProgress = 0;
    frame.getAnimations().forEach((item) => item.cancel());
    styles(frame, {
      transform: "translate3d(0,0,0) scale(1)",
      opacity: "1",
      transformOrigin: "50% 50%",
    });
    ui.style.opacity = visible ? "1" : "0";
  };

  const commitDrag = async (fullscreen) => {
    clearTimeout(hideTimer);
    const animation = frame.animate(
      fullscreen
        ? [
            {
              transform: frame.style.transform || "scale(1)",
              opacity: Number(frame.style.opacity || 1),
            },
            { transform: "translate3d(0,22%,0) scale(.84)", opacity: 0.5 },
          ]
        : [
            {
              transform: frame.style.transform || "scale(1)",
              opacity: Number(frame.style.opacity || 1),
            },
            { transform: "translate3d(16%,34%,0) scale(.66)", opacity: 0.92 },
          ],
      { duration: fullscreen ? 165 : 150, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
    );
    animation.onfinish = async () => {
      if (fullscreen) {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else experience.onBack?.();
        } catch {
          experience.onBack?.();
        }
      } else {
        await requestMiniPlayer();
      }
      resetDrag();
    };
  };

  const onPointerDown = (event) => {
    keyboardActive = true;
    frame.focus?.({ preventScroll: true });
    if (desktopMode) return;
    if (event.button !== undefined && event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    draggingDown = false;
    dragProgress = 0;
    video.setPointerCapture?.(event.pointerId);
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!pointerStart || draggingDown || destroyed) return;
      holdActive = true;
      holdRestoreRate = Number(video.playbackRate || 1);
      video.playbackRate = 2;
      fastBadge.textContent = "2×  Hold";
      fastBadge.style.display = "flex";
      clearTimeout(hideTimer);
    }, LONG_PRESS_MS);
  };

  const finishHold = () => {
    clearTimeout(longPressTimer);
    if (!holdActive) return false;
    holdActive = false;
    video.playbackRate = holdRestoreRate;
    fastBadge.style.display = "none";
    updateSpeedBadge();
    setVisible(true);
    return true;
  };

  const onPointerMove = (event) => {
    if (desktopMode) return;
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
      clearTimeout(longPressTimer);
      if (holdActive) finishHold();
    }
    if (!draggingDown && dy > MOVE_TOLERANCE_PX && Math.abs(dy) > Math.abs(dx) * 1.05) {
      draggingDown = true;
      clearTimeout(hideTimer);
    }
    if (!draggingDown) return;
    const fullscreen = Boolean(document.fullscreenElement);
    const rect = frame.getBoundingClientRect();
    const denominator = Math.max(rect.height, 180) * (fullscreen ? 0.58 : 0.7);
    dragProgress = Math.max(0, Math.min(1, dy / denominator));
    const dragY = Math.max(0, dy);
    if (fullscreen) {
      const scale = 1 - 0.14 * dragProgress;
      styles(frame, {
        transformOrigin: "50% 50%",
        transform: `translate3d(0,${dragY * 0.56}px,0) scale(${scale})`,
        opacity: String(1 - 0.18 * dragProgress),
      });
      ui.style.opacity = String(Math.max(0.05, 1 - dragProgress * 0.92));
    } else {
      const scale = 1 - 0.31 * dragProgress;
      styles(frame, {
        transformOrigin: "100% 100%",
        transform: `translate3d(${rect.width * 0.12 * dragProgress}px,${dragY * 0.68}px,0) scale(${scale})`,
        opacity: "1",
      });
      ui.style.opacity = String(Math.max(0.08, 1 - dragProgress * 0.9));
    }
  };

  const finishSurfacePointer = (event) => {
    if (desktopMode) {
      clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(() => {
        singleTapTimer = null;
        togglePlayback();
      }, 220);
      return;
    }
    if (!pointerStart) {
      finishHold();
      return;
    }
    clearTimeout(longPressTimer);
    video.releasePointerCapture?.(event.pointerId);
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const distance = Math.hypot(dx, dy);
    const wasHold = finishHold();
    pointerStart = null;
    if (draggingDown) {
      const fullscreen = Boolean(document.fullscreenElement);
      const commit =
        dragProgress >= (fullscreen ? FULLSCREEN_EXIT_FRACTION : MINIMIZE_COMMIT_FRACTION);
      draggingDown = false;
      if (commit && (fullscreen || canMiniPlayer())) commitDrag(fullscreen);
      else {
        frame.animate(
          [
            { transform: frame.style.transform, opacity: Number(frame.style.opacity || 1) },
            { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
          ],
          { duration: 230, easing: "cubic-bezier(.2,1.35,.35,1)", fill: "forwards" },
        ).onfinish = resetDrag;
      }
      return;
    }
    if (wasHold || distance > MOVE_TOLERANCE_PX) return;
    const rect = video.getBoundingClientRect();
    const side = event.clientX - rect.left < rect.width / 2 ? -1 : 1;
    const now = Date.now();
    if (now <= rapidUntil && side === rapidSide) {
      rapidSeconds += 10;
      rapidUntil = now + RAPID_SEEK_CHAIN_MS;
      seekBy(side * 10);
      showSeekFeedback(side, rapidSeconds);
      return;
    }
    if (singleTapTimer && now - pendingTapAt <= DOUBLE_TAP_MS && side === pendingTapSide) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      rapidSide = side;
      rapidSeconds = 10;
      rapidUntil = now + RAPID_SEEK_CHAIN_MS;
      seekBy(side * 10);
      showSeekFeedback(side, rapidSeconds);
      return;
    }
    clearTimeout(singleTapTimer);
    pendingTapAt = now;
    pendingTapSide = side;
    singleTapTimer = setTimeout(() => {
      singleTapTimer = null;
      setVisible(!visible);
    }, DOUBLE_TAP_MS);
  };

  const onPointerCancel = () => {
    clearTimeout(longPressTimer);
    pointerStart = null;
    finishHold();
    if (draggingDown) resetDrag();
  };

  const onDesktopDoubleClick = (event) => {
    if (!desktopMode) return;
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    event.preventDefault();
    toggleFullscreen();
  };

  const onPointerEnter = () => {
    if (!desktopMode) return;
    pointerInside = true;
    keyboardActive = true;
    setVisible(true, true);
  };

  const onPointerLeave = () => {
    if (!desktopMode) return;
    pointerInside = false;
    setVisible(false, true);
  };

  const syncCoreRecoveryUi = () => {
    observerQueued = false;
    if (destroyed) return;
    const coreControls = player.controls;
    const retry = player.retryButton;
    const error = player.errorMessage;
    if (retry) {
      retry.dataset.unpiratorRetry = "true";
      if (retry.textContent !== "Refresh video") retry.textContent = "Refresh video";
      retry.dataset.unpiratorUiControl = "true";
      styles(retry, {
        minWidth: "148px",
        height: "42px",
        border: "0",
        borderRadius: "999px",
        padding: "0 18px",
        background: "#fff",
        color: "#111",
        fontSize: "13px",
        fontWeight: "800",
        cursor: "pointer",
      });
      if (retry.parentNode !== errorPanel) errorPanel.appendChild(retry);
    }
    if (error) {
      error.dataset.unpiratorErrorMessage = "true";
      styles(error, {
        position: "static",
        inset: "auto",
        width: "auto",
        padding: "0",
        background: "transparent",
        color: "#fff",
        textAlign: "center",
        font: "600 14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        lineHeight: "1.5",
      });
      if (error.parentNode !== errorPanel) errorPanel.prepend(error);
    }
    if (coreControls && coreControls !== ui && coreControls.parentNode)
      coreControls.style.display = "none";
    const hasError = Boolean(player.errorMessage?.isConnected);
    errorPanel.style.display = hasError ? "flex" : "none";
    if (hasError) {
      recoveryErrorVisible = true;
      setVisible(false, true);
    } else if (recoveryErrorVisible) {
      recoveryErrorVisible = false;
      setVisible(!desktopMode || pointerInside, true);
    }
  };

  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    queueMicrotask(syncCoreRecoveryUi);
  });
  observer.observe(frame, { childList: true });
  syncCoreRecoveryUi();

  const openSettings = (buttonNode) => {
    pulse(buttonNode);
    renderSettings();
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
    clearTimeout(hideTimer);
  };

  backButton.onclick = () => {
    pulse(backButton);
    experience.onBack?.();
  };
  mobileMinimizeButton.onclick = async () => {
    pulse(mobileMinimizeButton);
    await requestMiniPlayer();
  };
  desktopMinimizeButton.onclick = async () => {
    pulse(desktopMinimizeButton);
    await requestMiniPlayer();
  };
  previousButton.onclick = () => {
    if (previousButton.disabled) return;
    pulse(previousButton, true);
    experience.onPrevious?.();
    setVisible(true);
  };
  nextButton.onclick = () => {
    if (nextButton.disabled) return;
    pulse(nextButton, true);
    experience.onNext?.();
    setVisible(true);
  };
  mobilePlayPause.onclick = () => {
    pulse(mobilePlayPause, true);
    togglePlayback();
    setVisible(true);
  };
  desktopPlayPause.onclick = () => {
    pulse(desktopPlayPause, true);
    togglePlayback();
  };
  volumeButton.onclick = () => {
    video.muted = !video.muted;
    updateVolume();
  };
  mobileSettingsButton.onclick = () => openSettings(mobileSettingsButton);
  desktopSettingsButton.onclick = () => openSettings(desktopSettingsButton);
  speedBadge.onclick = () => mobileSettingsButton.click();
  fullscreenButton.onclick = () => toggleFullscreen();
  mobileFullscreenButton.onclick = () => toggleFullscreen();

  const onSeekDown = (event) => {
    seeking = true;
    clearTimeout(hideTimer);
    seekHit.setPointerCapture?.(event.pointerId);
    seekThumb.style.transform = "translate(-50%,-50%) scale(1)";
    seekToPointer(event);
  };
  const onSeekMove = (event) => {
    if (seeking) seekToPointer(event);
  };
  const finishSeek = (event) => {
    if (!seeking) return;
    seeking = false;
    seekHit.releasePointerCapture?.(event.pointerId);
    seekThumb.style.transform = "translate(-50%,-50%) scale(.78)";
    updateProgress();
    if (!desktopMode) setVisible(true);
  };
  const onSeekKey = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    seekBy(event.key === "ArrowLeft" ? -5 : 5);
  };

  const adjustSpeed = (direction) => {
    const current = Number(video.playbackRate || 1);
    let index = SPEEDS.findIndex((rate) => rate >= current - 0.001);
    if (index < 0) index = SPEEDS.indexOf(1);
    const nextIndex = Math.max(0, Math.min(SPEEDS.length - 1, index + direction));
    video.playbackRate = SPEEDS[nextIndex];
    persistSpeed(SPEEDS[nextIndex]);
  };

  const beginSpaceHold = () => {
    if (spacePressArmed || spaceHoldActive) return;
    spacePressArmed = true;
    clearTimeout(spaceHoldTimer);
    spaceHoldTimer = setTimeout(() => {
      if (!spacePressArmed || destroyed) return;
      spaceHoldTimer = null;
      spaceHoldActive = true;
      spaceHoldRestoreRate = Number(video.playbackRate || 1);
      video.playbackRate = 2;
      fastBadge.textContent = "2×  Hold";
      fastBadge.style.display = "flex";
      clearTimeout(hideTimer);
    }, LONG_PRESS_MS);
  };

  const finishSpacePress = () => {
    if (!spacePressArmed && !spaceHoldActive) return false;
    const wasHold = spaceHoldActive;
    clearTimeout(spaceHoldTimer);
    spaceHoldTimer = null;
    spacePressArmed = false;
    if (spaceHoldActive) {
      spaceHoldActive = false;
      video.playbackRate = spaceHoldRestoreRate;
      fastBadge.style.display = "none";
      updateSpeedBadge();
    }
    return wasHold;
  };

  const onKeyDown = (event) => {
    if (
      !desktopMode ||
      (!keyboardActive && !isPlayerFullscreen()) ||
      isEditableTarget(event.target)
    )
      return;
    const key = event.key;
    const lower = key.toLowerCase();
    if (key === " ") {
      event.preventDefault();
      if (!event.repeat) beginSpaceHold();
      return;
    }
    let handled = true;
    if (lower === "k" && !event.repeat) togglePlayback();
    else if (lower === "j") seekBy(-10);
    else if (lower === "l") seekBy(10);
    else if (key === "ArrowLeft") seekBy(-5);
    else if (key === "ArrowRight") seekBy(5);
    else if (key === "ArrowUp") {
      video.muted = false;
      video.volume = Math.min(1, Number(video.volume || 0) + 0.05);
    } else if (key === "ArrowDown") {
      video.volume = Math.max(0, Number(video.volume || 0) - 0.05);
      if (video.volume === 0) video.muted = true;
    } else if (lower === "m" && !event.repeat) video.muted = !video.muted;
    else if (lower === "f" && !event.repeat) toggleFullscreen();
    else if (lower === "i" && !event.repeat && canMiniPlayer()) requestMiniPlayer();
    else if (key === "Home") video.currentTime = 0;
    else if (key === "End" && Number.isFinite(video.duration)) video.currentTime = video.duration;
    else if (/^[0-9]$/.test(key) && Number.isFinite(video.duration))
      video.currentTime = video.duration * (Number(key) / 10);
    else if (key === "," || key === "<") adjustSpeed(-1);
    else if (key === "." || key === ">") adjustSpeed(1);
    else if (event.shiftKey && lower === "n" && typeof experience.onNext === "function")
      experience.onNext();
    else if (event.shiftKey && lower === "p" && typeof experience.onPrevious === "function")
      experience.onPrevious();
    else handled = false;
    if (!handled) return;
    event.preventDefault();
    updateProgress();
    updateVolume();
    updateSpeedBadge();
  };

  const onKeyUp = (event) => {
    if (event.key !== " " || (!spacePressArmed && !spaceHoldActive)) return;
    event.preventDefault();
    const wasHold = finishSpacePress();
    if (!wasHold) togglePlayback();
  };

  const onWindowBlur = () => {
    if (spacePressArmed || spaceHoldActive) finishSpacePress();
  };

  const onDocumentPointerDown = (event) => {
    if (!desktopMode) return;
    const path = event.composedPath?.() || [];
    const host = player.host || player.root;
    if (!path.includes(host) && !path.includes(frame) && !path.includes(video))
      keyboardActive = false;
  };

  const onPlaying = () => {
    loading.style.display = "none";
    updatePlayPause();
    updateProgress();
    scheduleHide();
  };
  const onWaiting = () => {
    loading.style.display = "flex";
    if (!desktopMode || pointerInside) setVisible(true);
  };
  const onPause = () => {
    loading.style.display = "none";
    updatePlayPause();
    if (!desktopMode) setVisible(true);
  };
  const onCanPlay = () => {
    loading.style.display = "none";
    updateProgress();
  };
  const onRateChange = () => updateSpeedBadge();
  const onVolumeChange = () => updateVolume();
  const onFullscreenChange = () => {
    updateFullscreen();
    if (desktopMode) setVisible(pointerInside, true);
  };
  const onModeChange = (event) => {
    desktopMode = event.matches;
    pointerInside = false;
    applyModeLayout();
    setVisible(!desktopMode, true);
    if (!desktopMode) scheduleHide();
  };

  seekHit.addEventListener("pointerdown", onSeekDown);
  seekHit.addEventListener("pointermove", onSeekMove);
  seekHit.addEventListener("pointerup", finishSeek);
  seekHit.addEventListener("pointercancel", finishSeek);
  seekHit.addEventListener("keydown", onSeekKey);

  video.addEventListener("pointerdown", onPointerDown);
  video.addEventListener("pointermove", onPointerMove);
  video.addEventListener("pointerup", finishSurfacePointer);
  video.addEventListener("pointercancel", onPointerCancel);
  video.addEventListener("dblclick", onDesktopDoubleClick);
  frame.addEventListener("pointerenter", onPointerEnter);
  frame.addEventListener("pointerleave", onPointerLeave);
  const preventContext = (event) => event.preventDefault();
  video.addEventListener("contextmenu", preventContext);

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  desktopQuery?.addEventListener?.("change", onModeChange);

  video.addEventListener("play", updatePlayPause);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("pause", onPause);
  video.addEventListener("ended", onPause);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("stalled", onWaiting);
  video.addEventListener("canplay", onCanPlay);
  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("durationchange", updateProgress);
  video.addEventListener("progress", updateProgress);
  video.addEventListener("ratechange", onRateChange);
  video.addEventListener("volumechange", onVolumeChange);

  applyModeLayout();
  updatePlayPause(false);
  updateVolume();
  updateFullscreen();
  updateSpeedBadge();
  updateProgress();
  setVisible(!desktopMode, true);
  if (!desktopMode) scheduleHide();

  return () => {
    destroyed = true;
    clearTimeout(hideTimer);
    clearTimeout(singleTapTimer);
    clearTimeout(rapidSeekTimer);
    clearTimeout(longPressTimer);
    clearTimeout(spaceHoldTimer);
    if (spaceHoldActive) {
      video.playbackRate = spaceHoldRestoreRate;
      fastBadge.style.display = "none";
    }
    observer.disconnect();
    delete player.setExperienceOptions;
    seekHit.removeEventListener("pointerdown", onSeekDown);
    seekHit.removeEventListener("pointermove", onSeekMove);
    seekHit.removeEventListener("pointerup", finishSeek);
    seekHit.removeEventListener("pointercancel", finishSeek);
    seekHit.removeEventListener("keydown", onSeekKey);
    video.removeEventListener("pointerdown", onPointerDown);
    video.removeEventListener("pointermove", onPointerMove);
    video.removeEventListener("pointerup", finishSurfacePointer);
    video.removeEventListener("pointercancel", onPointerCancel);
    video.removeEventListener("dblclick", onDesktopDoubleClick);
    frame.removeEventListener("pointerenter", onPointerEnter);
    frame.removeEventListener("pointerleave", onPointerLeave);
    video.removeEventListener("contextmenu", preventContext);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    desktopQuery?.removeEventListener?.("change", onModeChange);
    video.removeEventListener("play", updatePlayPause);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("ended", onPause);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("stalled", onWaiting);
    video.removeEventListener("canplay", onCanPlay);
    video.removeEventListener("timeupdate", updateProgress);
    video.removeEventListener("durationchange", updateProgress);
    video.removeEventListener("progress", updateProgress);
    video.removeEventListener("ratechange", onRateChange);
    video.removeEventListener("volumechange", onVolumeChange);
    ui.remove();
    errorPanel.remove();
    resetDrag();
  };
}
