import React, { useEffect, useRef, useState } from "react";

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialize"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load YouTube player API"));
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

export default function VideoPlayer({ url, iframeUrl, title, duration, onProgress, onTrackingError }) {
  const playerTargetRef = useRef(null);
  const playerRef = useRef(null);
  const lastReportedRef = useRef(0);
  const [trackingFallback, setTrackingFallback] = useState(false);
  const videoId = extractYouTubeId(url) || extractYouTubeId(iframeUrl);

  useEffect(() => {
    if (!videoId && iframeUrl) {
      onTrackingError?.(new Error("This embedded player does not expose watch-time events"));
    }
  }, [videoId, iframeUrl, onTrackingError]);

  useEffect(() => {
    if (!videoId || trackingFallback || !playerTargetRef.current) return undefined;
    let disposed = false;
    let reportTimer;
    let lastPlaybackPosition = 0;
    let lastSampleAt = 0;

    const reportProgress = () => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      const position = Math.floor(player.getCurrentTime() || 0);
      const now = Date.now();
      const elapsed = lastSampleAt ? Math.floor((now - lastSampleAt) / 1000) : 0;
      const mediaAdvance = position - lastPlaybackPosition;
      const watchedSeconds = elapsed > 0 && elapsed <= 30 && mediaAdvance > 0 && mediaAdvance <= elapsed * 2 + 3
        ? Math.min(30, mediaAdvance)
        : 0;
      lastPlaybackPosition = position;
      lastSampleAt = now;
      if (position > lastReportedRef.current || watchedSeconds > 0) {
        lastReportedRef.current = Math.max(lastReportedRef.current, position);
        onProgress?.({ videoId, positionSec: position, watchedSeconds });
      }
    };

    loadYouTubeApi().then((youtube) => {
      if (disposed || !playerTargetRef.current) return;
      lastReportedRef.current = 0;
      playerRef.current = new youtube.Player(playerTargetRef.current, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: {
          enablejsapi: 1,
          origin: window.location.origin,
          rel: 0,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === youtube.PlayerState.PLAYING && !reportTimer) {
              lastPlaybackPosition = Math.floor(playerRef.current?.getCurrentTime?.() || 0);
              lastSampleAt = Date.now();
              reportTimer = window.setInterval(reportProgress, 15000);
            } else if (event.data !== youtube.PlayerState.PLAYING) {
              if (reportTimer) window.clearInterval(reportTimer);
              reportTimer = undefined;
              reportProgress();
              lastSampleAt = 0;
            }
          },
        },
      });
    }).catch((error) => {
      if (disposed) return;
      setTrackingFallback(true);
      onTrackingError?.(error);
    });

    return () => {
      disposed = true;
      if (reportTimer) window.clearInterval(reportTimer);
      reportProgress();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId, trackingFallback, onProgress, onTrackingError]);

  if (!videoId && !iframeUrl) return null;
  const fallbackSrc = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
    : iframeUrl;
  const formattedDuration = duration ? fmtDuration(duration) : "";

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-border/40">
      {videoId && !trackingFallback ? (
        <div ref={playerTargetRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <iframe
          src={fallbackSrc}
          title={title || "Lesson video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      )}
      {!!formattedDuration && (
        <span className="absolute bottom-2 end-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium">
          ⏱ {formattedDuration}
        </span>
      )}
    </div>
  );
}

function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?&\s]+)/,
    /(?:youtube(?:-nocookie)?\.com\/embed\/)([^?&\s]+)/,
    /(?:youtube\.com\/shorts\/)([^?&\s]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].slice(0, 11);
  }
  return null;
}
