import React, { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, Circle, Clock } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Journey() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [roadmap, setRoadmap] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1);
      if (r.length) setRoadmap(r[0]);
      const tk = await api.entities.Task.filter({}, "order", 200);
      setTasks(tk);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  const nodes = roadmap?.nodes || [];
  const phases = [...new Set(nodes.map((n) => n.phase))].sort((a, b) => a - b);

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Sparkles className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {t("journey.title")}</h1>
        <p className="text-muted-foreground mt-1">{isAr ? "رحلتك الكاملة من البداية للمسار المهني" : "Your full journey from start to career"}</p>
      </div>

      <div className="zeus-glass p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="text-zeus-gold text-sm font-semibold">{isAr ? "الهدف" : "Goal"}</div>
        </div>
        <div className="font-heading font-bold text-2xl zeus-gold-text">{profile?.goal || "—"}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-secondary/50">{profile?.current_level || "—"}</span>
          <span className="px-2.5 py-1 rounded-full bg-secondary/50">{profile?.weekly_hours || 0} {isAr ? "ساعة/أسبوع" : "hrs/week"}</span>
          <span className="px-2.5 py-1 rounded-full bg-secondary/50">{profile?.learning_style || "—"}</span>
        </div>
      </div>

      <div className="relative">
        <div className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-zeus-gold/60 via-zeus-gold/20 to-transparent" style={{ insetInlineStart: 19 }} />
        <div className="space-y-4">
          {phases.map((p, i) => {
            const pn = nodes.filter((n) => n.phase === p);
            const phaseTasks = tasks.filter((tk) => pn.some((n) => n.id === tk.node_id));
            const done = phaseTasks.filter((tk) => tk.status === "done").length;
            const total = phaseTasks.length;
            const complete = total > 0 && done === total;
            const inProgress = done > 0 && !complete;
            return (
              <div key={p} className="relative flex gap-4 animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className={`relative z-10 w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 ${complete ? "bg-zeus-gold border-zeus-gold" : inProgress ? "bg-zeus-gold/20 border-zeus-gold" : "bg-card border-border"}`}>
                  {complete ? <CheckCircle2 className="text-white" style={{ width: 20, height: 20 }} /> : <Circle className={inProgress ? "text-zeus-gold" : "text-muted-foreground/40"} style={{ width: 20, height: 20 }} />}
                </div>
                <div className="flex-1 zeus-glass p-4 mb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold">{isAr ? `المرحلة ${p}` : `Phase ${p}`}</h3>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock style={{ width: 11, height: 11 }} /> {pn.reduce((a, n) => a + (n.estimated_hours || 0), 0)} {isAr ? "س" : "h"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pn.map((n) => <span key={n.id} className="px-2 py-0.5 rounded-full bg-secondary/40 text-xs">{n.title}</span>)}
                  </div>
                  {total > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>{isAr ? "التقدّم" : "Progress"}</span><span>{done}/{total}</span></div>
                      <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden"><div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}