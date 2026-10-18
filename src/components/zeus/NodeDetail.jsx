import React from "react";
import { Loader2, Wrench, ListChecks, Globe, RefreshCw, AlertCircle, BadgeCheck } from "lucide-react";
import ResourceCard from "@/components/zeus/ResourceCard";
import VideoPlayer from "@/components/zeus/lesson/VideoPlayer";

export default function NodeDetail({ node, isAr, loading, failed, onRefresh }) {
  const resources = (node.resources || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const videos = resources.filter((r) => r.type === "video");
  const docs = resources.filter((r) => r.type !== "video");
  // Unified video: the verified rank-1 video is THE lesson video — same one
  // played in Schedule/Home/Lesson. Alternatives stay listed below it.
  const featured = videos.find((r) => r.verified) || videos[0] || null;
  const alternatives = videos.filter((r) => r !== featured);

  return (
    <div className="space-y-5">
      {node.skills?.length > 0 && (
        <div>
          <SectionLabel icon={Wrench} text={isAr ? "المهارات" : "Skills"} />
          <div className="flex flex-wrap gap-1.5">
            {node.skills.map((s) => <span key={s} className="px-2.5 py-1 rounded-full bg-zeus-gold/10 text-zeus-brightgold text-xs">{s}</span>)}
          </div>
        </div>
      )}

      {node.tasks?.length > 0 && (
        <div>
          <SectionLabel icon={ListChecks} text={isAr ? "المهام" : "Tasks"} />
          <ul className="space-y-1.5">
            {node.tasks.map((tk, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-zeus-gold shrink-0">{i + 1}.</span>{tk}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel icon={Globe} text={isAr ? "المصادر بالترتيب" : "Resources, in order"} noMargin />
          {resources.length > 0 && !loading && (
            <button onClick={onRefresh} className="text-[11px] text-muted-foreground hover:text-zeus-brightgold flex items-center gap-1 transition">
              <RefreshCw style={{ width: 11, height: 11 }} /> {isAr ? "جدّد" : "Refresh"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-2.5 py-8 rounded-xl bg-secondary/20 border border-dashed border-border/60">
            <Loader2 className="text-zeus-gold animate-spin" style={{ width: 22, height: 22 }} />
            <p className="text-xs text-muted-foreground text-center px-4">
              {isAr ? `بدوّر على أحسن مصادر لـ"${node.title}" على الويب...` : `Searching the web for the best resources on "${node.title}"...`}
            </p>
          </div>
        ) : resources.length > 0 ? (
          <div className="space-y-3">
            {featured && (
              <div className="rounded-2xl overflow-hidden border border-zeus-gold/40">
                <div className="px-4 pt-3 flex items-center gap-1.5 text-xs font-bold text-zeus-brightgold">
                  <BadgeCheck style={{ width: 14, height: 14 }} />
                  {isAr ? "الفيديو المختار لك — يُشغَّل داخل المنصة" : "Your picked video — plays in-platform"}
                </div>
                <div className="p-3">
                  <VideoPlayer url={featured.url} iframeUrl={featured.iframe_url} title={featured.title} duration={featured.duration_sec} />
                  <p className="text-xs font-medium mt-2 px-1">{featured.title}</p>
                </div>
              </div>
            )}
            {alternatives.map((r, i) => <ResourceCard key={`${r.url}-${i}`} resource={r} isAr={isAr} />)}
            {docs.map((r, i) => <ResourceCard key={`${r.url}-d${i}`} resource={r} isAr={isAr} />)}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-secondary/20 border border-dashed border-border/60 text-center">
            <AlertCircle className="text-muted-foreground mx-auto mb-2" style={{ width: 18, height: 18 }} />
            <p className="text-xs text-muted-foreground mb-3">
              {failed
                ? (isAr ? "ملقيتش مصادر موثوقة للمحطة دي. جرّب تاني." : "Couldn't verify resources for this node. Try again.")
                : (isAr ? "مفيش مصادر لسه." : "No resources yet.")}
            </p>
            <button onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zeus-gold/15 text-zeus-brightgold text-xs font-semibold hover:bg-zeus-gold/25 transition">
              <RefreshCw style={{ width: 12, height: 12 }} /> {isAr ? "ادوّر على مصادر" : "Find resources"}
            </button>
          </div>
        )}
      </div>

      {node.projects?.length > 0 && (
        <div>
          <SectionLabel icon={Wrench} text={isAr ? "أفكار مشاريع" : "Project Ideas"} />
          <ul className="space-y-1.5">
            {node.projects.map((p, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-zeus-gold shrink-0">•</span>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, text, noMargin }) {
  return (
    <div className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 ${noMargin ? "" : "mb-2"}`}>
      <Icon className="text-zeus-gold" style={{ width: 13, height: 13 }} /> {text}
    </div>
  );
}