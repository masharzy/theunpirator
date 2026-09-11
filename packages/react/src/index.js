"use client";

import { createElement, useEffect, useRef } from "react";
import { mountDirectYoutubePlayer, mountProtectedPlayer } from "@unpirator/player";
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
  youtubeDirect = false,
  onBack,
  onMinimize,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onReady,
  onError,
}) {
  const root = useRef(null);
  const currentUserKey = currentUser ? JSON.stringify(currentUser) : "";

  useEffect(() => {
    let disposed = false;
    let player;
    if (youtubeDirect) {
      try {
        player = mountDirectYoutubePlayer({ element: root.current, src, title });
        onReady?.(player);
      } catch (error) {
        onError?.(error);
      }
      return () => player?.destroy();
    }
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
        mounted.setExperienceOptions?.({
          title,
          onBack,
          onMinimize,
          onPrevious,
          onNext,
          hasPrevious,
          hasNext,
        });
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
    youtubeDirect,
    onBack,
    onMinimize,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
  ]);

  return createElement("div", {
    ref: root,
    className,
    style: { width: "100%", aspectRatio: "16 / 9", ...style },
  });
}
