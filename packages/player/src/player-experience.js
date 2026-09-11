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
  settings: svg(
    "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.87 3h-3.84l-.36 3.18c-.58.24-1.12.55-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58c-.05.31-.08.64-.08.94s.03.63.08.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.04.7 1.62.94l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.55 1.62-.94l2.39.96 1.92-3.32-2.02-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z",
  ),
  minimize: svg("M7 10l5 5 5-5H7z"),
  fullscreen: svg(
    "M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3Zm-3-12v2h3v3h2V5h-5Z",
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
    padding: circle ? "13px" : "11px",
    display: "grid",
    placeItems: "center",
    background: circle ? "rgba(15,15,15,.53)" : "transparent",
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

export function installPlayerExperience(player) {
  const video = player?.video;
  const frame = player?.frame || player?.root;
  if (!video || !frame || typeof document === "undefined") return () => {};

  let destroyed = false;
  let visible = true;
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
  });

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
    opacity: "1",
    transform: "scale(1)",
  });

  const top = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 0 auto 0",
    height: "62px",
    padding: "6px 6px 6px 4px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    background: "linear-gradient(to bottom,rgba(0,0,0,.72),rgba(0,0,0,0))",
    pointerEvents: "auto",
  });
  top.dataset.unpiratorUiControl = "true";

  const backButton = button("Back", ICONS.back, 46);
  const titleView = styles(document.createElement("div"), {
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
  const settingsButton = button("Playback settings", ICONS.settings, 44);
  const minimizeButton = button("Minimize player", ICONS.minimize, 44);
  top.append(backButton, titleView, speedBadge, settingsButton, minimizeButton);

  const center = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    height: "76px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "18px",
    pointerEvents: "auto",
  });
  center.dataset.unpiratorUiControl = "true";
  const previousButton = button("Previous class", ICONS.previous, 56, true);
  const playPause = button("Play", ICONS.play, 70, true);
  const nextButton = button("Next class", ICONS.next, 56, true);
  center.append(previousButton, playPause, nextButton);

  const loading = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "calc(50% + 96px)",
    transform: "translate(-50%,-50%)",
    width: "118px",
    height: "38px",
    borderRadius: "999px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(28,28,28,.65)",
    fontSize: "13px",
    fontWeight: "700",
    pointerEvents: "none",
  });
  loading.textContent = "Loading…";

  const bottom = styles(document.createElement("div"), {
    position: "absolute",
    inset: "auto 0 0 0",
    height: "72px",
    padding: "0 4px 4px 8px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    background: "linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,0))",
    pointerEvents: "auto",
  });
  bottom.dataset.unpiratorUiControl = "true";

  const seekHit = control(
    styles(document.createElement("div"), {
      position: "relative",
      height: "28px",
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
    height: "3px",
    borderRadius: "999px",
    background: "rgba(120,120,120,.57)",
    overflow: "hidden",
  });
  const seekBuffered = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 auto 0 0",
    width: "0%",
    background: "rgba(220,220,220,.82)",
  });
  const seekPlayed = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 auto 0 0",
    width: "0%",
    background: "#ff0000",
  });
  const seekThumb = styles(document.createElement("div"), {
    position: "absolute",
    left: "0%",
    top: "50%",
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    background: "#ff0000",
    transform: "translate(-50%,-50%) scale(.78)",
  });
  seekBase.append(seekBuffered, seekPlayed);
  seekHit.append(seekBase, seekThumb);

  const bottomRow = styles(document.createElement("div"), {
    height: "38px",
    display: "flex",
    alignItems: "center",
  });
  const timeText = styles(document.createElement("div"), {
    flex: "1",
    fontSize: "12px",
    fontWeight: "500",
    textShadow: "0 1px 4px rgba(0,0,0,.8)",
  });
  timeText.textContent = "0:00 / 0:00";
  const fullscreenButton = button("Full screen", ICONS.fullscreen, 50);
  bottomRow.append(timeText, fullscreenButton);
  bottom.append(seekHit, bottomRow);

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
    background: "rgba(28,28,28,.65)",
    fontSize: "13px",
    fontWeight: "700",
    zIndex: "35",
    pointerEvents: "none",
  });

  const settingsPanel = control(
    styles(document.createElement("div"), {
      position: "absolute",
      top: "54px",
      right: "10px",
      zIndex: "36",
      width: "min(300px,calc(100% - 20px))",
      maxHeight: "calc(100% - 66px)",
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

  ui.append(top, center, bottom, loading, fastBadge, settingsPanel, seekFeedback);
  frame.append(ui, errorPanel);

  const pulse = (node, strong = false) => {
    node.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: `scale(${strong ? 0.8 : 0.88})`, opacity: 0.64 },
        { transform: "scale(1)", opacity: node.disabled ? 0.33 : 1 },
      ],
      { duration: 203, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!video.paused && !video.ended && !seeking && settingsPanel.style.display === "none")
      hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  const setVisible = (next) => {
    if (
      visible === next &&
      ((next && ui.style.opacity === "1") || (!next && ui.style.opacity === "0"))
    )
      return;
    visible = next;
    clearTimeout(hideTimer);
    settingsPanel.style.display = "none";
    ui.style.pointerEvents = "none";
    top.style.pointerEvents = next ? "auto" : "none";
    center.style.pointerEvents = next ? "auto" : "none";
    bottom.style.pointerEvents = next ? "auto" : "none";
    const animation = next
      ? [
          { opacity: 0, transform: "scale(.985)" },
          { opacity: 1, transform: "scale(1)" },
        ]
      : [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.008)" },
        ];
    ui.getAnimations().forEach((item) => item.cancel());
    const run = ui.animate(animation, {
      duration: next ? 230 : 190,
      easing: next ? "cubic-bezier(.1,.72,.2,1)" : "ease-out",
      fill: "forwards",
    });
    run.onfinish = () => {
      if (destroyed) return;
      ui.style.opacity = next ? "1" : "0";
      ui.style.transform = next ? "scale(1)" : "scale(1.008)";
    };
    if (next) scheduleHide();
  };

  const updatePlayPause = (animate = true) => {
    const playing = !video.paused && !video.ended;
    if (lastPlayingVisual === playing) return;
    lastPlayingVisual = playing;
    playPause.innerHTML = playing ? ICONS.pause : ICONS.play;
    playPause.setAttribute("aria-label", playing ? "Pause" : "Play");
    const child = playPause.querySelector("svg");
    if (child) styles(child, { width: "100%", height: "100%" });
    if (animate) {
      playPause.animate(
        [
          { transform: `rotate(${playing ? -5 : 5}deg) scale(.78)` },
          { transform: "rotate(0deg) scale(1)" },
        ],
        { duration: 175, easing: "cubic-bezier(.2,1.45,.35,1)" },
      );
    }
    if (playing) scheduleHide();
    else clearTimeout(hideTimer);
  };

  const updateSpeedBadge = () => {
    const rate = Number(video.playbackRate || 1);
    speedBadge.textContent = speedLabel(rate);
    speedBadge.style.display = Math.abs(rate - 1) < 0.001 ? "none" : "inline-flex";
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
    timeText.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  };

  const seekToPointer = (event) => {
    const rect = seekHit.getBoundingClientRect();
    const duration = Number(video.duration);
    if (!rect.width || !Number.isFinite(duration) || duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    video.currentTime = duration * ratio;
    updateProgress();
  };

  const seekBy = (side) => {
    const duration = Number(video.duration);
    const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    video.currentTime = Math.max(0, Math.min(upper, Number(video.currentTime || 0) + side * 10));
    updateProgress();
  };

  const showSeekFeedback = (side, seconds) => {
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
          setVisible(true);
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
    titleView.textContent = title;
    titleView.style.visibility = title ? "visible" : "hidden";
    backButton.style.display = typeof experience.onBack === "function" ? "grid" : "none";
    minimizeButton.style.display = typeof experience.onMinimize === "function" ? "grid" : "none";
    previousButton.style.display = typeof experience.onPrevious === "function" ? "grid" : "none";
    nextButton.style.display = typeof experience.onNext === "function" ? "grid" : "none";
    previousButton.disabled = experience.hasPrevious === false;
    nextButton.disabled = experience.hasNext === false;
    previousButton.style.opacity = previousButton.disabled ? ".33" : "1";
    nextButton.style.opacity = nextButton.disabled ? ".33" : "1";
  };

  player.setExperienceOptions = (next = {}) => {
    experience = { ...experience, ...next };
    applyExperience();
  };
  applyExperience();

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
        experience.onMinimize?.();
      }
      resetDrag();
    };
  };

  const onPointerDown = (event) => {
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
      const fast = Math.min(4, Math.max(2, holdRestoreRate));
      video.playbackRate = fast;
      fastBadge.textContent = `${speedLabel(fast)}  Hold`;
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
      if (commit && (fullscreen || typeof experience.onMinimize === "function"))
        commitDrag(fullscreen);
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
      seekBy(side);
      showSeekFeedback(side, rapidSeconds);
      return;
    }
    if (singleTapTimer && now - pendingTapAt <= DOUBLE_TAP_MS && side === pendingTapSide) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      rapidSide = side;
      rapidSeconds = 10;
      rapidUntil = now + RAPID_SEEK_CHAIN_MS;
      seekBy(side);
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
      setVisible(false);
    } else if (recoveryErrorVisible) {
      recoveryErrorVisible = false;
      setVisible(true);
    }
  };

  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    queueMicrotask(syncCoreRecoveryUi);
  });
  observer.observe(frame, { childList: true });
  syncCoreRecoveryUi();

  backButton.onclick = () => {
    pulse(backButton);
    experience.onBack?.();
  };
  minimizeButton.onclick = () => {
    pulse(minimizeButton);
    commitDrag(Boolean(document.fullscreenElement));
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
  playPause.onclick = () => {
    pulse(playPause, true);
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
    setVisible(true);
  };
  settingsButton.onclick = () => {
    pulse(settingsButton);
    renderSettings();
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
    clearTimeout(hideTimer);
  };
  speedBadge.onclick = () => settingsButton.click();
  fullscreenButton.onclick = async () => {
    pulse(fullscreenButton, true);
    const target = player.host || frame;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen?.();
    } catch {}
    setVisible(true);
  };

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
    setVisible(true);
  };
  const onSeekKey = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    video.currentTime = Math.max(0, video.currentTime + (event.key === "ArrowLeft" ? -5 : 5));
    updateProgress();
    setVisible(true);
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
  const preventContext = (event) => event.preventDefault();
  video.addEventListener("contextmenu", preventContext);

  const onPlaying = () => {
    loading.style.display = "none";
    updatePlayPause();
    updateProgress();
    scheduleHide();
  };
  const onWaiting = () => {
    loading.style.display = "flex";
    setVisible(true);
  };
  const onPause = () => {
    loading.style.display = "none";
    updatePlayPause();
    setVisible(true);
  };
  const onCanPlay = () => {
    loading.style.display = "none";
    updateProgress();
  };
  const onRateChange = () => updateSpeedBadge();

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

  updatePlayPause(false);
  updateSpeedBadge();
  updateProgress();
  scheduleHide();

  return () => {
    destroyed = true;
    clearTimeout(hideTimer);
    clearTimeout(singleTapTimer);
    clearTimeout(rapidSeekTimer);
    clearTimeout(longPressTimer);
    observer.disconnect();
    delete player.setExperienceOptions;
    video.removeEventListener("pointerdown", onPointerDown);
    video.removeEventListener("pointermove", onPointerMove);
    video.removeEventListener("pointerup", finishSurfacePointer);
    video.removeEventListener("pointercancel", onPointerCancel);
    video.removeEventListener("contextmenu", preventContext);
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
    ui.remove();
    errorPanel.remove();
    resetDrag();
  };
}
