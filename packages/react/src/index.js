"use client";

import { createElement, useEffect, useRef } from "react";
import { mountProtectedPlayer } from "@unpirator/player";
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

export function UnpiratorPlayer({
  src,
  assetId,
  endpoint = "/api/unpirator/playback",
  title,
  currentUser,
  className,
  style,
  poster,
  autoPlay = false,
  headers,
  getHeaders,
  getAccessToken,
  onReady,
  onError,
}) {
  const root = useRef(null);
  const currentUserKey = currentUser ? JSON.stringify(currentUser) : "";

  useEffect(() => {
    let disposed = false;
    let player;
    mountProtectedPlayer({
      element: root.current,
      bootstrap: createPlaybackBootstrap({
        endpoint,
        src,
        assetId,
        title,
        currentUser,
        headers,
        getHeaders,
        getAccessToken,
      }),
      onError,
    })
      .then((mounted) => {
        if (disposed) return mounted.destroy();
        player = mounted;
        if (poster) player.video.poster = poster;
        if (autoPlay) player.video.play().catch(() => {});
        onReady?.(player);
      })
      .catch((error) => onError?.(error));
    return () => {
      disposed = true;
      player?.destroy();
    };
  }, [
    src,
    assetId,
    endpoint,
    title,
    currentUserKey,
    poster,
    autoPlay,
    headers,
    getHeaders,
    getAccessToken,
  ]);

  return createElement("div", {
    ref: root,
    className,
    style: { width: "100%", aspectRatio: "16 / 9", ...style },
  });
}
