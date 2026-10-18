import React, { useState } from "react";

export default function VideoPlayer({ url, iframeUrl, title, duration, onComplete }) {
  const [started, setStarted] = useState(false);
  // Prefer the canonical video URL over a possibly stale stored iframe.
  const videoId = extractYouTubeId(url) || extractYouTubeId(iframeUrl);
  if (!videoId && !iframeUrl) return null;
  const src = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0` : iframeUrl;
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-border/40">
      <iframe
        src={src}
        title={title || "Lesson video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
        onLoad={() => { if (!started) { setStarted(true); onComplete && setTimeout(() => onComplete(), 2000); } }}
      />
      {!!duration && duration > 0 && (
        <span className="absolute bottom-2 end-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium">⏱ {fmtDuration(duration)}</span>
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
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1].slice(0, 11);
  }
  return null;
}