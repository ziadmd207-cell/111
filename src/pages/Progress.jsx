import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Flame, Clock, Target, Loader2, Play, ArrowRight, ArrowLeft, Award, BookOpen, CheckCircle2, Brain, MessageCircle, Send } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Progress() {
  const { lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const nav = useNavigate();
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [lessons, setLessons] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const [insights, setInsights] = useState({ tracks: [], weak_topics: [] });
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [trackAction, setTrackAction] = useState("");
  const [advancedFocus, setAdvancedFocus] = useState("");
  const [advancedInstructions, setAdvancedInstructions] = useState("");
  const [customPlanOpen, setCustomPlanOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [tutorTopic, setTutorTopic] = useState("");
  const [tutorInput, setTutorInput] = useState("");
  const [tutorMessages, setTutorMessages] = useState([]);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [finishNotice, setFinishNotice] = useState("");

  const loadInsights = async () => {
    setActionError("");
    try {
      const response = await api.functions.invoke("learningInsights");
      const data = response.data || response;
      const active = data.active_track || (data.tracks || [])[0] || null;
      setInsights(data);
      setRoadmap(active ? { ...active, title: active.goal } : null);
      setLessons(active ? (data.lessons || []).filter((lesson) => lesson.roadmap_id === active.id) : []);
      setTutorMessages(data.review_messages || []);
      setAnalysisError("");
      setAnalysisLoading(true);
      api.functions.invoke("learningCoach", { mode: "analyze", lang })
        .then((result) => setAiAnalysis((result.data || result).analysis || null))
        .catch((error) => setAnalysisError(error.message || (isAr ? "تعذر تحليل سجل التعلم بالذكاء الاصطناعي." : "Couldn't analyze your learning record with AI.")))
        .finally(() => setAnalysisLoading(false));
    } catch (err) {
      setActionError(err.message || (isAr ? "تعذر تحميل بيانات التقدم." : "Couldn't load learning progress."));
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const response = await api.functions.invoke("learningCoach", { mode: "analyze", lang });
      setAiAnalysis((response.data || response).analysis || null);
    } catch (error) {
      setAnalysisError(error.message || (isAr ? "تعذر تحليل سجل التعلم بالذكاء الاصطناعي." : "Couldn't analyze your learning record with AI."));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const askTutor = async (event) => {
    event.preventDefault();
    const message = tutorInput.trim();
    if (!message || tutorBusy) return;
    setTutorMessages((current) => [...current, { role: "user", content: message }]);
    setTutorInput("");
    setTutorBusy(true);
    setActionError("");
    try {
      const response = await api.functions.invoke("learningCoach", {
        mode: "tutor", topic: tutorTopic, messages: [{ role: "user", content: message }], lang,
      });
      const result = response.data || response;
      if (!result.reply) throw new Error(isAr ? "لم يصل رد من المدرس، حاول مرة أخرى." : "The tutor returned no reply. Please retry.");
      setTutorMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر إرسال السؤال للمدرس." : "Couldn't send your question to the tutor."));
      setTutorMessages((current) => current.slice(0, -1));
      setTutorInput(message);
    } finally {
      setTutorBusy(false);
    }
  };

  const openTutor = (topic) => {
    setTutorTopic(topic);
    setTutorMessages((insights.review_messages || []).filter((message) => message.topic === topic));
  };

  useEffect(() => { loadInsights(); }, []);

  const finalizeTrack = async () => {
    if (!roadmap || trackAction) return;
    if (roadmap.status === "completed") return;
    if (roadmap.status !== "active" || !trackCompleted) {
      throw new Error(isAr ? "أكمل كل الدروس ومشروع التخرج أولًا." : "Complete every lesson and the capstone first.");
    }
    await api.functions.invoke("finishLearningTrack", { roadmapId: roadmap.id });
  };

  const finishJourney = async () => {
    if (!roadmap || trackAction) return;
    setTrackAction("finish");
    setActionError("");
    try {
      await finalizeTrack();
      await api.functions.invoke("closeLearningJourney", { roadmapId: roadmap.id });
      setFinishNotice(isAr ? "سيتم التواصل معك قريبًا." : "We’ll contact you soon.");
      await loadInsights();
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر تسجيل إنهاء رحلة التعلم." : "Couldn't finish your learning journey."));
    } finally {
      setTrackAction("");
    }
  };

  const prepareActiveSchedule = async () => {
    if (!roadmap || trackAction) return;
    setTrackAction("schedule");
    setActionError("");
    try {
      const response = await api.functions.invoke("generateSchedule", {
        roadmapId: roadmap.id,
        availableDays: profile?.available_days || [],
        lang,
      });
      const schedule = response.data || response;
      if (!Array.isArray(schedule.lessons) || schedule.lessons.length === 0) {
        throw new Error(isAr ? "تعذر إعداد جدول الدروس لهذا المسار." : "Couldn't prepare this track's lesson schedule.");
      }
      await loadInsights();
      nav("/schedule");
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر إعداد جدول الدروس." : "Couldn't prepare the lesson schedule."));
    } finally {
      setTrackAction("");
    }
  };

  const startAdvancedTrack = async (custom = false) => {
    if (!roadmap || trackAction) return;
    setTrackAction("advanced");
    setActionError("");
    try {
      await finalizeTrack();
      const generated = await api.functions.invoke("generateAdvancedRoadmap", {
        roadmapId: roadmap.id,
        focus: custom ? advancedFocus.trim() : "",
        instructions: custom ? advancedInstructions.trim() : "",
        lang,
      });
      const data = generated.data || generated;
      const track = data.roadmap;
      if (!track?.id) throw new Error(isAr ? "لم يتم إنشاء المسار المتقدم." : "The advanced track was not created.");
      const scheduleResponse = await api.functions.invoke("generateSchedule", {
        roadmapId: track.id,
        availableDays: profile?.available_days || [],
        lang,
      });
      const schedule = scheduleResponse.data || scheduleResponse;
      if (!Array.isArray(schedule.lessons) || schedule.lessons.length === 0) {
        throw new Error(isAr ? "تم إنشاء المسار لكن تعذر إعداد جدول دروسه." : "The track was created, but its lesson schedule could not be prepared.");
      }
      await loadInsights();
      nav("/schedule");
    } catch (error) {
      setActionError(error.message || (isAr ? "تعذر إنشاء المسار المتقدم." : "Couldn't create the advanced track."));
      await loadInsights();
    } finally {
      setTrackAction("");
    }
  };

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

  const totalWatchedSec = (insights.lessons || []).reduce(
    (total, lesson) => total + Math.max(0, Number(lesson.video_watched_sec) || 0),
    0,
  );
  const totalStudyHours = (totalWatchedSec / 3600).toFixed(1);

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
  const trackCompleted = totalLessons > 0
    && completedCount === totalLessons
    && roadmap?.capstone_completed;
  const journeyFinished = roadmap?.status === "finished";

  const streak = computeLessonStreak(lessons);
  const skillGraph = insights.skill_graph || profile?.skill_graph || [];
  const quizStats = insights.quiz_stats || {};

  // Find next lesson to study
  const nextLesson = lessons.find((l) => l.status === "available" && !l.quiz_passed);

  return (
    <div dir={dir} className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl">
            {isAr ? "إحصائيات تعلمك" : "Your Learning Statistics"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {profile?.current_role || profile?.career_intent || profile?.goal || roadmap?.title || (isAr ? "متابعة إنجازك وخطوتك المهنية التالية" : "Track your evidence-based progress and next career step")}
          </p>
        </div>
        {actionError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{actionError}</p>}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Target} label={isAr ? "دقة إجابات الكويز" : "Quiz accuracy"} value={`${quizStats.accuracy_percent || 0}%`} sub={`${quizStats.correct_answers || 0} ${isAr ? "صحيحة" : "correct"} · ${quizStats.incorrect_answers || 0} ${isAr ? "خاطئة" : "incorrect"}`} />
        <Stat icon={BookOpen} label={isAr ? "محاولات الكويز" : "Quiz attempts"} value={quizStats.attempts || 0} sub={`${quizStats.questions_answered || 0} ${isAr ? "سؤالًا تمت الإجابة عنه" : "questions answered"}`} />
        <Stat icon={CheckCircle2} label={isAr ? "المسارات المكتملة" : "Completed tracks"} value={(insights.tracks || []).filter((track) => ["completed", "finished"].includes(track.status)).length} sub={`${insights.tracks?.length || 0} ${isAr ? "مسارات محفوظة" : "tracks preserved"}`} />
        <Stat icon={MessageCircle} label={isAr ? "تفاعلك مع المدرس" : "Tutor engagement"} value={insights.interaction_stats?.user_turns || 0} sub={`${insights.interaction_stats?.clarification_requests || 0} ${isAr ? "طلبات توضيح" : "clarification requests"}`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
        <div className="zeus-glass space-y-4 rounded-2xl border border-border/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zeus-gold/10 text-zeus-gold"><Brain className="h-5 w-5" /></span>
              <div><p className="text-xs text-muted-foreground">{isAr ? "تحليل مبني على محاولاتك وتفاعلك" : "Based on your quiz and tutor history"}</p><h2 className="font-heading font-bold">{isAr ? "تحليل الذكاء الاصطناعي" : "AI learning analysis"}</h2></div>
            </div>
            <button type="button" onClick={refreshAnalysis} disabled={analysisLoading} className="rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold disabled:opacity-50">
              {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? "تحديث التحليل" : "Refresh analysis")}
            </button>
          </div>
          {analysisError && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{analysisError}</p>}
          {analysisLoading && !aiAnalysis && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isAr ? "الذكاء الاصطناعي يراجع سجل تعلمك..." : "AI is reviewing your learning record..."}</div>}
          {aiAnalysis && <>
            <p className="rounded-xl bg-background/40 p-3 text-sm leading-6">{aiAnalysis.summary}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold text-emerald-400">{isAr ? "نقاط قوة مثبتة" : "Evidence-backed strengths"}</h3>
                {aiAnalysis.strengths?.length
                  ? <ul className="space-y-2 text-xs leading-5 text-muted-foreground">{aiAnalysis.strengths.map((item, index) => <li key={index} className="rounded-lg bg-emerald-500/5 p-2.5">{item}</li>)}</ul>
                  : <p className="text-xs text-muted-foreground">{isAr ? "اجتز المزيد من الكويزات لتظهر نقاط القوة المدعومة بأدلة." : "Complete more quizzes to establish evidence-backed strengths."}</p>}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold text-amber-300">{isAr ? "ما يحتاج مراجعة" : "Topics to strengthen"}</h3>
                {aiAnalysis.weaknesses?.length
                  ? <div className="space-y-2">{aiAnalysis.weaknesses.map((item, index) => <button key={`${item.topic}-${index}`} type="button" onClick={() => openTutor(item.topic || "")} className={`w-full rounded-xl border p-3 text-start transition ${tutorTopic === item.topic ? "border-zeus-gold/50 bg-zeus-gold/5" : "border-border/50 bg-background/30 hover:border-zeus-gold/30"}`}><span className="text-xs font-bold">{item.topic || (isAr ? `موضوع ${index + 1}` : `Topic ${index + 1}`)}</span><span className="mt-1 block whitespace-pre-line text-xs leading-5 text-muted-foreground">{item.review || item.evidence}</span></button>)}</div>
                  : <p className="text-xs text-muted-foreground">{isAr ? "لا توجد نقاط ضعف متكررة مؤكدة في سجل الكويزات حتى الآن." : "No recurring quiz weakness is established in the current record yet."}</p>}
              </div>
            </div>
            {!!aiAnalysis.next_steps?.length && <div><h3 className="mb-2 text-xs font-bold">{isAr ? "خطواتك المقترحة" : "Suggested next steps"}</h3><ul className="list-inside list-disc space-y-1 text-xs leading-5 text-muted-foreground">{aiAnalysis.next_steps.map((step, index) => <li key={index}>{step}</li>)}</ul></div>}
          </>}
        </div>

        <div className="zeus-glass rounded-2xl border border-border/60 p-5">
          <h2 className="font-heading font-bold">{isAr ? "نتائج آخر الكويزات" : "Recent quiz results"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "النتيجة الفعلية لكل محاولة محفوظة" : "Actual recorded score for each attempt"}</p>
          {(insights.quiz_attempts || []).length ? (
            <div className="mt-4 space-y-3">
              {insights.quiz_attempts.slice(-7).reverse().map((attempt, index) => {
                const score = Math.max(0, Math.min(100, Number(attempt.score) || 0));
                return <div key={`${attempt.lesson_id}-${attempt.submitted_at || index}`}><div className="mb-1 flex justify-between gap-2 text-[11px]"><span className="truncate">{attempt.lesson_title}</span><span className={attempt.passed ? "text-emerald-400" : "text-amber-300"}>{score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary/60"><div className={`h-full rounded-full ${attempt.passed ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${score}%` }} /></div></div>;
              })}
            </div>
          ) : <p className="mt-4 rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">{isAr ? "ستظهر النتائج هنا بعد حل أول كويز." : "Results will appear after your first quiz."}</p>}
          {!!skillGraph.length && <div className="mt-5 border-t border-border/50 pt-4"><h3 className="mb-2 text-xs font-bold">{isAr ? "مهاراتك الحالية" : "Current skills"}</h3><div className="flex flex-wrap gap-1.5">{skillGraph.slice(0, 12).map((skill) => <span key={skill.skill} className="rounded-full bg-zeus-gold/10 px-2.5 py-1 text-[10px] text-zeus-brightgold">{skill.skill} · {skill.level}%</span>)}</div></div>}
        </div>
      </section>

      {(insights.weak_topics || []).length > 0 && (
        <section className="zeus-glass space-y-3 rounded-2xl border border-border/60 p-5">
          <div><h2 className="font-heading font-bold">{isAr ? "مراجعة الأخطاء المتكررة" : "Review recurring mistakes"}</h2><p className="mt-1 text-xs text-muted-foreground">{isAr ? "كل موضوع هنا مرتبط بإجاباتك الفعلية، وليس بالدرجة وحدها." : "Each topic is tied to actual answers, not the score alone."}</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.weak_topics.map((topic) => <article key={topic.topic} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{topic.topic}</h3><span className="text-[10px] text-amber-200">{topic.incorrect} {isAr ? "إجابة خاطئة" : "incorrect answers"} / {topic.questions}</span></div>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{topic.lesson_title}{topic.phase ? ` · ${isAr ? "المرحلة" : "Phase"} ${topic.phase}` : ""}</p>
              {topic.summary && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{topic.summary}</p>}
              {!!topic.sample_mistakes?.length && <div className="mt-2 space-y-1">{topic.sample_mistakes.map((mistake, index) => <p key={index} className="text-[11px] leading-5 text-muted-foreground">{mistake.question}{mistake.feedback ? ` — ${mistake.feedback}` : ""}</p>)}</div>}
              <button type="button" onClick={() => openTutor(topic.topic)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zeus-gold/30 px-3 py-1.5 text-[11px] font-semibold text-zeus-brightgold"><Brain className="h-3.5 w-3.5" />{isAr ? "راجع مع المدرس" : "Review with tutor"}</button>
            </article>)}
          </div>
        </section>
      )}

      {!!tutorTopic && (
        <section className="zeus-glass space-y-3 rounded-2xl border border-zeus-gold/25 p-5">
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-heading font-bold">{isAr ? "مدرس التقوية التفاعلي" : "Interactive AI tutor"}</h2><p className="mt-1 text-xs text-muted-foreground">{isAr ? `نراجع: ${tutorTopic}` : `Reviewing: ${tutorTopic}`}</p></div><button type="button" onClick={() => { setTutorTopic(""); setTutorMessages([]); }} className="text-xs text-muted-foreground underline">{isAr ? "إغلاق" : "Close"}</button></div>
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-background/30 p-3">
            {tutorMessages.length === 0 && <p className="text-xs text-muted-foreground">{isAr ? "اكتب سؤالك، أو اطلب شرح الموضوع من البداية." : "Ask a question or request an explanation from the beginning."}</p>}
            {tutorMessages.map((message, index) => <p key={index} className={`whitespace-pre-wrap rounded-xl p-3 text-xs leading-6 ${message.role === "user" ? "ms-8 bg-zeus-gold/10" : "me-8 bg-card/80"}`}>{message.content}</p>)}
            {tutorBusy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isAr ? "المدرس يجهز شرحًا وتمرينًا..." : "Tutor is preparing an explanation and exercise..."}</p>}
          </div>
          <form onSubmit={askTutor} className="flex gap-2">
            <input value={tutorInput} onChange={(event) => setTutorInput(event.target.value)} maxLength={2000} placeholder={isAr ? "اكتب سؤالك أو إجابتك على التدريب..." : "Ask a question or answer the practice prompt..."} className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm" />
            <button type="submit" disabled={tutorBusy || !tutorInput.trim()} className="inline-flex items-center gap-2 rounded-xl bg-zeus-gold px-4 py-2 text-xs font-bold text-zeus-midnight disabled:opacity-50"><Send className="h-4 w-4" />{isAr ? "إرسال" : "Send"}</button>
          </form>
        </section>
      )}

        {roadmap && (
          <section className="zeus-glass rounded-2xl border border-border/60 p-4 sm:p-5">
            {roadmap.status === "active" && totalLessons === 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-heading font-bold">{isAr ? "المسار جاهز، والجدول لم يُجهّز بعد" : "Track ready; lesson schedule still needs preparation"}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{isAr ? "يمكنك إعادة محاولة تجهيز دروس المسار بدون إنشاء نسخة مكررة." : "Retry the schedule preparation without creating a duplicate track."}</p>
                </div>
                <button type="button" onClick={prepareActiveSchedule} disabled={!!trackAction}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
                  {trackAction === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  {isAr ? "إعادة تجهيز الجدول" : "Prepare schedule"}
                </button>
              </div>
            ) : journeyFinished ? (
              <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <h2 className="font-heading font-bold">{isAr ? "أنهيت رحلة التعلّم بنجاح" : "You finished your learning journey"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{finishNotice || (isAr ? "سيتم التواصل معك قريبًا. إنجازاتك ومساراتك المكتملة محفوظة في ملفك." : "We’ll contact you soon. Your completed tracks and achievements remain saved in your profile.")}</p>
              </div>
            ) : trackCompleted ? (
              <div className="space-y-3">
                <div>
                  <h2 className="font-heading font-bold">{isAr ? "أكملت المسار ومشروعه النهائي — اختر خطوتك التالية" : "Track and capstone complete — choose your next step"}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{isAr ? "الخطة التالية ستُبنى على الوظيفة المستهدفة وسجل تعلمك، مع الحفاظ على كل إنجازاتك." : "Your next track will use your target role and full learning history while preserving every achievement."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={finishJourney} disabled={!!trackAction}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 px-4 py-2.5 text-xs font-bold disabled:opacity-50">
                    {trackAction === "finish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isAr ? "إنهاء رحلتي" : "Finish learning"}
                  </button>
                  <button type="button" onClick={() => startAdvancedTrack(false)} disabled={!!trackAction}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
                    {trackAction === "advanced" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                    {isAr ? "تعلّم المزيد — خطة مرتبطة بوظيفتي" : "Learn more — job-guided plan"}
                  </button>
                  <button type="button" onClick={() => setCustomPlanOpen((open) => !open)} disabled={!!trackAction}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-zeus-gold/40 px-4 py-2.5 text-xs font-bold text-zeus-brightgold disabled:opacity-50">
                    {isAr ? "أحدد أنا ما أريد تعلمه" : "Choose what I want to learn"}
                  </button>
                </div>
                {customPlanOpen && (
                  <div className="space-y-2 rounded-xl border border-border/50 bg-background/40 p-3">
                    <input value={advancedFocus} onChange={(event) => setAdvancedFocus(event.target.value)}
                      maxLength={200} placeholder={isAr ? "المجال أو الوظيفة المستهدفة، مثل: مهندس تعلم آلي مبتدئ" : "Target field or role, e.g. Junior Machine Learning Engineer"}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm" />
                    <textarea value={advancedInstructions} onChange={(event) => setAdvancedInstructions(event.target.value)}
                      maxLength={1200} rows={3} placeholder={isAr ? "اكتب الموضوعات أو المهارات أو متطلبات الوظائف التي تريد التركيز عليها..." : "Describe the topics, skills, or job requirements you want the new roadmap to focus on..."}
                      className="w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm" />
                    <button type="button" onClick={() => startAdvancedTrack(true)} disabled={!!trackAction || (!advancedFocus.trim() && !advancedInstructions.trim())}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-zeus-gold px-4 py-2.5 text-xs font-bold text-zeus-midnight disabled:opacity-50">
                      {trackAction === "advanced" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                      {isAr ? "أنشئ خريطة تعلمي المخصصة" : "Create my custom roadmap"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}
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
            label={isAr ? "وقت مشاهدة الفيديو المسجل" : "Recorded Video Watch Time"}
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
      {(phasesList.length > 0 || insights.weak_topics?.length || insights.tracks?.length) && (
        <div className="zeus-glass p-6 rounded-2xl border border-border/60">
          {phasesList.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-lg text-foreground flex items-center gap-2">
                <Award className="text-zeus-gold" style={{ width: 20, height: 20 }} />
                <span>{isAr ? "تقدّم المراحل الدراسية" : "Stage Breakdown"}</span>
              </h2>
              <span className="text-xs text-muted-foreground font-semibold">
                {completedPhasesCount} / {totalPhasesCount} {isAr ? "مراحل مكتملة" : "stages done"}
              </span>
            </div>
          )}

          {!!insights.tracks?.length && (
            <section className="zeus-glass rounded-2xl border border-border/60 p-5">
              <h2 className="mb-3 font-heading font-bold text-lg">{isAr ? "سجل مسارات التعلم" : "Learning track history"}</h2>
              <div className="space-y-2">
                {insights.tracks.map((track) => (
                  <div key={track.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-secondary/15 px-3 py-2.5 text-xs">
                    <span className="font-semibold">{track.goal}</span>
                    <span className="text-muted-foreground">
                      {track.lessons_completed}/{track.lessons_total} · {track.progress_percent}% · {
                        track.status === "finished" ? (isAr ? "أنهى رحلة التعلم" : "Journey finished")
                          : track.status === "completed" ? (isAr ? "مكتمل" : "Completed")
                          : track.status === "active" ? (isAr ? "جاري" : "Active")
                            : (isAr ? "مؤرشف" : "Archived")
                      }
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {phasesList.length > 0 && (
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
          )}
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