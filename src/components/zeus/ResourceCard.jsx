import React from "react";
import { Youtube, FileText, GraduationCap, BookOpen, Wrench, PenTool, ExternalLink } from "lucide-react";

const TYPE_ICON = {
  video: Youtube,
  docs: FileText,
  course: GraduationCap,
  article: BookOpen,
  tool: Wrench,
  interactive: PenTool
};

function getYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function tierLabel(t, isAr) {
  if (t === "best_match") return isAr ? "ابدأ من هنا" : "Start here";
  if (t === "alternative") return isAr ? "بديل" : "Alternative";
  if (t === "deep_dive") return isAr ? "تعمّق" : "Deep dive";
  return isAr ? "مصدر" : "Resource";
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function fmtSec(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function ResourceCard({ resource, isAr }) {
  if (!resource) return null;
  const yt = getYouTubeId(resource.url);
  const Icon = TYPE_ICON[resource.type] || BookOpen;
  const isTop = resource.rank === 1;

  return (
    <div className={`rounded-xl overflow-hidden border transition ${isTop ? "bg-zeus-gold/5 border-zeus-gold/40" : "bg-secondary/25 border-border/60 hover:border-zeus-gold/30"}`}>
      {yt && (
        <div className="aspect-video bg-black/40">
          <iframe
            src={`https://www.youtube.com/embed/${yt}`}
            title={resource.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="w-full h-full"
          />
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-heading font-extrabold text-sm ${isTop ? "bg-zeus-gold text-zeus-midnight" : "bg-zeus-gold/15 text-zeus-brightgold"}`}>
            {resource.rank || <Icon style={{ width: 15, height: 15 }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-snug line-clamp-2">{resource.title}</div>
            {resource.why && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{resource.why}</p>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isTop ? "bg-zeus-gold text-zeus-midnight" : "bg-zeus-gold/15 text-zeus-brightgold"}`}>{tierLabel(resource.tier, isAr)}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Icon style={{ width: 10, height: 10 }} /> {hostOf(resource.url) || resource.type}
              </span>
              {(resource.duration_display || resource.duration_sec > 0) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground font-medium">
                  ⏱ {resource.duration_display || fmtSec(resource.duration_sec)}
                </span>
              )}
            </div>
          </div>
        </div>
        <a href={resource.url} target="_blank" rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-zeus-gold/10 hover:bg-zeus-gold/20 text-zeus-brightgold text-xs font-semibold transition">
          <ExternalLink style={{ width: 13, height: 13 }} />
          {isAr ? "فتح المصدر" : "Open resource"}
        </a>
      </div>
    </div>
  );
}