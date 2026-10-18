import React, { useState } from "react";
import { Rocket, Loader2, CheckCircle2, AlertCircle, ChevronRight, Link as LinkIcon } from "lucide-react";
import { api } from "@/api/client";

// Stage project submission + AI mentor review.
// Approved (>=70) unlocks the next phase via backend; otherwise the AI
// feedback tells the learner exactly what to fix before retrying.
export default function StageProjectPanel({ lesson, isAr, onReviewed, onNext }) {
  const prior = lesson?.task?.review || null;
  const [text, setText] = useState(lesson?.task?.submission_text || "");
  const [url, setUrl] = useState(lesson?.task?.submission_url || "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(prior ? { ...prior, next_lesson_id: null } : null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!text.trim() && !url.trim()) {
      setError(isAr ? "اكتب وصف اللي بنيته أو حط لينك الريبو الأول." : "Describe what you built or add a repo link first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api.functions.invoke("submitPhaseProject", {
        lessonId: lesson.id, submission_text: text.trim(), submission_url: url.trim(), lang: isAr ? "ar" : "en",
      });
      const data = res.data || res;
      if (data.credit_exhausted) {
        setError(isAr ? "رصيد الـ AI خلص — جرّب بعد الشحن." : "AI credit exhausted — try later.");
        return;
      }
      if (data.error && !data.feedback) {
        setError(data.message || (isAr ? "حصل خطأ — حاول تاني." : "Something went wrong — retry."));
        return;
      }
      setResult(data);
      onReviewed && onReviewed(data);
    } catch (e) {
      setError(e.message || (isAr ? "فشل الإرسال — حاول تاني." : "Submit failed — retry."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="zeus-glass p-4">
        <h3 className="font-heading font-bold text-sm mb-1 flex items-center gap-1.5">
          <Rocket style={{ width: 14, height: 14 }} className="text-zeus-gold" />
          {isAr ? "سلّم مشروع المرحلة 🚀" : "Submit Stage Project 🚀"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "ابنِ المشروع المطلوب فوق، وبعدها اشرح اللي عملته وحط لينك الريبو. مراجع AI هيقيّمه، ولو تمام (70%+) هتتفتح المرحلة اللي بعدها."
            : "Build the project above, then describe your work + repo link. An AI reviewer grades it; 70%+ unlocks the next phase."}
        </p>
      </div>

      <div className="zeus-glass p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5">{isAr ? "شرح اللي بنيته *" : "What you built *"}</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={isAr ? "احكي: إيه المشروع؟ إيه الفيتشرز؟ إيه التقنيات؟ وإيه الصعوبات اللي قابلتك؟" : "Describe: what is it? features? stack? challenges?"}
            className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold resize-y" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1"><LinkIcon style={{ width: 12, height: 12 }} />{isAr ? "لينك الريبو / المشروع (اختياري)" : "Repo / live link (optional)"}</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" placeholder="https://github.com/you/project"
            className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm focus:outline-none focus:border-zeus-gold" />
        </div>
        {error && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle style={{ width: 14, height: 14 }} />{error}</p>}
        <button onClick={submit} disabled={submitting}
          className="w-full py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Rocket style={{ width: 16, height: 16 }} />}
          {submitting ? (isAr ? "المراجع بيبص على شغلك..." : "Reviewer is checking your work...") : (isAr ? "ابعت للمراجعة" : "Submit for Review")}
        </button>
      </div>

      {result?.feedback && (
        <div className={`zeus-glass p-4 border-2 ${result.approved ? "border-emerald-500/40" : "border-zeus-gold/30"}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.approved
              ? <CheckCircle2 className="text-emerald-400" style={{ width: 20, height: 20 }} />
              : <AlertCircle className="text-zeus-gold" style={{ width: 20, height: 20 }} />}
            <span className="font-bold text-sm">
              {result.approved ? (isAr ? `اتقبل! 🎉 (${result.score}%)` : `Accepted! 🎉 (${result.score}%)`) : (isAr ? `محتاج شغل زيادة (${result.score}%)` : `Needs work (${result.score}%)`)}
            </span>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed mb-2">{result.feedback}</p>
          {(result.strengths?.length > 0) && (
            <div className="text-xs text-emerald-400 mb-1">{isAr ? "نقاط قوة: " : "Strengths: "}{result.strengths.join("، ")}</div>
          )}
          {(result.improvements?.length > 0) && (
            <div className="text-xs text-zeus-brightgold mb-1">{isAr ? "ظبّط: " : "Fix: "}{result.improvements.join("، ")}</div>
          )}
          {result.next_step && <p className="text-xs text-muted-foreground mt-1">👣 {result.next_step}</p>}
          {result.approved && (
            <button onClick={onNext} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition">
              {isAr ? "ادخل المرحلة اللي بعدها" : "Enter Next Phase"} <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
          )}
          {!result.approved && (
            <p className="text-[11px] text-muted-foreground mt-2">{isAr ? "عدّل شغلك حسب الملاحظات ودوس «ابعت للمراجعة» تاني." : "Improve based on the notes and resubmit."}</p>
          )}
        </div>
      )}
    </div>
  );
}
