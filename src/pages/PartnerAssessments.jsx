import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";

const blankQuestion = () => ({ prompt: "", optionsText: "", correct_index: 0, points: 1 });

export default function PartnerAssessments({ embedded = false }) {
  const { user } = useAuth();
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const t = (ar, en) => isAr ? ar : en;
  const isStudent = user?.role === "partner_student";
  const isStaff = user?.role === "partner" || user?.role === "doctor";
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [draft, setDraft] = useState({ title: "", description: "", kind: "exam", questions: [blankQuestion()] });
  const [activeId, setActiveId] = useState("");
  const [answers, setAnswers] = useState({});
  const [lastResult, setLastResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.partners.assessments();
      setAssessments(result.assessments || []);
      if (isStaff) {
        const dashboard = await api.partners.dashboard();
        setStudents(dashboard.students || []);
      }
    } catch (loadError) {
      setError(loadError.message || t("تعذر تحميل الاختبارات.", "Could not load assessments."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [user?.id]);

  const latestAttempts = useMemo(() => students.flatMap((student) => (
    (student.exam_results || []).flatMap((exam) => exam.attempts.map((attempt) => ({
      ...attempt,
      student_id: student.id,
      student_name: student.full_name,
      title: exam.title,
      kind: exam.kind,
    })))
  )), [students]);

  const createAssessment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const questions = draft.questions.map((question) => ({
        prompt: question.prompt,
        options: question.optionsText.split(/\n/).map((option) => option.trim()).filter(Boolean),
        correct_index: Number(question.correct_index),
        points: Number(question.points),
      }));
      await api.partners.createAssessment({ ...draft, questions });
      setDraft({ title: "", description: "", kind: "exam", questions: [blankQuestion()] });
      setNotice(t("تم إنشاء الاختبار.", "Assessment created."));
      await load();
    } catch (saveError) {
      setError(saveError.message || t("تعذر إنشاء الاختبار.", "Could not create assessment."));
    } finally {
      setSaving(false);
    }
  };

  const toggleAssessment = async (assessment) => {
    setSaving(true);
    setError("");
    try {
      await api.partners.updateAssessment(assessment.id, { is_active: !assessment.is_active });
      await load();
    } catch (updateError) {
      setError(updateError.message || t("تعذر تحديث حالة الاختبار.", "Could not update assessment."));
    } finally {
      setSaving(false);
    }
  };

  const submitAnswers = async (event) => {
    event.preventDefault();
    const assessment = assessments.find((item) => item.id === activeId);
    if (!assessment) return;
    if (assessment.questions.some((_, index) => answers[index] === undefined)) {
      setError(t("أجب عن كل الأسئلة قبل الإرسال.", "Answer every question before submitting."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api.partners.submitAssessment(activeId, answers);
      setLastResult(result.attempt);
      setActiveId("");
      setAnswers({});
      setNotice(t("تم تسجيل إجابتك ودرجتك.", "Your answers and score were recorded."));
      await load();
    } catch (submitError) {
      setError(submitError.message || t("تعذر إرسال الإجابات.", "Could not submit your answers."));
    } finally {
      setSaving(false);
    }
  };

  if (!isStudent && !isStaff) return <Navigate to="/app" replace />;
  const activeAssessment = assessments.find((item) => item.id === activeId);
  const inputClass = "w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-xs";
  const sectionClass = embedded ? "space-y-4 rounded-2xl border border-border/50 bg-card/70 p-4" : "mx-auto max-w-5xl space-y-5";

  return <main dir={dir} className={`partner-console ${sectionClass}`}>
    {!embedded && <header className="flex items-start justify-between gap-3"><div><h1 className="font-heading text-2xl font-extrabold">{t("اختبارات الشريك", "Partner assessments")}</h1><p className="mt-1 text-xs text-muted-foreground">{t("اختبارات وامتحانات مرتبطة بمسارك التعليمي.", "Exams and assessments tied to your learning track.")}</p></div><Link to="/app" className="rounded-xl border border-border/50 px-3 py-2 text-xs">{t("العودة للتعلم", "Back to learning")}</Link></header>}
    {embedded && <header><h2 className="font-heading text-sm font-bold">{t("الامتحانات والاختبارات", "Exams & assessments")}</h2><p className="mt-1 text-[10px] text-muted-foreground">{t("إنشاء امتحانات اختيار من متعدد ومتابعة نتائج الطلاب.", "Create multiple-choice exams and track student results.")}</p></header>}
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</p>}
    {lastResult && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">{t("النتيجة:", "Result:")} <strong>{lastResult.percentage}%</strong> ({lastResult.score}/{lastResult.total_points})</div>}
    {isStaff && <form onSubmit={createAssessment} className="space-y-3 rounded-xl border border-zeus-gold/30 p-3">
      <div className="grid gap-2 sm:grid-cols-3"><input className={inputClass} required maxLength={160} placeholder={t("اسم الاختبار", "Assessment title")} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><select className={inputClass} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}><option value="exam">{t("امتحان", "Exam")}</option><option value="final_exam">{t("امتحان نهائي", "Final exam")}</option></select><input className={inputClass} maxLength={2000} placeholder={t("وصف مختصر", "Short description")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
      {draft.questions.map((question, index) => <fieldset key={index} className="grid gap-2 rounded-xl border border-border/40 p-3 sm:grid-cols-2"><legend className="px-1 text-[10px] text-muted-foreground">{t("السؤال", "Question")} {index + 1}</legend><input className={inputClass} required maxLength={2000} placeholder={t("نص السؤال", "Question prompt")} value={question.prompt} onChange={(event) => setDraft({ ...draft, questions: draft.questions.map((item, i) => i === index ? { ...item, prompt: event.target.value } : item) })} /><textarea className={inputClass} required rows={3} placeholder={t("الاختيارات، كل اختيار في سطر", "Answer choices, one per line")} value={question.optionsText} onChange={(event) => setDraft({ ...draft, questions: draft.questions.map((item, i) => i === index ? { ...item, optionsText: event.target.value } : item) })} /><label className="space-y-1 text-[10px] text-muted-foreground">{t("رقم الإجابة الصحيحة (يبدأ من 0)", "Correct answer index (starts at 0)")}<input className={inputClass} type="number" min="0" max="7" value={question.correct_index} onChange={(event) => setDraft({ ...draft, questions: draft.questions.map((item, i) => i === index ? { ...item, correct_index: event.target.value } : item) })} /></label><label className="space-y-1 text-[10px] text-muted-foreground">{t("الدرجة", "Points")}<input className={inputClass} type="number" min="1" max="1000" value={question.points} onChange={(event) => setDraft({ ...draft, questions: draft.questions.map((item, i) => i === index ? { ...item, points: event.target.value } : item) })} /></label>{draft.questions.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== index) })} className="inline-flex items-center gap-1 text-[10px] text-rose-300 sm:col-span-2"><Trash2 className="h-3 w-3" />{t("حذف السؤال", "Remove question")}</button>}</fieldset>)}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })} disabled={draft.questions.length >= 100} className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-3 py-2 text-[10px]"><Plus className="h-3 w-3" />{t("إضافة سؤال", "Add question")}</button><button disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-zeus-gold/40 bg-zeus-gold/10 px-3 py-2 text-[10px] font-semibold text-zeus-brightgold disabled:opacity-50">{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{t("إنشاء الاختبار", "Create assessment")}</button></div>
    </form>}
    {isStudent && activeAssessment ? <form onSubmit={submitAnswers} className="space-y-4 rounded-xl border border-zeus-gold/30 p-4"><div><h2 className="font-heading text-lg font-bold">{activeAssessment.title}</h2><p className="text-xs text-muted-foreground">{activeAssessment.description}</p></div>{activeAssessment.questions.map((question, index) => <fieldset key={index} className="space-y-2 rounded-xl border border-border/40 p-3"><legend className="px-1 text-xs font-semibold">{index + 1}. {question.prompt} ({question.points} {t("درجة", "points")})</legend>{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex items-center gap-2 rounded-lg p-2 text-xs hover:bg-secondary/40"><input type="radio" name={`q-${index}`} checked={Number(answers[index]) === optionIndex} onChange={() => setAnswers({ ...answers, [index]: optionIndex })} />{option}</label>)}</fieldset>)}<div className="flex gap-2"><button disabled={saving} className="rounded-xl border border-zeus-gold/40 bg-zeus-gold/10 px-4 py-2 text-xs font-semibold text-zeus-brightgold disabled:opacity-50">{saving ? t("جارٍ الإرسال...", "Submitting...") : t("إرسال الإجابات", "Submit answers")}</button><button type="button" onClick={() => { setActiveId(""); setAnswers({}); }} className="rounded-xl border border-border/50 px-4 py-2 text-xs">{t("عودة", "Back")}</button></div></form>
      : loading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-zeus-gold" /></div>
        : <div className="grid gap-3 md:grid-cols-2">{assessments.filter((item) => isStaff || item.is_active).map((assessment) => <article key={assessment.id} className="space-y-3 rounded-xl border border-border/40 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-heading text-sm font-bold">{assessment.title}</h3><p className="mt-1 text-[10px] text-muted-foreground">{assessment.kind === "final_exam" ? t("امتحان نهائي", "Final exam") : t("امتحان", "Exam")} · {assessment.question_count} {t("أسئلة", "questions")}</p></div><ClipboardList className="h-4 w-4 text-zeus-gold" /></div>{assessment.description && <p className="text-xs text-muted-foreground">{assessment.description}</p>}{isStudent && assessment.latest_attempt && <p className="text-xs">{t("آخر نتيجة", "Latest score")}: <strong>{assessment.latest_attempt.percentage}%</strong> ({assessment.latest_attempt.score}/{assessment.latest_attempt.total_points})</p>}{isStudent ? <button type="button" onClick={() => { setActiveId(assessment.id); setAnswers({}); setLastResult(null); }} className="rounded-lg border border-zeus-gold/40 px-3 py-2 text-[10px] font-semibold text-zeus-brightgold">{assessment.latest_attempt ? t("إعادة الاختبار", "Retake assessment") : t("ابدأ الاختبار", "Start assessment")}</button> : <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{assessment.is_active ? t("نشط", "Active") : t("موقوف", "Paused")}</span><button type="button" disabled={saving} onClick={() => toggleAssessment(assessment)} className="rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px]">{assessment.is_active ? t("إيقاف مؤقت", "Pause") : t("تفعيل", "Activate")}</button></div>}</article>)}</div>}
    {isStaff && latestAttempts.length > 0 && <section className="overflow-hidden rounded-xl border border-border/40"><h3 className="border-b border-border/40 p-3 text-xs font-bold">{t("درجات الامتحانات", "Exam grades")}</h3><div className="max-h-64 overflow-auto"><table className="w-full text-start text-[10px]"><thead className="bg-secondary/30"><tr><th className="p-2 text-start">{t("الطالب", "Student")}</th><th className="p-2 text-start">{t("الاختبار", "Assessment")}</th><th className="p-2 text-start">{t("النوع", "Type")}</th><th className="p-2 text-start">{t("النتيجة", "Score")}</th><th className="p-2 text-start">{t("التاريخ", "Submitted")}</th></tr></thead><tbody>{latestAttempts.map((attempt) => <tr key={attempt.id} className="border-t border-border/30"><td className="p-2">{attempt.student_name}</td><td className="p-2">{attempt.title}</td><td className="p-2">{attempt.kind === "final_exam" ? t("نهائي", "Final") : t("امتحان", "Exam")}</td><td className="p-2">{attempt.percentage}% ({attempt.score}/{attempt.total_points})</td><td className="p-2">{new Date(attempt.submitted_date).toLocaleDateString(isAr ? "ar-EG" : "en-US")}</td></tr>)}</tbody></table></div></section>}
    {!loading && !assessments.length && <p className="rounded-xl border border-border/40 p-6 text-center text-xs text-muted-foreground">{isAr ? "لا توجد اختبارات مضافة بعد." : "No assessments have been added yet."}</p>}
  </main>;
}
