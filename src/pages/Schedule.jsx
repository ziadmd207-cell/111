import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Loader2, Lock, CheckCircle2, Play, Sparkles, Plus, FolderKanban, Rocket } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { thumbUrl, fmtDur } from "@/lib/youtube";

const DAYS = {
  monday: { ar: "الاثنين", en: "Monday" },
  tuesday: { ar: "الثلاثاء", en: "Tuesday" },
  wednesday: { ar: "الأربعاء", en: "Wednesday" },
  thursday: { ar: "الخميس", en: "Thursday" },
  friday: { ar: "الجمعة", en: "Friday" },
  saturday: { ar: "السبت", en: "Saturday" },
  sunday: { ar: "الأحد", en: "Sunday" }
};

export default function Schedule() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const nav = useNavigate();
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [roadmapId, setRoadmapId] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const r = await api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1);
      if (!r.length) return;
      setRoadmapId(r[0].id);
      const l = await api.entities.Lesson.filter({ roadmap_id: r[0].id }, "order", 500);
      setLessons(l);
    } catch {
      // Error state below (retry button) instead of an endless spinner.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const p = await api.entities.LearningProfile.filter({}, "-created_date", 1);
      const res = await api.functions.invoke("generateSchedule", {
        roadmapId, availableDays: p[0]?.available_days || [], lang
      });
      setLessons(res.data?.lessons || res.lessons || []);
    } catch (e) {}
    setGenerating(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  if (loadError) return (
    <div dir={dir} className="zeus-glass p-10 text-center">
      <p className="text-muted-foreground mb-4 text-sm">{isAr ? "تعذّر تحميل الجدول — حاول تاني" : "Couldn't load the schedule — retry"}</p>
      <button onClick={load} className="px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold">{isAr ? "إعادة المحاولة" : "Retry"}</button>
    </div>
  );

  const completed = lessons.filter(l => l.status === "completed").length;
  const total = lessons.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const phases = [...new Set(lessons.map(l => l.phase))].sort((a, b) => a - b);

  return (
    <div dir={dir} className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2">
          <Calendar className="text-zeus-gold" style={{ width: 26, height: 26 }} /> {isAr ? "جدولك الدراسي" : "Your Study Schedule"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{isAr ? "الدروس موزّعة على مراحل وأيامك المتاحة" : "Lessons organized by stages and your available days"}</p>
      </motion.div>

      {!roadmapId ? (
        <div className="zeus-glass p-10 text-center">
          <p className="text-muted-foreground text-sm">{isAr ? "مفيش خطة تعلم لسه. ابدأ من الـ Onboarding." : "No learning plan yet. Start from onboarding."}</p>
        </div>
      ) : !lessons.length ? (
        <div className="zeus-glass p-10 text-center">
          <Sparkles className="text-zeus-gold mx-auto mb-3" style={{ width: 32, height: 32 }} />
          <p className="text-muted-foreground mb-4 text-sm">{isAr ? "مفيش جدول لسه. خلّيني أوزّع دروسك على أيامك." : "No schedule yet. Let me distribute your lessons across your days."}</p>
          <button onClick={generate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50 text-sm">
            {generating ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : <Plus style={{ width: 18, height: 18 }} />}
            {isAr ? "ابني الجدول" : "Build Schedule"}
          </button>
        </div>
      ) : (
        <>
          <div className="zeus-glass p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{isAr ? "تقدّمك الكلي" : "Overall progress"}</span>
              <span className="text-sm font-bold text-zeus-brightgold">{completed}/{total}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.6 }} className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" />
            </div>
          </div>

          {phases.map((phase, pi) => {
            const phaseLessons = lessons.filter(l => l.phase === phase);
            const phaseCompleted = phaseLessons.filter(l => l.status === "completed").length;
            const phaseProgress = phaseLessons.length ? Math.round((phaseCompleted / phaseLessons.length) * 100) : 0;
            const stageProject = phaseLessons.find(l => l.node_id?.startsWith("stage_project_"));
            const regularLessons = phaseLessons.filter(l => !l.node_id?.startsWith("stage_project_"));

            return (
              <motion.div key={phase} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: pi * 0.1 }}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-zeus-gold/15 text-zeus-brightgold flex items-center justify-center text-xs font-bold">{phase}</span>
                    {isAr ? `المرحلة ${phase}` : `Phase ${phase}`}
                  </h2>
                  <span className="text-xs text-muted-foreground">{phaseCompleted}/{phaseLessons.length}</span>
                </div>
                <div className="h-1 rounded-full bg-secondary/40 overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold transition-all" style={{ width: `${phaseProgress}%` }} />
                </div>
                <div className="space-y-2">
                  {regularLessons.map((lesson) => {
                    const day = DAYS[lesson.day] || { ar: lesson.day, en: lesson.day };
                    const isAvailable = lesson.status === "available";
                    const isCompleted = lesson.status === "completed";
                    const isLocked = lesson.status === "locked";
                    const thumb = thumbUrl(lesson.video_url || lesson.video_iframe_url);
                    const dur = fmtDur(lesson.video_duration);
                    return (
                      <button key={lesson.id} onClick={() => (isAvailable || isCompleted) && nav(`/lesson/${lesson.id}`)}
                        disabled={isLocked}
                        className={`w-full text-start zeus-glass p-4 flex items-center gap-3 transition ${isAvailable ? "zeus-gold-border cursor-pointer" : isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-zeus-gold/30"}`}>
                        {thumb ? (
                          <div className="relative shrink-0 w-20 aspect-video rounded-lg overflow-hidden bg-black/40">
                            <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center">
                              {isCompleted ? <CheckCircle2 className="text-white drop-shadow" style={{ width: 18, height: 18 }} /> : isLocked ? <Lock className="text-white/80 drop-shadow" style={{ width: 15, height: 15 }} /> : <Play className="text-white drop-shadow" style={{ width: 16, height: 16 }} />}
                            </span>
                            {dur && <span className="absolute bottom-0.5 end-0.5 px-1 rounded bg-black/70 text-white text-[10px]">{dur}</span>}
                          </div>
                        ) : (
                          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isCompleted ? "bg-zeus-gold text-zeus-midnight" : isAvailable ? "bg-zeus-gold/15 text-zeus-brightgold" : "bg-secondary/40 text-muted-foreground"}`}>
                            {isCompleted ? <CheckCircle2 style={{ width: 18, height: 18 }} /> : isLocked ? <Lock style={{ width: 16, height: 16 }} /> : <Play style={{ width: 16, height: 16 }} />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{lesson.node_title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{isAr ? day.ar : day.en} · {isAr ? `أسبوع ${lesson.week}` : `Week ${lesson.week}`}{lesson.video_title ? ` · ${lesson.video_title}` : ""}</div>
                        </div>
                        {isAvailable && <span className="text-[10px] px-2 py-1 rounded-full bg-zeus-gold/15 text-zeus-brightgold font-medium">{isAr ? "ابدأ" : "Start"}</span>}
                      </button>
                    );
                  })}
                  {stageProject && (
                    <button onClick={() => (stageProject.status === "available" || stageProject.status === "completed") && nav(`/lesson/${stageProject.id}`)}
                      disabled={stageProject.status === "locked"}
                      className={`w-full text-start p-4 flex items-center gap-3 transition rounded-2xl border-2 border-dashed ${stageProject.status === "available" ? "border-zeus-gold/50 bg-zeus-gold/5 cursor-pointer hover:bg-zeus-gold/10" : stageProject.status === "completed" ? "border-zeus-gold/40 bg-zeus-gold/5 cursor-pointer" : "border-border/40 opacity-50 cursor-not-allowed"}`}>
                        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${stageProject.status === "completed" ? "bg-zeus-gold text-zeus-midnight" : "bg-zeus-gold/15 text-zeus-brightgold"}`}>
                          {stageProject.status === "completed" ? <CheckCircle2 style={{ width: 18, height: 18 }} /> : <FolderKanban style={{ width: 18, height: 18 }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-heading font-bold text-sm flex items-center gap-1.5">
                            <Rocket style={{ width: 13, height: 13, color: "var(--zeus-gold)" }} />
                            {isAr ? `مشروع المرحلة ${phase}` : `Stage Project: Phase ${phase}`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {stageProject.status === "locked" ? (isAr ? "أكمل كل دروس المرحلة الأول" : "Complete all phase lessons first") :
                             stageProject.status === "completed" ? (isAr ? "مكتمل ✓" : "Completed ✓") :
                             (isAr ? "جاهز للبدء" : "Ready to start")}
                          </div>
                        </div>
                      </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </>
      )}
    </div>
  );
}