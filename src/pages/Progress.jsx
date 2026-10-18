import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Flame, Clock, Target, Loader2, CheckCircle2, Play, BookOpen, ArrowRight, ArrowLeft, Award } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Progress() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const nav = useNavigate();
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [lessons, setLessons] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [roadmaps, allLessons] = await Promise.all([
          api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1).catch(() => []),
          api.entities.Lesson.filter({}, "order", 500).catch(() => []),
        ]);

        if (roadmaps && roadmaps.length > 0) {
          setRoadmap(roadmaps[0]);
          // If we have an active roadmap, filter lessons belonging to it if possible
          const rLessons = allLessons.filter(l => l.roadmap_id === roadmaps[0].id);
          setLessons(rLessons.length > 0 ? rLessons : allLessons);
        } else {
          setLessons(allLessons || []);
        }
      } catch (err) {
        console.error("Failed to load progress data:", err);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  // Calculate real metrics directly from lessons & roadmap
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.status === "completed" || l.quiz_passed);
  const completedCount = completedLessons.length;
  const overallPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Real completed study time in hours
  const totalCompletedSec = completedLessons.reduce((acc, l) => acc + (Number(l.video_duration) || 900), 0);
  const totalStudyHours = (totalCompletedSec / 3600).toFixed(1);

  // Group lessons by phase
  const phasesMap = {};
  lessons.forEach((l) => {
    const p = l.phase || 1;
    if (!phasesMap[p]) phasesMap[p] = [];
    phasesMap[p].push(l);
  });

  const phasesList = Object.keys(phasesMap)
    .map((k) => {
      const pNum = Number(k);
      const pLessons = phasesMap[pNum];
      const pDone = pLessons.filter((l) => l.status === "completed" || l.quiz_passed).length;
      const pct = pLessons.length ? Math.round((pDone / pLessons.length) * 100) : 0;
      return {
        phase: pNum,
        total: pLessons.length,
        done: pDone,
        pct,
        isCompleted: pct === 100 && pLessons.length > 0,
        sampleTitle: pLessons[0]?.node_title || `المرحلة ${pNum}`,
      };
    })
    .sort((a, b) => a.phase - b.phase);

  const completedPhasesCount = phasesList.filter((p) => p.isCompleted).length;
  const totalPhasesCount = phasesList.length;

  const streak = computeLessonStreak(lessons);
  const skillGraph = profile?.skill_graph || [];

  // Find next lesson to study
  const nextLesson = lessons.find((l) => l.status === "available" && !l.quiz_passed);

  return (
    <div dir={dir} className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl">
            {t("progress.title") || (isAr ? "تقدّم التعلم" : "Learning Progress")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {profile?.goal || roadmap?.title || (isAr ? "متابعة إنجازك والوقت المستثمر" : "Track your real achievement and time")}
          </p>
        </div>
        {nextLesson && (
          <button
            onClick={() => nav(`/lesson/${nextLesson.id}`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-xs font-bold hover:bg-zeus-brightgold transition shadow-md shrink-0"
          >
            <Play style={{ width: 14, height: 14 }} />
            <span>{isAr ? "متابعة الدرس الحالي" : "Continue Next Lesson"}</span>
            <Arrow style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {/* Main Metric Cards */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="zeus-glass p-6 flex flex-col items-center justify-center rounded-2xl border border-border/60">
          <Ring value={overallPct} />
          <div className="mt-3 text-sm font-semibold text-foreground">
            {isAr ? "إجمالي التقدّم في الخطة" : "Overall Roadmap Progress"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {completedCount} {isAr ? "من أصل" : "of"} {totalLessons} {isAr ? "دروس مكتملة" : "lessons completed"}
          </div>
        </div>

        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <Stat
            icon={Flame}
            label={isAr ? "أيام التعلم المتتالية" : "Study Streak"}
            value={`${streak} ${isAr ? "أيام" : "days"}`}
            sub={streak > 0 ? (isAr ? "أداء ممتاز! استمر" : "Keep it up!") : (isAr ? "ابدأ اليوم" : "Start today")}
          />
          <Stat
            icon={Target}
            label={isAr ? "المراحل المكتملة" : "Stages Completed"}
            value={`${completedPhasesCount} / ${totalPhasesCount}`}
            sub={isAr ? "مرحلة كاملة" : "phases done"}
          />
          <Stat
            icon={Clock}
            label={isAr ? "وقت الدراسة الفعلي" : "Total Study Time"}
            value={`${totalStudyHours} ${isAr ? "ساعة" : "hours"}`}
            sub={isAr ? "بناءً على الفيديوهات المنجزة" : "From completed content"}
          />
          <Stat
            icon={TrendingUp}
            label={isAr ? "خطة الساعات الأسبوعية" : "Weekly Target"}
            value={`${profile?.weekly_hours || 10} ${isAr ? "س/أسبوع" : "h/wk"}`}
            sub={isAr ? "الجدول المخصص لك" : "Your study schedule"}
          />
        </div>
      </div>

      {/* Phase Progress Details */}
      {phasesList.length > 0 && (
        <div className="zeus-glass p-6 rounded-2xl border border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-bold text-lg text-foreground flex items-center gap-2">
              <Award className="text-zeus-gold" style={{ width: 20, height: 20 }} />
              <span>{isAr ? "تقدّم المراحل الدراسية" : "Stage Breakdown"}</span>
            </h2>
            <span className="text-xs text-muted-foreground font-semibold">
              {completedPhasesCount} / {totalPhasesCount} {isAr ? "مراحل مكتملة" : "stages done"}
            </span>
          </div>

          <div className="space-y-4">
            {phasesList.map((p) => (
              <div key={p.phase} className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
                <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-zeus-gold/20 text-zeus-brightgold text-xs font-bold flex items-center justify-center">
                      {p.phase}
                    </span>
                    <span className="font-semibold text-foreground">
                      {isAr ? `المرحلة ${p.phase}` : `Phase ${p.phase}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {p.done} / {p.total} {isAr ? "دروس" : "lessons"}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      p.pct === 100
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-secondary text-foreground"
                    }`}>
                      {p.pct}%
                    </span>
                  </div>
                </div>

                <div className="h-2 rounded-full bg-secondary/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      p.pct === 100
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-zeus-gold to-zeus-brightgold"
                    }`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill Growth Graph */}
      <div className="zeus-glass p-6 rounded-2xl border border-border/60">
        <h2 className="font-heading font-bold text-lg mb-4 text-foreground">
          {isAr ? "تطوّر المهارات المكتسبة" : "Skill Growth"}
        </h2>
        {skillGraph.length > 0 ? (
          <div className="space-y-3.5">
            {skillGraph.map((s) => (
              <div key={s.skill}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-foreground">{s.skill}</span>
                  <span className="text-zeus-brightgold font-bold">{s.level}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(5, s.level))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm">
            {isAr
              ? "يتم تحديث تقييم المهارات تلقائياً مع اجتياز كويزات الدروس وإكمال المشاريع."
              : "Skill ratings update automatically as you complete lesson quizzes and projects."}
          </div>
        )}
      </div>
    </div>
  );
}

function Ring({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, value))) / 100}
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="progress-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-heading font-extrabold text-zeus-brightgold text-3xl">
        {value}%
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="zeus-glass p-5 rounded-2xl border border-border/60 flex items-center gap-3.5">
      <div className="w-12 h-12 rounded-xl bg-zeus-gold/15 flex items-center justify-center shrink-0">
        <Icon className="text-zeus-gold" style={{ width: 22, height: 22 }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-heading font-extrabold text-xl text-foreground mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function computeLessonStreak(lessons) {
  const completed = lessons.filter(
    (l) => (l.status === "completed" || l.quiz_passed) && (l.updated_date || l.created_date)
  );
  if (!completed.length) return 0;
  const days = new Set(
    completed.map((l) => (l.updated_date || l.created_date).slice(0, 10))
  );

  let streak = 0;
  let d = new Date();
  const todayStr = d.toISOString().slice(0, 10);
  if (!days.has(todayStr)) {
    d.setDate(d.getDate() - 1);
  }
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}