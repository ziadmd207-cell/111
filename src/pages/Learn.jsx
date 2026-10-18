import React, { useState, useEffect } from "react";
import { Check, Clock, Loader2, Circle, CheckCircle2, Video, BookOpen, Code, PenTool, ClipboardCheck, Download, ListTodo } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Learn() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const load = async () => {
    const tk = await api.entities.Task.filter({}, "order", 100);
    setTasks(tk);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (task) => {
    setUpdating(task.id);
    const done = task.status !== "done";
    const patch = { status: done ? "done" : "todo" };
    if (done) patch.completed_date = new Date().toISOString().slice(0, 10);
    const updated = await api.entities.Task.update(task.id, patch);
    setTasks((p) => p.map((x) => (x.id === task.id ? updated : x)));
    if (done) {
      await api.entities.Notification.create({
        type: "encouragement",
        title: isAr ? "أحسنت! 🎉" : "Well done! 🎉",
        body: isAr ? `خلّصت "${task.title}". استمر!` : `You completed "${task.title}". Keep going!`
      });
    }
    setUpdating(null);
  };

  const todo = tasks.filter((x) => x.status !== "done");
  const done = tasks.filter((x) => x.status === "done");

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("learn.title")}</h1>
        <p className="text-muted-foreground mt-1">{isAr ? `${todo.length} مهام مستنية، ${done.length} مخلّصة` : `${todo.length} pending, ${done.length} done`}</p>
      </div>

      <Section title={isAr ? "للنهارده" : "Today"} tasks={todo} onToggle={toggle} updating={updating} isAr={isAr} accent />
      <Section title={isAr ? "مخلّصة" : "Completed"} tasks={done} onToggle={toggle} updating={updating} isAr={isAr} />
    </div>
  );
}

function Section({ title, tasks, onToggle, updating, isAr, accent }) {
  if (!tasks.length) return null;
  return (
    <div>
      <h2 className={`text-sm font-semibold mb-3 ${accent ? "text-zeus-brightgold" : "text-muted-foreground"}`}>{title}</h2>
      <div className="space-y-2.5">
        {tasks.map((task) => (
          <div key={task.id} className="zeus-glass p-4 flex items-center gap-3 hover:zeus-gold-border transition">
            <button onClick={() => onToggle(task)} disabled={updating === task.id}
              className="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition"
              style={{ borderColor: task.status === "done" ? "#FFC107" : "rgba(148,163,184,0.4)", background: task.status === "done" ? "#FFC107" : "transparent" }}>
              {updating === task.id ? <Loader2 className="animate-spin text-white" style={{ width: 14, height: 14 }} />
                : task.status === "done" ? <Check className="text-white" style={{ width: 16, height: 16 }} /> : <Circle className="text-transparent" style={{ width: 16, height: 16 }} />}
            </button>
            <div className="shrink-0 w-9 h-9 rounded-lg bg-zeus-gold/10 flex items-center justify-center">
              {(() => { const TIcon = taskIcon(task.title); return <TIcon className="text-zeus-gold" style={{ width: 16, height: 16 }} />; })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>{task.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{task.node_title}</span>
                <span className="flex items-center gap-1"><Clock style={{ width: 11, height: 11 }} /> {task.estimated_minutes || 45} {isAr ? "د" : "min"}</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary/50">{task.difficulty}</span>
              </div>
            </div>
            {task.status === "done" && <CheckCircle2 className="text-zeus-gold" style={{ width: 18, height: 18 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function taskIcon(title) {
  const t = (title || "").toLowerCase();
  if (/(شاهد|فيديو|watch|video|tutorial|شرح)/.test(t)) return Video;
  if (/(اقرأ|قراء|كتاب|مقال|read|article|doc|وثيق)/.test(t)) return BookOpen;
  if (/(ابن|مشروع|طبّق|كود|code|build|project|implement|اكتب)/.test(t)) return Code;
  if (/(تدرب|تمرين|practice|exercise|solve|حل)/.test(t)) return PenTool;
  if (/(اختبار|تست|quiz|test|امتحان)/.test(t)) return ClipboardCheck;
  if (/(تثبيت|سطّب|install|setup|إعداد)/.test(t)) return Download;
  return ListTodo;
}