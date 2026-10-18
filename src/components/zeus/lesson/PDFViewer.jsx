import React, { useState } from "react";

// PDF viewer via internal proxy to hide external source - no external branding
export default function PDFViewer({ url, title, onComplete }) {
  const [loaded, setLoaded] = useState(false);
  if (!url) return null;
  // Route through backend proxy if it's an external URL
  const src = url.startsWith("/api/") ? url : `/api/media/pdf?url=${encodeURIComponent(url)}`;
  return (
    <div className="rounded-2xl overflow-hidden border border-border/40 bg-white">
      <div className="px-4 py-2 bg-zeus-midnight text-zeus-brightgold text-xs font-medium flex items-center gap-2">
        <span>📄 {title || "مستند الدرس"}</span>
        {!loaded && <span className="text-muted-foreground">جاري التحميل...</span>}
      </div>
      <iframe
        src={src}
        title={title || "PDF"}
        className="w-full h-[600px] bg-white"
        onLoad={() => { setLoaded(true); onComplete && onComplete(); }}
      />
    </div>
  );
}
