import { useEffect, useState } from "react";
import { Loader2, RotateCw, Save, Sparkles, Youtube } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

const TASKS = [
  ["discovery", "تحليل الشخصية والأسئلة", "Learner discovery"],
  ["planning", "إنشاء خريطة التعلم", "Roadmap generation"],
  ["tutor", "شرح الدروس", "Lesson tutor"],
  ["companion", "شات رفيق التعلم", "Learning companion chat"],
  ["review", "مراجعة المحتوى", "Content review"],
  ["quiz", "إنشاء الاختبارات", "Quiz generation"],
  ["assessment", "تقييم الإجابات", "Answer assessment"],
  ["recommend", "اقتراح الأهداف", "Goal recommendations"],
  ["rewrite", "إعادة صياغة المحتوى", "Content rewriting"],
  ["jobs", "البحث عن الوظائف", "Job search"],
];
const PROVIDERS = [
  ["openai", "OpenAI"],
  ["gemini", "Google Gemini"],
  ["groq", "Groq"],
];
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-3.8-flash",
  groq: "openai/gpt-oss-20b",
};

function blankSlot(provider = "groq") {
  return { provider, model: DEFAULT_MODELS[provider], api_key: "", configured: false, key_hint: "", clear_key: false };
}

function editableSlot(slot, fallbackProvider = "groq") {
  return { ...blankSlot(slot?.provider || fallbackProvider), ...slot, api_key: "", clear_key: false };
}

function normalizeConfig(config) {
  const tasks = {};
  for (const [task] of TASKS) {
    const saved = config?.tasks?.[task] || [];
    tasks[task] = Array.from({ length: 4 }, (_, index) => editableSlot(saved[index], "groq"));
  }
  const reviewer = Array.from({ length: 2 }, (_, index) => editableSlot(config?.reviewer?.[index], "groq"));
  const youtube_keys = Array.from({ length: 4 }, (_, index) => ({
    api_key: "",
    configured: Boolean(config?.youtube_keys?.[index]?.configured),
    key_hint: config?.youtube_keys?.[index]?.key_hint || "",
    clear_key: false,
  }));
  return { tasks, reviewer, youtube_keys };
}

export default function AdminAISettings() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testState, setTestState] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.admin.get("/settings/ai-status");
      setConfig(normalizeConfig(result.ai_config));
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل إعدادات الذكاء الاصطناعي." : "Could not load AI settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateSlot = (group, task, index, patch) => {
    setConfig((current) => {
      if (group === "reviewer") {
        const reviewer = [...current.reviewer];
        reviewer[index] = { ...reviewer[index], ...patch };
        return { ...current, reviewer };
      }
      const slots = [...current.tasks[task]];
      slots[index] = { ...slots[index], ...patch };
      return { ...current, tasks: { ...current.tasks, [task]: slots } };
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.admin.put("/settings/ai-config", config);
      setNotice(isAr ? "تم حفظ إعدادات المهام والمراجع وYouTube." : "Task, reviewer, and YouTube settings saved.");
      await load();
    } catch (saveError) {
      setError(saveError.message || (isAr ? "تعذر حفظ الإعدادات." : "Could not save settings."));
    } finally {
      setSaving(false);
    }
  };

  const testSlot = async (slot, key, keyIndex, keyGroup, task) => {
    const id = `${keyGroup}:${task || ""}:${keyIndex}`;
    setTestState((current) => ({ ...current, [id]: { loading: true } }));
    try {
      const result = await api.admin.post("/settings/test-provider", {
        provider: slot.provider,
        model: slot.model,
        language: isAr ? "ar" : "en",
        ...(slot.api_key.trim()
          ? { api_key: slot.api_key.trim() }
          : keyGroup === "reviewer"
            ? { reviewer_slot: keyIndex }
            : { task, slot_index: keyIndex }),
      });
      setTestState((current) => ({ ...current, [id]: result }));
    } catch (testError) {
      setTestState((current) => ({
        ...current,
        [id]: { success: false, message: testError.message || (isAr ? "فشل الاختبار." : "Test failed.") },
      }));
    }
  };

  const updateYoutube = (index, patch) => setConfig((current) => {
    const youtube_keys = [...current.youtube_keys];
    youtube_keys[index] = { ...youtube_keys[index], ...patch };
    return { ...current, youtube_keys };
  });

  const renderProviderSlot = (slot, { group, task = "", index, title }) => {
    const resultKey = `${group}:${task}:${index}`;
    const result = testState[resultKey];
    return (
      <div key={resultKey} className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold">{title}</h4>
          <span className={`text-[10px] ${slot.configured && !slot.clear_key ? "text-emerald-400" : "text-muted-foreground"}`}>
            {slot.clear_key
              ? (isAr ? "سيُحذف المفتاح" : "Key will be cleared")
              : slot.configured
                ? (isAr ? `مفتاح محفوظ ${slot.key_hint}` : `Key saved ${slot.key_hint}`)
                : (isAr ? "غير مضبوط" : "Not configured")}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={slot.provider}
            onChange={(event) => {
              const provider = event.target.value;
              updateSlot(group, task, index, {
                provider,
                model: DEFAULT_MODELS[provider],
                configured: false,
                key_hint: "",
                clear_key: false,
              });
            }}
            aria-label={`${title} provider`}
            className="min-w-0 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs"
          >
            {PROVIDERS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <input
            value={slot.model}
            maxLength={120}
            onChange={(event) => updateSlot(group, task, index, { model: event.target.value })}
            aria-label={`${title} model`}
            placeholder={isAr ? "اسم الموديل" : "Model name"}
            className="min-w-0 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs font-mono"
          />
        </div>
        <input
          type="password"
          autoComplete="new-password"
          value={slot.api_key}
          onChange={(event) => updateSlot(group, task, index, { api_key: event.target.value, clear_key: false })}
          placeholder={slot.configured ? (isAr ? "اتركه فارغًا للإبقاء على المفتاح المحفوظ" : "Leave blank to keep saved key") : (isAr ? "مفتاح API لهذه الخانة" : "API key for this slot")}
          className="w-full rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs font-mono"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => testSlot(slot, null, index, group, task)}
            disabled={!slot.model.trim() || (!slot.api_key.trim() && !slot.configured) || result?.loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50">
            {result?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
            {isAr ? "اختبار" : "Test"}
          </button>
          {slot.configured && (
            <button type="button" onClick={() => updateSlot(group, task, index, { clear_key: !slot.clear_key })}
              className="text-[11px] text-rose-400 hover:underline">
              {slot.clear_key ? (isAr ? "إلغاء حذف المفتاح" : "Keep key") : (isAr ? "حذف المفتاح" : "Clear key")}
            </button>
          )}
          {result && !result.loading && <span className={`text-[11px] ${result.success ? "text-emerald-400" : "text-rose-400"}`}>{result.message}</span>}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div dir={dir} className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zeus-gold" /></div>;
  }
  if (!config) {
    return <div dir={dir} className="space-y-3"><p role="alert" className="text-sm text-rose-400">{error}</p><button type="button" onClick={load} className="rounded-lg border px-3 py-2 text-sm">{isAr ? "إعادة المحاولة" : "Retry"}</button></div>;
  }

  return (
    <form dir={dir} onSubmit={save} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-zeus-gold" />{isAr ? "إعدادات الذكاء الاصطناعي وYouTube" : "AI & YouTube settings"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr ? "لكل مهمة أساسي و3 احتياطيين. يبدأ النظام من خانة مختلفة بالتناوب، ويجرّب الباقي عند الضغط أو التعطل." : "Each task has a primary and three backups. Requests rotate their starting slot and fall back when a provider is busy or unavailable."}
          </p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</p>}

      <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold"><Sparkles className="h-4 w-4 text-zeus-gold" />{isAr ? "توجيه مهام الذكاء الاصطناعي" : "AI task routing"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "كل خانة لها مزوّد وموديل ومفتاح مستقل. الخانات غير المكتملة يتم تجاوزها." : "Each slot has its own provider, model, and API key. Incomplete slots are skipped."}</p>
        </div>
        {TASKS.map(([task, ar, en]) => (
          <details key={task} open={["discovery", "planning", "tutor", "companion"].includes(task)}
            className="group rounded-xl border border-border/50 bg-secondary/10 p-3">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              <span className="flex items-center justify-between gap-3">
                <span>{isAr ? ar : en}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{isAr ? "أساسي + 3 احتياطي" : "Primary + 3 backups"}</span>
              </span>
            </summary>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {(config.tasks[task] || []).map((slot, index) => renderProviderSlot(slot, {
                group: "task",
                task,
                index,
                title: isAr ? (index === 0 ? "الأساسي" : `احتياطي ${index}`) : (index === 0 ? "Primary" : `Backup ${index}`),
              }))}
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-card p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold">{isAr ? "المراجع الإلزامي المستقل" : "Mandatory independent reviewer"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "يراجع ويصحح خريطة التعلم والدروس والوظائف والمحتوى قبل إرجاعها. أضف مفتاحًا أساسيًا وآخر احتياطيًا." : "Reviews and corrects roadmaps, lessons, jobs, and content before returning them. Configure a primary and a backup key."}</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {config.reviewer.map((slot, index) => renderProviderSlot(slot, {
            group: "reviewer",
            index,
            title: isAr ? (index === 0 ? "مراجع أساسي" : "مراجع احتياطي") : (index === 0 ? "Primary reviewer" : "Reviewer backup"),
          }))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold"><Youtube className="h-4 w-4 text-rose-400" />{isAr ? "مفاتيح YouTube Data API v3" : "YouTube Data API v3 keys"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isAr ? "المصادر والفيديوهات تُجلب من YouTube، مع التبديل بين المفاتيح عند انتهاء الحصة أو تعطل المفتاح." : "Learning videos are fetched from YouTube; keys rotate when quota is exhausted or a key fails."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.youtube_keys.map((slot, index) => (
            <label key={index} className="space-y-1.5 rounded-xl border border-border/50 bg-secondary/10 p-3 text-xs font-semibold">
              <span className="flex items-center justify-between gap-2">
                <span>{isAr ? (index === 0 ? "مفتاح أساسي" : `مفتاح احتياطي ${index}`) : (index === 0 ? "Primary key" : `Backup key ${index}`)}</span>
                <span className={slot.configured && !slot.clear_key ? "text-emerald-400" : "text-muted-foreground"}>
                  {slot.clear_key ? (isAr ? "سيُحذف" : "Will be cleared") : slot.configured ? `${isAr ? "محفوظ" : "Saved"} ${slot.key_hint}` : (isAr ? "غير مضبوط" : "Not configured")}
                </span>
              </span>
              <input type="password" autoComplete="new-password" value={slot.api_key}
                onChange={(event) => updateYoutube(index, { api_key: event.target.value, clear_key: false })}
                placeholder={slot.configured ? (isAr ? "اتركه فارغًا للإبقاء على المفتاح" : "Leave blank to keep saved key") : "AIza..."}
                className="w-full rounded-lg border border-border/60 bg-card px-2.5 py-2 font-mono font-normal" />
              {slot.configured && <button type="button" onClick={() => updateYoutube(index, { clear_key: !slot.clear_key })}
                className="text-[11px] text-rose-400 hover:underline">{slot.clear_key ? (isAr ? "إلغاء الحذف" : "Keep key") : (isAr ? "حذف المفتاح" : "Clear key")}</button>}
            </label>
          ))}
        </div>
      </section>

      <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-zeus-gold px-6 py-3 text-sm font-bold text-zeus-midnight disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {isAr ? "حفظ إعدادات الذكاء الاصطناعي وYouTube" : "Save AI & YouTube settings"}
      </button>
    </form>
  );
}
