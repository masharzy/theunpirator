const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
const HIDE_DELAY_MS = 2800;
const DOUBLE_TAP_MS = 300;
const RAPID_SEEK_CHAIN_MS = 700;
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 12;

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const SETTINGS_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.87 3h-3.84l-.36 3.18c-.58.24-1.12.55-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58c-.05.31-.08.64-.08.94s.03.63.08.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.04.7 1.62.94l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.55 1.62-.94l2.39.96 1.92-3.32-2.02-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>';
const FULLSCREEN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3Zm-3-12v2h3v3h2V5h-5Z"/></svg>';

function styles(node, values) {
  Object.assign(node.style, values);
  return node;
}

function control(node) {
  node.dataset.unpiratorUiControl = "true";
  return node;
}

function button(label, icon, size = 44) {
  const item = control(document.createElement("button"));
  item.type = "button";
  item.setAttribute("aria-label", label);
  item.innerHTML = icon;
  styles(item, {
    width: `${size}px`,
    height: `${size}px`,
    border: "0",
    borderRadius: "999px",
    padding: "0",
    display: "grid",
    placeItems: "center",
    background: "rgba(15,15,15,.58)",
    color: "#fff",
    cursor: "pointer",
    outline: "none",
    transition: "transform 145ms cubic-bezier(.2,.8,.2,1), background 140ms ease",
    WebkitTapHighlightColor: "transparent",
  });
  const svg = item.querySelector("svg");
  if (svg)
    styles(svg, { width: `${Math.round(size * 0.48)}px`, height: `${Math.round(size * 0.48)}px` });
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
  return Number.isInteger(value) ? `${value}×` : `${value}×`;
}

export function installPlayerExperience(player) {
  const video = player?.video;
  const frame = player?.frame || player?.root;
  if (!video || !frame || typeof document === "undefined") return () => {};

  let destroyed = false;
  let visible = true;
  let hideTimer;
  let singleTapTimer;
  let rapidSeekTimer;
  let longPressTimer;
  let pointerStart;
  let holdActive = false;
  let holdRestoreRate = 1;
  let pendingTapAt = 0;
  let pendingTapSide = 0;
  let rapidSide = 0;
  let rapidSeconds = 0;
  let rapidUntil = 0;
  let seeking = false;

  video.controls = false;
  video.playsInline = true;
  video.setAttribute("controlsList", "nodownload");
  styles(video, {
    width: "100%",
    height: "100%",
    display: "block",
    background: "#000",
    objectFit: "contain",
    cursor: "default",
    WebkitTapHighlightColor: "transparent",
  });

  styles(frame, {
    background: "#000",
    overflow: "hidden",
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
    transition: "opacity 190ms ease, transform 190ms ease",
  });

  const top = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 0 auto 0",
    minHeight: "64px",
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    background: "linear-gradient(to bottom,rgba(0,0,0,.78),rgba(0,0,0,0))",
    pointerEvents: "auto",
  });
  top.dataset.unpiratorUiControl = "true";

  const speedBadge = control(document.createElement("button"));
  speedBadge.type = "button";
  speedBadge.textContent = "1×";
  styles(speedBadge, {
    display: "none",
    minWidth: "46px",
    height: "30px",
    padding: "0 10px",
    border: "0",
    borderRadius: "999px",
    background: "rgba(28,28,28,.78)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  });

  const settingsButton = button("Playback settings", SETTINGS_ICON, 42);
  top.append(speedBadge, settingsButton);

  const center = styles(document.createElement("div"), {
    position: "absolute",
    inset: "50% auto auto 50%",
    transform: "translate(-50%,-50%)",
    pointerEvents: "auto",
  });
  center.dataset.unpiratorUiControl = "true";

  const playPause = button("Play", PLAY_ICON, 70);
  styles(playPause, {
    background: "rgba(15,15,15,.62)",
    boxShadow: "0 4px 18px rgba(0,0,0,.28)",
  });
  center.appendChild(playPause);

  const bottom = styles(document.createElement("div"), {
    position: "absolute",
    inset: "auto 0 0 0",
    minHeight: "76px",
    padding: "4px 10px 6px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    gap: "2px",
    background: "linear-gradient(to top,rgba(0,0,0,.82),rgba(0,0,0,0))",
    pointerEvents: "auto",
  });
  bottom.dataset.unpiratorUiControl = "true";

  const seekHit = control(
    styles(document.createElement("div"), {
      position: "relative",
      height: "24px",
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
    background: "rgba(130,130,130,.58)",
    overflow: "hidden",
  });
  const seekBuffered = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0 auto 0 0",
    width: "0%",
    background: "rgba(225,225,225,.76)",
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
    boxShadow: "0 0 0 2px rgba(0,0,0,.16)",
    transition: "transform 120ms ease",
  });
  seekBase.append(seekBuffered, seekPlayed);
  seekHit.append(seekBase, seekThumb);

  const bottomRow = styles(document.createElement("div"), {
    minHeight: "38px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });
  const timeText = document.createElement("div");
  timeText.textContent = "0:00 / 0:00";
  styles(timeText, {
    flex: "1",
    fontSize: "12px",
    fontWeight: "500",
    textShadow: "0 1px 4px rgba(0,0,0,.8)",
  });
  const fullscreenButton = button("Full screen", FULLSCREEN_ICON, 42);
  styles(fullscreenButton, { background: "transparent" });
  bottomRow.append(timeText, fullscreenButton);
  bottom.append(seekHit, bottomRow);

  const settingsPanel = control(
    styles(document.createElement("div"), {
      position: "absolute",
      top: "54px",
      right: "10px",
      zIndex: "34",
      width: "min(310px,calc(100% - 20px))",
      maxHeight: "calc(100% - 70px)",
      overflowY: "auto",
      display: "none",
      padding: "12px",
      borderRadius: "14px",
      background: "rgba(20,20,20,.96)",
      border: "1px solid rgba(255,255,255,.12)",
      boxShadow: "0 14px 40px rgba(0,0,0,.38)",
      backdropFilter: "blur(12px)",
      pointerEvents: "auto",
    }),
  );

  const fastBadge = styles(document.createElement("div"), {
    position: "absolute",
    top: "22px",
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: "110px",
    height: "40px",
    padding: "0 14px",
    borderRadius: "999px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(28,28,28,.82)",
    fontSize: "13px",
    fontWeight: "800",
    letterSpacing: ".01em",
    boxShadow: "0 6px 20px rgba(0,0,0,.28)",
    zIndex: "35",
    pointerEvents: "none",
  });

  const loading = styles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "calc(50% + 58px)",
    transform: "translate(-50%,-50%)",
    minWidth: "92px",
    height: "34px",
    padding: "0 12px",
    borderRadius: "999px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(20,20,20,.72)",
    fontSize: "12px",
    fontWeight: "700",
    pointerEvents: "none",
  });
  loading.textContent = "Loading…";

  const seekFeedback = styles(document.createElement("div"), {
    position: "absolute",
    inset: "0",
    zIndex: "33",
    display: "none",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 130ms ease, transform 130ms ease",
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
    fontWeight: "800",
    textShadow: "0 2px 5px rgba(0,0,0,.7)",
  });
  const seekArrows = styles(document.createElement("div"), {
    fontSize: "30px",
    letterSpacing: "2px",
    lineHeight: "1",
  });
  const seekLabel = styles(document.createElement("div"), {
    fontSize: "13.5px",
  });
  seekBubble.append(seekArrows, seekLabel);
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
    border: "1px solid rgba(255,255,255,.14)",
    boxShadow: "0 18px 50px rgba(0,0,0,.44)",
    backdropFilter: "blur(14px)",
    color: "#fff",
    textAlign: "center",
    pointerEvents: "auto",
  });
  errorPanel.dataset.unpiratorUiControl = "true";

  ui.append(top, center, bottom, settingsPanel, fastBadge, loading, seekFeedback);
  frame.append(ui, errorPanel);

  const pulse = (node) => {
    node.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(.80)", opacity: 0.68 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  };

  const setVisible = (next) => {
    visible = next;
    clearTimeout(hideTimer);
    settingsPanel.style.display = "none";
    ui.style.opacity = next ? "1" : "0";
    ui.style.transform = next ? "scale(1)" : "scale(1.008)";
    top.style.pointerEvents = next ? "auto" : "none";
    center.style.pointerEvents = next ? "auto" : "none";
    bottom.style.pointerEvents = next ? "auto" : "none";
    if (next) scheduleHide();
  };

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    if (!video.paused && !video.ended && !seeking && settingsPanel.style.display === "none") {
      hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }
  };

  const updatePlayPause = () => {
    const playing = !video.paused && !video.ended;
    playPause.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    playPause.setAttribute("aria-label", playing ? "Pause" : "Play");
    const svg = playPause.querySelector("svg");
    if (svg) styles(svg, { width: "34px", height: "34px" });
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

  const progressRatio = () => {
    const duration = Number(video.duration);
    return Number.isFinite(duration) && duration > 0
      ? Math.min(1, Math.max(0, video.currentTime / duration))
      : 0;
  };

  const bufferedRatio = () => {
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0 || !video.buffered?.length) return 0;
    try {
      for (let i = 0; i < video.buffered.length; i += 1) {
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i) >= video.currentTime
        ) {
          return Math.min(1, video.buffered.end(i) / duration);
        }
      }
      return Math.min(1, video.buffered.end(video.buffered.length - 1) / duration);
    } catch {
      return 0;
    }
  };

  const updateProgress = () => {
    const played = progressRatio() * 100;
    const buffered = bufferedRatio() * 100;
    seekPlayed.style.width = `${played}%`;
    seekBuffered.style.width = `${buffered}%`;
    seekThumb.style.left = `${played}%`;
    seekHit.setAttribute("aria-valuemin", "0");
    seekHit.setAttribute(
      "aria-valuemax",
      String(Math.max(0, Math.floor(Number(video.duration) || 0))),
    );
    seekHit.setAttribute(
      "aria-valuenow",
      String(Math.max(0, Math.floor(Number(video.currentTime) || 0))),
    );
    timeText.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  };

  const seekToPointer = (event) => {
    const rect = seekHit.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const duration = Number(video.duration);
    if (Number.isFinite(duration) && duration > 0) video.currentTime = duration * ratio;
    updateProgress();
  };

  const showSeekFeedback = (side, seconds) => {
    clearTimeout(rapidSeekTimer);
    seekFeedback.style.display = "block";
    seekFeedback.style.opacity = "1";
    seekFeedback.style.transform = "scale(1)";
    if (side < 0) {
      seekBubble.style.left = "-18%";
      seekBubble.style.right = "auto";
      seekBubble.style.borderRadius = "0 999px 999px 0";
      seekArrows.textContent = "‹‹‹";
    } else {
      seekBubble.style.right = "-18%";
      seekBubble.style.left = "auto";
      seekBubble.style.borderRadius = "999px 0 0 999px";
      seekArrows.textContent = "›››";
    }
    seekLabel.textContent = `${seconds} seconds`;
    rapidSeekTimer = setTimeout(() => {
      seekFeedback.style.opacity = "0";
      seekFeedback.style.transform = "scale(1.025)";
      setTimeout(() => {
        if (!destroyed && seekFeedback.style.opacity === "0") seekFeedback.style.display = "none";
      }, 220);
    }, 620);
  };

  const seekBy = (side) => {
    const duration = Number(video.duration);
    const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    video.currentTime = Math.max(0, Math.min(upper, Number(video.currentTime || 0) + side * 10));
    updateProgress();
  };

  const renderSettings = () => {
    settingsPanel.replaceChildren();

    const heading = (value) => {
      const node = document.createElement("div");
      node.textContent = value;
      styles(node, {
        margin: "2px 2px 8px",
        fontSize: "12px",
        fontWeight: "800",
        color: "rgba(255,255,255,.72)",
        textTransform: "uppercase",
        letterSpacing: ".08em",
      });
      return node;
    };

    const choice = (label, active, onClick) => {
      const item = control(document.createElement("button"));
      item.type = "button";
      item.textContent = `${active ? "✓ " : ""}${label}`;
      styles(item, {
        minHeight: "38px",
        border: "0",
        borderRadius: "10px",
        padding: "8px 10px",
        background: active ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: active ? "800" : "600",
        cursor: "pointer",
        textAlign: "left",
      });
      item.onclick = onClick;
      return item;
    };

    settingsPanel.appendChild(heading("Playback speed"));
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
          updateSpeedBadge();
          settingsPanel.style.display = "none";
          setVisible(true);
        }),
      );
    });
    settingsPanel.appendChild(speedGrid);

    const variants = player.protected?.manifest?.video || [];
    if (variants.length) {
      settingsPanel.appendChild(heading("Quality"));
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
              const item = event.currentTarget;
              item.disabled = true;
              try {
                await player.protected?.setQuality(index);
                renderSettings();
              } catch (error) {
                player.handlePlaybackError?.(error);
              } finally {
                item.disabled = false;
              }
            },
          ),
        );
      });
      settingsPanel.appendChild(qualityGrid);
    }
  };

  let recoveryErrorVisible = false;

  const syncCoreRecoveryUi = () => {
    if (destroyed) return;
    const coreControls = player.controls;
    const retry = player.retryButton;
    const error = player.errorMessage;

    if (retry) {
      for (const old of errorPanel.querySelectorAll('[data-unpirator-retry="true"]')) {
        if (old !== retry) old.remove();
      }
      retry.dataset.unpiratorRetry = "true";
      retry.textContent = "Refresh video";
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
        boxShadow: "0 8px 24px rgba(0,0,0,.32)",
      });
      if (retry.parentNode !== errorPanel) errorPanel.appendChild(retry);
    }

    if (error) {
      for (const old of errorPanel.querySelectorAll('[data-unpirator-error-message="true"]')) {
        if (old !== error) old.remove();
      }
      error.dataset.unpiratorErrorMessage = "true";
      styles(error, {
        position: "static",
        inset: "auto",
        width: "auto",
        padding: "0",
        borderRadius: "0",
        background: "transparent",
        color: "#fff",
        textAlign: "center",
        font: "600 14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        lineHeight: "1.5",
        zIndex: "auto",
      });
      if (error.parentNode !== errorPanel) errorPanel.prepend(error);
    }

    if (coreControls && coreControls !== ui && coreControls.parentNode) {
      coreControls.style.display = "none";
    }

    const hasError = Boolean(player.errorMessage?.isConnected);
    errorPanel.style.display = hasError ? "flex" : "none";
    if (hasError) {
      recoveryErrorVisible = true;
      setVisible(false);
      errorPanel.style.opacity = "1";
    } else if (recoveryErrorVisible) {
      recoveryErrorVisible = false;
      setVisible(true);
    }
  };

  const observer = new MutationObserver(() => queueMicrotask(syncCoreRecoveryUi));
  observer.observe(frame, { childList: true, subtree: true });
  syncCoreRecoveryUi();

  playPause.onclick = () => {
    pulse(playPause);
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
    pulse(fullscreenButton);
    const target = player.host || frame;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen?.();
    } catch {}
    setVisible(true);
  };

  seekHit.addEventListener("pointerdown", (event) => {
    seeking = true;
    clearTimeout(hideTimer);
    seekHit.setPointerCapture?.(event.pointerId);
    seekThumb.style.transform = "translate(-50%,-50%) scale(1)";
    seekToPointer(event);
  });
  seekHit.addEventListener("pointermove", (event) => {
    if (seeking) seekToPointer(event);
  });
  const finishSeek = (event) => {
    if (!seeking) return;
    seeking = false;
    seekHit.releasePointerCapture?.(event.pointerId);
    seekThumb.style.transform = "translate(-50%,-50%) scale(.78)";
    updateProgress();
    setVisible(true);
  };
  seekHit.addEventListener("pointerup", finishSeek);
  seekHit.addEventListener("pointercancel", finishSeek);
  seekHit.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      video.currentTime = Math.max(0, video.currentTime + (event.key === "ArrowLeft" ? -5 : 5));
      updateProgress();
      setVisible(true);
    }
  });

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

  video.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    video.setPointerCapture?.(event.pointerId);
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!pointerStart || destroyed) return;
      holdActive = true;
      holdRestoreRate = Number(video.playbackRate || 1);
      video.playbackRate = 2;
      fastBadge.textContent = "2×  Hold";
      fastBadge.style.display = "flex";
      clearTimeout(hideTimer);
    }, LONG_PRESS_MS);
  });

  video.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (distance > MOVE_TOLERANCE_PX) {
      clearTimeout(longPressTimer);
      if (holdActive) finishHold();
      pointerStart = null;
    }
  });

  const finishSurfacePointer = (event) => {
    if (!pointerStart) {
      finishHold();
      return;
    }
    clearTimeout(longPressTimer);
    video.releasePointerCapture?.(event.pointerId);
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const wasHold = finishHold();
    pointerStart = null;
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

  video.addEventListener("pointerup", finishSurfacePointer);
  video.addEventListener("pointercancel", () => {
    clearTimeout(longPressTimer);
    pointerStart = null;
    finishHold();
  });
  video.addEventListener("contextmenu", (event) => event.preventDefault());

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

  video.addEventListener("play", updatePlayPause);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("pause", onPause);
  video.addEventListener("ended", onPause);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("stalled", onWaiting);
  video.addEventListener("canplay", () => {
    loading.style.display = "none";
    updateProgress();
  });
  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("durationchange", updateProgress);
  video.addEventListener("progress", updateProgress);
  video.addEventListener("ratechange", updateSpeedBadge);

  updatePlayPause();
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
    ui.remove();
    errorPanel.remove();
  };
}
