import React from "react";
import { Brain, Check, X, RotateCcw, ChevronRight } from "lucide-react";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

export default function QuizPanel({ quiz, state, answers, setAnswers, result, onStart, onSubmit, onRetry, onNext, hasNext, isAr, startError, onRetryStart, submitError }) {
  // Defensive: never render an unanswerable question (e.g. T/F with no
  // options left the user stuck, unable to submit). Such items are dropped
  // here AND blocked server-side.
  const validQuiz = (Array.isArray(quiz) ? quiz : []).filter(
    (q) => {
      if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
      if (["essay", "short_answer", "open_ended"].includes(String(q.type || "").toLowerCase())) return true;
      return Array.isArray(q.options) && q.options.length === 4
        && q.options.every((o) => typeof o === "string" && o.trim());
    }
  );
  if (!validQuiz.length) {
    if (state === "idle") {
      return (
        <div className="zeus-glass p-6 text-center">
          <Brain className="text-zeus-gold mx-auto mb-3" style={{ width: 28, height: 28 }} />
          <h3 className="font-heading font-bold text-base mb-1">{isAr ? "جاهز للاختبار؟" : "Ready for the quiz?"}</h3>
          <p className="text-xs text-muted-foreground mb-4">{isAr ? "30 سؤالًا: 25 اختيار من متعدد و5 أسئلة مقالية" : "30 questions: 25 multiple-choice and 5 short-answer"}</p>
          {startError && <p className="text-xs text-destructive mb-3">{startError}</p>}
          <button onClick={onStart} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm text-sm">
            <Brain style={{ width: 16, height: 16 }} /> {isAr ? "ابدأ الاختبار" : "Start Quiz"}
          </button>
        </div>
      );
    }
    // Quiz turned out empty after filtering (stale broken data): honest retry.
    return (
      <div className="zeus-glass p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">{startError || (isAr ? "الاختبار ده فيه مشكلة — هنجهّز واحد سليم" : "This quiz is broken — let's build a fresh one")}</p>
        <button onClick={onRetryStart || onStart} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition text-sm">
          <RotateCcw style={{ width: 16, height: 16 }} /> {isAr ? "جهّز اختبار سليم" : "Build fresh quiz"}
        </button>
      </div>
    );
  }
  const qz = validQuiz;

  if (state === "idle") {
    return (
      <div className="zeus-glass p-6 text-center">
        <Brain className="text-zeus-gold mx-auto mb-3" style={{ width: 28, height: 28 }} />
        <h3 className="font-heading font-bold text-base mb-1">{isAr ? "جاهز للاختبار؟" : "Ready for the quiz?"}</h3>
        <p className="text-xs text-muted-foreground mb-4">{isAr ? "30 سؤالًا: 25 اختيار من متعدد و5 أسئلة مقالية" : "30 questions: 25 multiple-choice and 5 short-answer"}</p>
        {startError && <p className="text-xs text-destructive mb-3">{startError}</p>}
        <button onClick={onStart} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm text-sm">
          <Brain style={{ width: 16, height: 16 }} /> {isAr ? "ابدأ الاختبار" : "Start Quiz"}
        </button>
      </div>
    );
  }

  if (state === "taking") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zeus-brightgold">
          <Brain style={{ width: 13, height: 13 }} /> {isAr ? "الاختبار" : "Quiz"}
        </div>
        {qz.map((q, qi) => (
          <div key={qi} className="zeus-glass p-4">
            <p className="font-medium text-sm mb-3">{qi + 1}. {q.question}</p>
            {["essay", "short_answer", "open_ended"].includes(String(q.type || "").toLowerCase()) ? (
              <textarea
                value={answers[qi] || ""}
                onChange={(event) => setAnswers({ ...answers, [qi]: event.target.value })}
                maxLength={3000}
                rows={5}
                placeholder={isAr ? "اكتب إجابتك بالتفصيل..." : "Write your answer in your own words..."}
                className="w-full rounded-xl border border-border/50 bg-secondary/20 p-3 text-sm outline-none transition focus:border-zeus-gold"
              />
            ) : (
              <div className="space-y-2">
                {(q.options || []).map((opt, oi) => (
                  <button key={oi} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                    className={`w-full text-start p-3 rounded-xl border text-sm transition flex items-center gap-2.5 ${answers[qi] === oi ? "bg-zeus-gold/15 border-zeus-gold/50 text-foreground" : "bg-secondary/20 border-border/40 text-foreground/70 hover:border-zeus-gold/30"}`}>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[10px] font-bold ${answers[qi] === oi ? "border-zeus-gold bg-zeus-gold text-zeus-midnight" : "border-border/60"}`}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
        <button onClick={onSubmit} disabled={qz.some((question, index) => {
          const answer = answers[index];
          return answer === undefined || answer === null || (typeof answer === "string" && !answer.trim());
        })}
          className="w-full py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm disabled:opacity-50 text-sm">
          {isAr ? "سلّم الاختبار" : "Submit Quiz"}
        </button>
      </div>
    );
  }

  // submitted
  return (
    <div className="space-y-3">
      <div className={`zeus-glass p-5 text-center ${result.passed ? "border-zeus-gold/40" : "border-red-500/30"}`}>
        <div className="mx-auto mb-3">
          {result.passed
            ? <img src={ZEUS_IMAGES.celebrate} alt="Celebrate" className="w-20 h-20 rounded-2xl object-cover object-top" onError={withImageFallback} />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500/10"><RotateCcw className="text-red-400" style={{ width: 28, height: 28 }} /></div>}
        </div>
        <h3 className="font-heading font-bold text-lg mb-1">{result.passed ? (isAr ? "عاش! نجحت 🎉" : "Passed! 🎉") : (isAr ? "محتاج مراجعة" : "Needs review")}</h3>
        <p className="text-sm text-muted-foreground">
          {result.earned_points !== undefined
            ? (isAr ? `${result.earned_points} من ${result.total_points} درجة (${result.score}%)` : `${result.earned_points} of ${result.total_points} points (${result.score}%)`)
            : (isAr ? `${result.correct} من ${result.total} صح (${result.score}%)` : `${result.correct} of ${result.total} correct (${result.score}%)`)}
        </p>
      </div>

      {qz.map((q, qi) => {
        const userAnswer = answers[qi];
        const feedback = result.feedback?.find((item) => item.index === qi);
        const isEssay = ["essay", "short_answer", "open_ended"].includes(String(q.type || "").toLowerCase());
        const isCorrect = feedback ? (isEssay ? feedback.earned_points >= 1 : feedback.correct) : userAnswer === q.correct;
        return (
          <div key={qi} className="zeus-glass p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isCorrect ? "bg-zeus-gold/20 text-zeus-gold" : "bg-red-500/15 text-red-400"}`}>
                {isCorrect ? <Check style={{ width: 14, height: 14 }} /> : <X style={{ width: 14, height: 14 }} />}
              </div>
              <p className="font-medium text-sm flex-1">{qi + 1}. {q.question}</p>
            </div>
            <div className="ps-8 space-y-1.5">
              {isEssay ? (
                <>
                  {feedback?.feedback && <p className="text-xs text-muted-foreground">{feedback.feedback}</p>}
                  {feedback?.expected_answer && <p className="text-xs text-zeus-brightgold">{isAr ? "نموذج إجابة: " : "Expected answer: "}{feedback.expected_answer}</p>}
                </>
              ) : (
                <>
                  {!isCorrect && userAnswer !== undefined && (
                    <p className="text-xs text-red-400">{isAr ? "إجابتك: " : "Your answer: "}<span className="line-through">{q.options?.[userAnswer]}</span></p>
                  )}
                  {feedback?.correct_answer && <p className="text-xs text-zeus-brightgold">{isAr ? "الصح: " : "Correct: "}{feedback.correct_answer}</p>}
                  {feedback?.explanation && <p className="text-xs text-muted-foreground mt-1.5">{feedback.explanation}</p>}
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex gap-3">
        {!result.passed && (
          <button onClick={onRetry} className="flex-1 py-3 rounded-full bg-secondary/40 border border-border/60 font-semibold text-sm hover:border-zeus-gold/30 transition flex items-center justify-center gap-2">
            <RotateCcw style={{ width: 16, height: 16 }} /> {isAr ? "حاول تاني" : "Retry"}
          </button>
        )}
        {result.passed && hasNext && (
          <button onClick={onNext} className="flex-1 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm text-sm flex items-center justify-center gap-2">
            {isAr ? "الدرس التالي" : "Next Lesson"} <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        )}
        {result.passed && !hasNext && (
          <div className="flex-1 py-3 rounded-full bg-zeus-gold/15 text-zeus-brightgold font-semibold text-sm text-center">{isAr ? "خلّصت كل الدروس! 🏆" : "All lessons done! 🏆"}</div>
        )}
      </div>
    </div>
  );
}