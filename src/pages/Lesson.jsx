import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Play, BookOpen, Loader2, Lock, Bot, Brain, AlertCircle, Wrench, Rocket, FolderKanban, RotateCcw, Clock, Calendar } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import VideoPlayer from "@/components/zeus/lesson/VideoPlayer";
import ReadingView from "@/components/zeus/lesson/ReadingView";
import QuizPanel from "@/components/zeus/lesson/QuizPanel";
import StageProjectPanel from "@/components/zeus/lesson/StageProjectPanel";
import TutorSheet from "@/components/zeus/lesson/TutorSheet";
import PDFViewer from "@/components/zeus/lesson/PDFViewer";
import FriendlyError from "@/components/zeus/ErrorBoundary";

export default function Lesson() {
  const { lessonId } = useParams();
  const { t, lang, dir } = useI18n();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const nav = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  const [mode, setMode] = useState("video");
  const [quizState, setQuizState] = useState("idle");
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [nextLessonId, setNextLessonId] = useState(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [tutorTyping, setTutorTyping] = useState(false);
  const [profile, setProfile] = useState(null);
  const [dailyMinutes, setDailyMinutes] = useState(0);
  const [overBudget, setOverBudget] = useState(false);

  const applyPrepared = (data) => {
    setLesson(data);
    setDailyMinutes(data.daily_minutes || 0);
    setOverBudget(!!data.video_over_budget);
  };

  const [regenLeft, setRegenLeft] = useState({ content: 3, video: 3 });

  const withTimeout = (p, ms = 25000) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setQuizState("idle"); setAnswers({}); setResult(null); setNextLessonId(null);
      setDailyMinutes(0); setOverBudget(false);
      setVideoError(""); setPrepareError(false);
      try {
        const [l, profs] = await Promise.all([
          withTimeout(api.entities.Lesson.get(lessonId)),
          api.entities.LearningProfile.filter({}, "-created_date", 1).catch(() => []),
        ]);
        if (cancelled) return;
        setLesson(l);
        if (profs && profs.length > 0) setProfile(profs[0]);
        // Remaining separate budgets (content regens + video swaps).
        try {
          const rs = await api.functions.invoke("regenStatus", { lessonId });
          const d = rs.data || rs;
          if (!d.error) setRegenLeft({ content: d.content_left ?? 3, video: d.video_left ?? 3 });
        } catch {}

        if (l?.quiz_passed) {
          setQuizState("submitted");
          const total = (l.quiz || []).length || 0;
          const score = l.quiz_score ?? 0;
          setResult({ score, passed: true, correct: Math.round((score / 100) * total), total });
        }
        if (l && !l.content_ready && l.status !== "locked") {
          setPreparing(true); setPrepareError(false);
          try {
            const res = await api.functions.invoke("prepareLesson", { lessonId, lang });
            const data = res.data || res;
            if (data.error) {
              if (data.error === "limit") setRegenLeft((p) => ({ ...p, content: 0 }));
              setPrepareError(data.message || true);
            } else applyPrepared(data);
          } catch { if (!cancelled) setPrepareError(true); }
          if (!cancelled) setPreparing(false);
        } else if (l && l.video_url && !l.video_duration) {
          // Old lessons saved before durations existed: backfill silently
          try {
            const res = await withTimeout(api.functions.invoke("refreshVideoMeta", { lessonId }), 20000);
            const d = res.data || res;
            if (d.updated) setLesson({ ...l, video_duration: d.video_duration, video_title: d.video_title || l.video_title });
          } catch {}
        }

        // Fetch lesson-specific chat history (no fixed greeting by design:
        // first message is crafted by the LLM about THIS lesson).
        // Never blocks the lesson itself: guarded + timed out.
        try {
          const chatRes = await withTimeout(api.functions.getLessonChat(lessonId), 15000);
          if (cancelled) return;
          if (chatRes && chatRes.messages && chatRes.messages.length > 0) {
            setTutorMessages(chatRes.messages.map(m => ({
              role: m.role,
              content: m.content,
              ts: m.created_date,
            })));
          } else {
            try {
              const g = await withTimeout(api.functions.invoke("lessonTutor", { lessonId, messages: [], lang, greet: true }), 30000);
              const gd = g.data || g;
              const txt = (gd.reply || "").trim();
              if (!cancelled) setTutorMessages(txt ? [{ role: "assistant", content: txt, ts: new Date().toISOString() }] : []);
            } catch {
              if (!cancelled) setTutorMessages([]);
            }
          }
        } catch {
          if (!cancelled) setTutorMessages([]);
        }
      } catch {
        // Lesson fetch itself failed: loading screen below offers retry
        // instead of hanging forever.
        if (!cancelled) setLesson(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [lessonId, lang, isAr]);

  const [changingVideo, setChangingVideo] = useState(false);
  const [quizStartError, setQuizStartError] = useState("");
  const startQuiz = async () => {
    // Fetch fresh validated quiz from backend; NEVER enter "taking" with a
    // broken/empty set (that used to strand users on unanswerable questions).
    setQuizStartError("");
    try {
      const res = await api.functions.invoke("generateQuiz", { lessonId, lang });
      const data = res.data || res;
      if (data.credit_exhausted) {
        setQuizStartError(isAr ? "رصيد الـ AI خلص — جرّب بعد الشحن" : "AI credit exhausted — try later");
        return;
      }
      if (data.error || !data.questions?.length) {
        setQuizStartError(data.message || (isAr ? "تعذّر تجهيز الاختبار — حاول تاني" : "Couldn't build the quiz — retry"));
        return;
      }
      setLesson({ ...lesson, quiz: data.questions });
    } catch {
      setQuizStartError(isAr ? "تعذّر تجهيز الاختبار — حاول تاني" : "Couldn't build the quiz — retry");
      return;
    }
    setAnswers({});
    setResult(null);
    setQuizState("taking");
  };
  const [videoError, setVideoError] = useState("");
  const changeVideo = async () => {
    // Separate budget: 3 video swaps per lesson.
    if (regenLeft.video <= 0) {
      setVideoError(isAr ? "خلصت محاولات تغيير الفيديو (3/3) لهذا الدرس ✓" : "Video change limit reached (3/3) ✓");
      return;
    }
    setChangingVideo(true);
    setVideoError("");
    try {
      const res = await api.functions.invoke("refreshVideo", { lessonId, lang });
      const data = res.data || res;
      if (data.error === "limit") setRegenLeft((p) => ({ ...p, video: 0 }));
      if (data && data.video_url) {
        setLesson(data);
        if (typeof data.video_regens_left === "number") setRegenLeft((p) => ({ ...p, video: data.video_regens_left }));
        if (typeof data.content_regens_left === "number") setRegenLeft((p) => ({ ...p, content: data.content_regens_left }));
      }
      else setVideoError(data.message || (isAr ? "ملقتش فيديو بديل عن نفس الموضوع — جرّب تاني" : "No alternative video on the same topic — try again"));
    } catch {
      setVideoError(isAr ? "تعذّر تغيير الفيديو — جرّب تاني" : "Couldn't change video — try again");
    }
    setChangingVideo(false);
  };

  const submitQuiz = async () => {
    // Backend-computed grading + unlock (70% to pass). next_lesson_id comes from server.
    try {
      const res = await api.functions.invoke("submitQuiz", { lessonId, answers, lang });
      const data = res.data || res;
      if (data.credit_exhausted) {
        setResult({ score: 0, passed: false, correct: 0, total: lesson?.quiz?.length || 0, credit: true });
        setQuizState("submitted");
        return;
      }
      const quiz = lesson?.quiz || [];
      setResult({ score: data.score, passed: data.passed, correct: Math.round((data.score / 100) * quiz.length), total: quiz.length });
      setQuizState("submitted");
      if (data.passed) {
        if (data.next_lesson_id) {
          setNextLessonId(data.next_lesson_id);
          // Pre-prepare the next lesson in the background so it opens
          // instantly instead of showing a loader on arrival.
          api.functions.invoke("prepareLesson", { lessonId: data.next_lesson_id, lang }).catch(() => {});
        }
        try {
          await api.entities.Notification.create({ type: "lesson", title: isAr ? "درس مكتمل! 🎉" : "Lesson Complete! 🎉", body: isAr ? `خلّصت "${lesson.node_title}" بنجاح (${data.score}%). الدرس التالي فتح!` : `You completed "${lesson.node_title}" (${data.score}%). Next unlocked!`, action_label: isAr ? "الدرس التالي" : "Next", action_url: "/schedule" });
          const fresh = await api.entities.Lesson.get(lessonId);
          setLesson(fresh);
          if (!data.next_lesson_id && fresh?.roadmap_id) {
            const all = await api.entities.Lesson.filter({ roadmap_id: fresh.roadmap_id }, "order", 500);
            const idx = all.findIndex(l => l.id === lessonId);
            const nxt = idx >= 0 ? all[idx + 1] : null;
            // Never offer a still-locked lesson as "next" (backend is the
            // single source of truth for unlocks).
            if (nxt && nxt.status !== "locked") setNextLessonId(nxt.id);
          }
        } catch {}
      }
    } catch {
      // Friendly fallback: local grading with 70%
      const quiz = lesson?.quiz || [];
      let correct = 0;
      quiz.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
      const score = quiz.length ? Math.round((correct / quiz.length) * 100) : 0;
      const passed = score >= 70;
      setResult({ score, passed, correct, total: quiz.length });
      setQuizState("submitted");
    }
  };

  const retryQuiz = () => { setQuizState("taking"); setAnswers({}); setResult(null); };

  // Stage project review: backend grades + unlocks next phase on approval.
  const handleProjectReviewed = async (data) => {
    setLesson((prev) => prev ? {
      ...prev,
      status: data.approved ? "completed" : prev.status,
      task: {
        ...(prev.task || {}),
        submission_text: prev.task?.submission_text,
        submission_url: prev.task?.submission_url,
        review: {
          approved: data.approved, score: data.score, feedback: data.feedback,
          strengths: data.strengths, improvements: data.improvements, next_step: data.next_step,
        },
      },
    } : prev);
    if (data.approved) {
      if (data.next_lesson_id) setNextLessonId(data.next_lesson_id);
      try {
        await api.entities.Notification.create({ type: "lesson", title: isAr ? "مشروع مقبول! 🎉" : "Project Accepted! 🎉", body: isAr ? `مشروع "${lesson.node_title}" اتقبل (${data.score}%). المرحلة اللي بعدها فتحت!` : `Project "${lesson.node_title}" accepted (${data.score}%). Next phase unlocked!`, action_label: isAr ? "المرحلة التالية" : "Next phase", action_url: "/schedule" });
      } catch {}
    }
  };

  // Regenerate content for lessons prepared with wrong/off-topic material:
  // the backend re-resolves a playable YouTube-only video and rewrites the
  // content strictly on this node inside its track. regen=true forces a
  // DIFFERENT video about the same topic. Separate budget: 3 content regens.
  const regenerate = async () => {
    if (regenLeft.content <= 0) {
      setPrepareError(isAr ? "خلصت محاولات إعادة التوليد (3/3) لهذا الدرس ✓" : "Content regeneration limit reached (3/3) ✓");
      return;
    }
    setPrepareError(false);
    setPreparing(true);
    try {
      const res = await api.functions.invoke("prepareLesson", { lessonId, lang, regen: true });
      const data = res.data || res;
      if (data.error) {
        if (data.error === "limit") setRegenLeft((p) => ({ ...p, content: 0 }));
        setPrepareError(data.message || true);
      }
      else {
        applyPrepared(data);
        if (typeof data.content_regens_left === "number") setRegenLeft((p) => ({ ...p, content: data.content_regens_left }));
        if (typeof data.video_regens_left === "number") setRegenLeft((p) => ({ ...p, video: data.video_regens_left }));
        setQuizState("idle"); setAnswers({}); setResult(null);
      }
    } catch { setPrepareError(true); }
    setPreparing(false);
  };

  const sendTutor = async (text) => {
    const userMsg = { role: "user", content: text, ts: new Date().toISOString() };
    const next = [...tutorMessages, userMsg];
    setTutorMessages(next);
    setTutorTyping(true);
    try {
      const res = await api.functions.invoke("lessonTutor", { lessonId, messages: next.map(m => ({ role: m.role, content: m.content })), lang });
      const data = res.data || res;
      const replyText = (data.reply || "").trim();
      setTutorMessages([...next, { role: "assistant", content: replyText || (isAr ? "حصل خطأ، جرّب تاني" : "An error occurred, try again"), ts: new Date().toISOString() }]);
    } catch {
      setTutorMessages([...next, { role: "assistant", content: isAr ? "حصل خطأ، جرّب تاني" : "An error occurred, try again", ts: new Date().toISOString() }]);
    }
    setTutorTyping(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  if (!lesson) return (
    <div className="zeus-glass p-10 text-center">
      <p className="text-muted-foreground text-sm">{isAr ? "الدرس مش موجود" : "Lesson not found"}</p>
      <button onClick={() => nav("/schedule")} className="mt-4 text-zeus-brightgold text-sm">{isAr ? "ارجع للجدول" : "Back to schedule"}</button>
    </div>
  );

  if (lesson.status === "locked") return (
    <div className="zeus-glass p-10 text-center">
      <Lock className="text-muted-foreground mx-auto mb-3" style={{ width: 32, height: 32 }} />
      <p className="text-muted-foreground mb-4 text-sm">{isAr ? "الدرس ده لسه مقفول. خلّص الدرس اللي قبله الأول." : "This lesson is locked. Complete the previous one first."}</p>
      <button onClick={() => nav("/schedule")} className="text-zeus-brightgold text-sm">{isAr ? "ارجع للجدول" : "Back to schedule"}</button>
    </div>
  );

  const isStageProject = lesson.node_id?.startsWith("stage_project_");

  return (
    <div dir={dir} className="space-y-5 pb-20">
      <div className="flex items-center gap-3">
        <button onClick={() => nav("/schedule")} className="shrink-0 w-9 h-9 rounded-full bg-secondary/40 flex items-center justify-center hover:bg-secondary/60 transition">
          {isAr ? <ArrowRight style={{ width: 18, height: 18 }} /> : <ArrowLeft style={{ width: 18, height: 18 }} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zeus-brightgold font-semibold flex items-center gap-1">
            {isStageProject ? <Rocket style={{ width: 12, height: 12 }} /> : null}
            {isStageProject ? (isAr ? `مشروع المرحلة ${lesson.phase}` : `Stage Project · Phase ${lesson.phase}`) : (isAr ? `المرحلة ${lesson.phase}` : `Phase ${lesson.phase}`)}
          </div>
          <h1 className="font-heading font-extrabold text-xl sm:text-2xl truncate">{lesson.node_title}</h1>
        </div>
      </div>

      {preparing ? (
        <div className="zeus-glass p-10 text-center">
          <Loader2 className="text-zeus-gold animate-spin mx-auto mb-4" style={{ width: 32, height: 32 }} />
          <p className="text-muted-foreground text-sm">{isStageProject ? (isAr ? "بجهّز مشروع المرحلة..." : "Preparing stage project...") : (isAr ? "بجهّز محتوى الدرس ده..." : "Preparing this lesson's content...")}</p>
        </div>
      ) : prepareError ? (
        <div className="zeus-glass p-8 text-center">
          <AlertCircle className="text-muted-foreground mx-auto mb-3" style={{ width: 28, height: 28 }} />
          <p className="text-muted-foreground mb-4 text-sm">{typeof prepareError === "string" ? prepareError : (isAr ? "مقدرتش أجهّز المحتوى. حاول تاني." : "Couldn't prepare content. Try again.")}</p>
          <button onClick={async () => { setPrepareError(false); setPreparing(true); try { const res = await api.functions.invoke("prepareLesson", { lessonId, lang }); const d = res.data || res; if (d.error) setPrepareError(d.message || true); else setLesson(d); } catch { setPrepareError(true); } setPreparing(false); }} className="px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-medium text-sm">{isAr ? "حاول تاني" : "Retry"}</button>
        </div>
      ) : (
        <>
          {lesson.summary && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="zeus-glass p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zeus-brightgold mb-2">
                {isStageProject ? <FolderKanban style={{ width: 13, height: 13 }} /> : <Brain style={{ width: 13, height: 13 }} />}
                <span className="flex-1">{isStageProject ? (isAr ? "نظرة عامة على المشروع" : "Project Overview") : (isAr ? "ملخص الدرس" : "Lesson Summary")}</span>
                <button onClick={regenerate} disabled={preparing || regenLeft.content <= 0} title={isAr ? `إعادة توليد المحتوى (متبقي ${regenLeft.content}/3)` : `Regenerate content (${regenLeft.content}/3 left)`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-zeus-gold hover:border-zeus-gold/40 transition text-[11px] disabled:opacity-40">
                  <RotateCcw style={{ width: 12, height: 12 }} /> {isAr ? `إعادة توليد (${regenLeft.content}/3)` : `Regenerate (${regenLeft.content}/3)`}
                </button>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">{lesson.summary}</p>
            </motion.div>
          )}

          {/* Stage Project: no video tab, just reading content */}
          {isStageProject ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="zeus-glass p-5">
                {lesson.reading_content ? <ReadingView content={lesson.reading_content} /> : <p className="text-muted-foreground text-sm">{isAr ? "المحتوى بيتجهّز..." : "Content is being prepared..."}</p>}
              </div>
            </motion.div>
          ) : (
            <>
              <div className="inline-flex p-1 rounded-full bg-card/70 border border-border/60">
                <button onClick={() => setMode("video")} className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${mode === "video" ? "bg-zeus-gold text-zeus-midnight shadow-gold-sm" : "text-muted-foreground"}`}>
                  <Play style={{ width: 13, height: 13 }} /> {isAr ? "فيديو" : "Video"}
                </button>
                <button onClick={() => setMode("reading")} className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${mode === "reading" ? "bg-zeus-gold text-zeus-midnight shadow-gold-sm" : "text-muted-foreground"}`}>
                  <BookOpen style={{ width: 13, height: 13 }} /> {isAr ? "قراءة" : "Reading"}
                </button>
              </div>

              <motion.div key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {mode === "video" ? (
                  lesson.video_url || lesson.video_iframe_url ? (
                    <>
                      <VideoPlayer
                        url={lesson.video_url}
                        iframeUrl={lesson.video_iframe_url}
                        title={lesson.video_title || lesson.node_title}
                        duration={lesson.video_duration}
                      />
                      <button onClick={changeVideo} disabled={changingVideo || regenLeft.video <= 0} title={isAr ? `تغيير الفيديو (متبقي ${regenLeft.video}/3)` : `Change video (${regenLeft.video}/3 left)`} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zeus-gold/40 text-zeus-brightgold text-xs font-semibold hover:bg-zeus-gold/10 transition disabled:opacity-50">
                        <RotateCcw style={{ width: 14, height: 14 }} className={changingVideo ? "animate-spin" : ""} />
                        {changingVideo ? (isAr ? "جاري تغيير الفيديو…" : "Changing video…") : (isAr ? `تغيير الفيديو (${regenLeft.video}/3)` : `Change video (${regenLeft.video}/3)`)}
                      </button>
                      {videoError && <p className="mt-2 text-xs text-destructive">{videoError}</p>}
                      {/* Dynamic Study Schedule Integration (Requirement 6) */}
                      {(() => {
                        const videoDurationSec = Number(lesson.video_duration) || 0;
                        if (videoDurationSec <= 0) return null;

                        let userDailyHours = 2; // sensible fallback
                        if (profile) {
                          const weekly = Number(profile.weekly_hours) || 0;
                          const daysCount = (profile.available_days && profile.available_days.length > 0) ? profile.available_days.length : 5;
                          if (weekly > 0) {
                            userDailyHours = Math.round((weekly / daysCount) * 10) / 10;
                          }
                        } else if (dailyMinutes > 0) {
                          userDailyHours = Math.round((dailyMinutes / 60) * 10) / 10;
                        }
                        if (userDailyHours <= 0) userDailyHours = 2;

                        const videoHoursRaw = videoDurationSec / 3600;
                        const estimatedDays = Math.max(1, Math.ceil(videoHoursRaw / userDailyHours));
                        const formattedVideoHours = videoHoursRaw >= 1
                          ? (Number.isInteger(videoHoursRaw) ? videoHoursRaw : videoHoursRaw.toFixed(1))
                          : (videoDurationSec / 3600).toFixed(1);
                        const formattedDailyHours = Number.isInteger(userDailyHours) ? userDailyHours : userDailyHours.toFixed(1);
                        const isMultiDay = videoHoursRaw > userDailyHours;

                        return (
                          <div className={`p-4 mt-3 rounded-2xl border transition-all ${
                            isMultiDay
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                              : "bg-secondary/40 border-border/60 text-foreground"
                          }`}>
                            <div className="flex items-start gap-3">
                              <Clock className={`shrink-0 mt-0.5 ${isMultiDay ? "text-amber-400" : "text-zeus-gold"}`} style={{ width: 18, height: 18 }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
                                  <span>{isAr ? "الجدول الزمني للدراسة" : "Study Schedule Integration"}</span>
                                  <span className="font-bold text-zeus-brightgold">
                                    {isMultiDay
                                      ? (isAr ? `يحتاج ${estimatedDays} أيام` : `Est. ${estimatedDays} Days`)
                                      : (isAr ? "جلسة اليوم" : "Today's Session")}
                                  </span>
                                </div>
                                <p className="text-sm font-medium leading-relaxed">
                                  {videoHoursRaw >= 1 ? (
                                    isAr
                                      ? `هذا الفيديو مدته تقريباً ${formattedVideoHours} ساعة. بناءً على جدول دراستك (${formattedDailyHours} ساعات/يوم)، قد يستغرق إتمامه حوالي ${estimatedDays} أيام.`
                                      : `This video is approximately ${formattedVideoHours} hours long. Based on your ${formattedDailyHours} hours/day study schedule, it may take approximately ${estimatedDays} days to complete.`
                                  ) : (
                                    isAr
                                      ? `هذا الفيديو مدته تقريباً ${Math.round(videoDurationSec / 60)} دقيقة. بناءً على جدول دراستك (${formattedDailyHours} ساعات/يوم)، يمكن إتمامه بالكامل اليوم.`
                                      : `This video is approximately ${Math.round(videoDurationSec / 60)} minutes long. Based on your ${formattedDailyHours} hours/day study schedule, it can be completed today.`
                                  )}
                                </p>
                                <div className="mt-2.5 space-y-1">
                                  <div className="flex justify-between text-[11px] text-muted-foreground">
                                    <span>{isAr ? `مدة الفيديو: ${formattedVideoHours >= 1 ? `${formattedVideoHours} س` : `${Math.round(videoDurationSec / 60)} د`}` : `Video: ${formattedVideoHours >= 1 ? `${formattedVideoHours}h` : `${Math.round(videoDurationSec / 60)}m`}`}</span>
                                    <span>{isAr ? `طاقتك اليومية: ${formattedDailyHours} س/يوم` : `Your schedule: ${formattedDailyHours}h/day`}</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-secondary/80 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isMultiDay
                                          ? "bg-gradient-to-r from-amber-500 to-orange-400"
                                          : "bg-gradient-to-r from-zeus-gold to-zeus-brightgold"
                                      }`}
                                      style={{
                                        width: `${Math.min(100, Math.round((videoHoursRaw / (userDailyHours * estimatedDays)) * 100))}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="zeus-glass p-8 text-center">
                      <Play className="text-muted-foreground/40 mx-auto mb-3" style={{ width: 32, height: 32 }} />
                      <p className="text-muted-foreground text-sm">{isAr ? "الفيديو لسه بيتجهّز..." : "Video is being prepared..."}</p>
                    </div>
                  )
                ) : (
                  <div className="zeus-glass p-5">
                    {lesson.reading_content ? <ReadingView content={lesson.reading_content} /> : <p className="text-muted-foreground text-sm">{isAr ? "المحتوى المكتوب لسه بيتجهّز..." : "Reading content is being prepared..."}</p>}
                  </div>
                )}
              </motion.div>
            </>
          )}

          {lesson.pdf_url && (
            <div className="mt-4">
              <PDFViewer url={lesson.pdf_url.startsWith("/api/") ? lesson.pdf_url : lesson.pdf_url} title={isAr ? "مستند الدرس (من المنصة)" : "Lesson document"} />
            </div>
          )}

          {isStageProject ? (
            <StageProjectPanel lesson={lesson} isAr={isAr} onReviewed={handleProjectReviewed}
              onNext={() => nextLessonId ? nav(`/lesson/${nextLessonId}`) : nav("/schedule")} />
          ) : (
            <>
              <div className="zeus-glass p-4 mt-4">
                <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "اختبر نفسك 🧪" : "Test yourself 🧪"}</h3>
                <p className="text-xs text-muted-foreground">{isAr ? "لازم تجيب 70% على الأقل عشان يتفتح الدرس اللي بعده. الأسئلة من المحتوى اللي شفته فقط." : "You need 70% to unlock next lesson. Questions are from content only."}</p>
              </div>
              <QuizPanel quiz={lesson.quiz || []} state={quizState} answers={answers} setAnswers={setAnswers} result={result}
            onStart={startQuiz} onSubmit={submitQuiz} onRetry={retryQuiz}
            onNext={() => nextLessonId ? nav(`/lesson/${nextLessonId}`) : nav("/schedule")} hasNext={!!nextLessonId} isAr={isAr}
            startError={quizStartError} onRetryStart={startQuiz} />
          {result?.credit && <FriendlyError onRetry={() => { setQuizState("taking"); setResult(null); }} />}
            </>
          )}

          {lesson.task && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="zeus-glass p-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zeus-brightgold mb-3">
                {isStageProject ? <Rocket style={{ width: 13, height: 13 }} /> : <Wrench style={{ width: 13, height: 13 }} />}
                {isStageProject ? (isAr ? "تفاصيل المشروع" : "Project Details") : (isAr ? "مهمة عملية" : "Hands-on Task")}
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{lesson.task.title}</h3>
              <p className="text-sm text-foreground/85 leading-relaxed mb-3">{lesson.task.description}</p>
              {lesson.task.steps?.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-bold text-zeus-brightgold mb-1.5">{isAr ? "الخطوات" : "Steps"}</h4>
                  <ol className="list-decimal ps-4 text-sm text-muted-foreground space-y-1">
                    {lesson.task.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}
              {lesson.task.deliverables && (
                <div className="mb-3 p-3 rounded-xl bg-secondary/30 border border-border/60">
                  <h4 className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "المطلوب تسليمه" : "Deliverables"}</h4>
                  <p className="text-sm text-muted-foreground">{lesson.task.deliverables}</p>
                </div>
              )}
              {lesson.task.completion_criteria && (
                <div className="mb-3 p-3 rounded-xl bg-secondary/30 border border-border/60">
                  <h4 className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "معايير الإتمام" : "Completion Criteria"}</h4>
                  <p className="text-sm text-muted-foreground">{lesson.task.completion_criteria}</p>
                </div>
              )}
              {lesson.task.applied_skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {lesson.task.applied_skills.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-zeus-gold/10 text-zeus-brightgold text-xs">{s}</span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </>
      )}

      {!preparing && !prepareError && (
        <button onClick={() => setTutorOpen(true)} className="fixed bottom-24 end-4 z-30 w-14 h-14 rounded-full bg-zeus-gold text-zeus-midnight shadow-gold flex items-center justify-center hover:bg-zeus-brightgold transition">
          {isStageProject ? <FolderKanban style={{ width: 24, height: 24 }} /> : <Bot style={{ width: 24, height: 24 }} />}
        </button>
      )}

      <TutorSheet open={tutorOpen} onClose={() => setTutorOpen(false)} messages={tutorMessages} onSend={sendTutor} typing={tutorTyping} isAr={isAr} t={t} lang={lang} />
    </div>
  );
}

function fmtMin(sec) {
  return Math.round((sec || 0) / 60);
}