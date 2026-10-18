import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Map, Target, Gauge, ArrowLeft, ArrowRight, Check, Loader2, GitCompare } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import Logo from "@/components/zeus/Logo";
import LanguageToggle from "@/components/zeus/LanguageToggle";
import ThemeToggle from "@/components/zeus/ThemeToggle";
import ChatPanel from "@/components/zeus/ChatPanel";
import DnaSummary from "@/components/zeus/onboarding/DnaSummary";
import RoadmapReveal from "@/components/zeus/onboarding/RoadmapReveal";
import { toast } from "@/components/ui/use-toast";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

const STEPS = [
  { key: "discovery", icon: Brain, labelKey: "onb.discover.title" },
  { key: "dna", icon: Brain, labelKey: "onb.dna.title" },
  { key: "goal", icon: Target, labelKey: "onb.goal.title" },
  { key: "assessment", icon: Gauge, labelKey: "onb.assess.title" },
  { key: "roadmap", icon: Map, labelKey: "onb.roadmap.title" }
];

const welcomeMessage = (isAr) =>
  isAr
    ? "أهلاً، أنا زيوس ☺️⚡️ احكيلي: محتار بين إيه، أو نفسك تتعلم إيه وتوصل لإيه؟"
    : "Hello, I'm ZEUS ☺️⚡️ Tell me: what are you unsure about, or what would you like to learn and achieve?";

export default function Onboarding() {
  const { t, lang, dir } = useI18n();
  const { profile, loading, createProfile, updateProfile } = useProfile();
  const nav = useNavigate();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [step, setStep] = useState("discovery");
  const [companionName] = useState("Zeus");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [recs, setRecs] = useState(null);
  const [keySkills, setKeySkills] = useState([]);
  const [skillLevels, setSkillLevels] = useState({});
  const [roadmapPreview, setRoadmapPreview] = useState(null);
  const [skillsText, setSkillsText] = useState("");
  const [fieldComparison, setFieldComparison] = useState(null);
  const [building, setBuilding] = useState(false);
  const [bootError, setBootError] = useState(false);

  // The companion is always Zeus — no naming step. First visit auto-creates
  // the profile and starts the discovery chat immediately.
  const startedRef = React.useRef(false);
  const initializedConversationProfileRef = React.useRef(null);
  const loadingConversationProfileRef = React.useRef(null);
  useEffect(() => {
    if (loading) return;
    // Fresh account: create profile + first conversation in one go
    if (!profile) {
      (async () => {
        if (startedRef.current) return;
        startedRef.current = true;
        try {
          const p = await createProfile({ companion_name: "Zeus", onboarding_step: "discovery" });
          if (!p) throw new Error("profile");
          loadingConversationProfileRef.current = p.id;
          const convo = await api.entities.Conversation.create({
            type: "discovery", companion_name: "Zeus",
            messages: [{ role: "assistant", content: welcomeMessage(isAr), ts: new Date().toISOString() }]
          });
          initializedConversationProfileRef.current = p.id;
          setConversation(convo);
          setMessages(convo.messages);
          setStep("discovery");
        } catch {
          // Never leave a blank screen: surface the failure with a retry.
          startedRef.current = false;
          loadingConversationProfileRef.current = null;
          setBootError(true);
        } finally {
          loadingConversationProfileRef.current = null;
        }
      })();
      return;
    }
    // Legacy "naming" step or custom names migrate to fixed "Zeus"
    let s = profile.onboarding_step || "discovery";
    if (s === "naming") s = "discovery";
    setStep(s);
    setBootError(false);
    if (profile.onboarding_step === "done") { nav("/app", { replace: true }); return; }
    if (profile.companion_name !== "Zeus") {
      updateProfile({ companion_name: "Zeus" }).catch(() => {});
    }
    if (s === "discovery" && initializedConversationProfileRef.current !== profile.id
      && loadingConversationProfileRef.current !== profile.id) {
      loadingConversationProfileRef.current = profile.id;
      (async () => {
        try {
          const existing = await api.entities.Conversation.filter({ type: "discovery" }, "-created_date", 1);
          const convo = existing[0] || await api.entities.Conversation.create({
            type: "discovery", companion_name: "Zeus",
            messages: [{ role: "assistant", content: welcomeMessage(isAr), ts: new Date().toISOString() }]
          });
          initializedConversationProfileRef.current = profile.id;
          setConversation(convo);
          setMessages(convo.messages || []);
          setBootError(false);
        } catch (error) {
          console.error("Failed to initialize discovery conversation:", error);
          setBootError(true);
        } finally {
          loadingConversationProfileRef.current = null;
        }
      })();
    }
  }, [profile?.id, profile?.onboarding_step, loading, nav]);

  const goto = async (nextStep, patch = {}) => {
    if (profile) await updateProfile({ onboarding_step: nextStep, ...patch });
    setStep(nextStep);
  };

  const skipToDashboard = async () => {
    if (profile) await updateProfile({ onboarding_step: "done" });
    nav("/app", { replace: true });
  };

  // ---------- Discovery (interactive choices, no repeat, auto-advance) ----------
  const inFlightRef = React.useRef(false);
  const sendDiscovery = async (text, retry = false) => {
    if (inFlightRef.current || typing) return;
    inFlightRef.current = true;
    const userMsg = { role: "user", content: text, ts: new Date().toISOString() };
    const history = retry ? messages.filter((message) => !message.retryable) : messages;
    const next = retry ? history : [...history, userMsg];
    setMessages(next);
    setChatBusy(true);
    setTyping(true);
    try {
      const res = await api.functions.invoke("discoveryChat", {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        profile: profile, companionName: companionName, lang
      }, { timeoutMs: 65000 });
      const data = res.data || res;
      // Incremental DNA: accumulate profile EVERY turn — even when the reply
      // itself failed — so no answer is ever lost or re-asked.
      const persistDiscoveryProfile = async (patch) => {
        if (patch && typeof patch === "object") {
          const reserved = new Set(["id", "user_id", "onboarding_step", "status", "created_date", "updated_date"]);
          const inc = Object.fromEntries(
            Object.entries(patch).filter(([k, v]) => !reserved.has(k) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
          );
          if (Object.keys(inc).length) await updateProfile(inc);
        }
      };
      if (data.credit_exhausted) {
        // Show both chat message and toast as requested
        const msg = data.reply || "عذراً يا صاحبي، رصيد الـ AI خلص حالياً، جرّب بعد الشحن 💳";
        const aiMsg = { role: "assistant", content: msg, ts: new Date().toISOString() };
        const updated = [...next, aiMsg];
        setMessages(updated);
        try {
          await api.entities.Conversation.update(conversation.id, { messages: updated });
        } catch (error) {
          console.error("Failed to save discovery conversation:", error);
        }
        toast({ title: "رصيد الـ AI انتهى", description: msg, variant: "destructive" });
        return;
      }
      // Never render an empty assistant bubble (looks like the AI ignored you).
      // Still persist the user's answer + any profile patch first.
      const replyText = (data.reply || "").trim();
      if (!replyText) {
        const withUserOnly = [...next];
        const errorMessage = data.error === "openai_not_configured"
          ? (isAr ? "المساعد مش متوصل بمفتاح OpenAI. راجع إعدادات الذكاء الاصطناعي في لوحة الأدمن." : "The assistant is not connected to an OpenAI key. Check the AI settings in Admin.")
          : data.error === "openai_unavailable" || data.error === "temporary"
            ? (isAr ? "في مشكلة اتصال مؤقتة بالمساعد. جرّب تاني بعد لحظة." : "The assistant is temporarily unavailable. Please retry in a moment.")
            : (isAr ? "عطل بسيط في المحادثة، دوس إعادة المحاولة 🔄" : "Chat hiccup — hit retry 🔄");
        setMessages([...withUserOnly, { role: "assistant", content: errorMessage, ts: new Date().toISOString(), retryable: true }]);
        setTyping(false);
        try {
          await persistDiscoveryProfile(data.profile);
          await api.entities.Conversation.update(conversation.id, { messages: withUserOnly });
        } catch (error) {
          console.error("Failed to save discovery response:", error);
        }
        return;
      }
      const aiMsg = { role: "assistant", content: replyText, ts: new Date().toISOString() };
      const updated = [...next, aiMsg];
      setMessages(updated);
      setFieldComparison(Array.isArray(data.field_comparison) && data.field_comparison.length ? data.field_comparison : null);
      setTyping(false);
      try {
        await api.entities.Conversation.update(conversation.id, { messages: updated });
      } catch (error) {
        console.error("Failed to save discovery conversation:", error);
      }
      // Incremental DNA: accumulate profile every turn so nothing is lost
      // even if the final response patch is sparse.
      try {
        await persistDiscoveryProfile(data.profile);
        const low = text.toLowerCase();
        if (low.includes("مجان") || low.includes("free") || low.includes("يوتيوب فقط")) {
          await updateProfile({ video_preference: "free" });
        } else if (low.includes("مختلط") || low.includes("mixed") || low.includes("udemy") || low.includes("مدفوع")) {
          await updateProfile({ video_preference: "mixed" });
        }
      } catch (error) {
        console.error("Failed to save discovery profile:", error);
        toast({ title: isAr ? "تعذر حفظ بعض بياناتك" : "Some profile details could not be saved", description: isAr ? "رد المحادثة محفوظ على الشاشة؛ حاول تحديث الصفحة لاحقًا." : "Your chat reply is still visible; try refreshing later.", variant: "destructive" });
      }
      if (data.isComplete && data.profile) {
        const clean = Object.fromEntries(Object.entries(data.profile).filter(([, v]) => v !== null && v !== undefined && v !== ""));
        // Preserve video_preference if LLM returned it, else keep existing
        try {
          await updateProfile({ ...clean, onboarding_step: "dna" });
        } catch (error) {
          console.error("Failed to save completed discovery profile:", error);
          toast({ title: isAr ? "تعذر حفظ التحليل" : "Could not save your analysis", variant: "destructive" });
        }
        setStep("dna");
      }
    } catch (e) {
      const timedOut = /timed out|timeout|abort/i.test(e?.message || "");
      const errorMessage = timedOut
        ? (isAr ? "الرد اتأخر عن المعتاد. إجابتك لسه موجودة؛ دوس إعادة المحاولة." : "The reply took too long. Your message is still here; retry.")
        : (isAr ? "حصلت مشكلة اتصال بالمحادثة. إجابتك لسه موجودة؛ دوس إعادة المحاولة." : "The chat connection failed. Your message is still here; retry.");
      setMessages([...next.filter((message) => !message.retryable), { role: "assistant", content: errorMessage, ts: new Date().toISOString(), retryable: true }]);
      try {
        await api.entities.Conversation.update(conversation.id, { messages: next.filter((message) => !message.retryable) });
      } catch (saveError) {
        console.error("Failed to save discovery user message:", saveError);
      }
    } finally {
      setTyping(false);
      setChatBusy(false);
      inFlightRef.current = false;
    }
  };

  // ---------- Goal (skills now per-goal, not aggregated) ----------
  const [goalsError, setGoalsError] = useState(false);
  const loadGoals = useCallback(async (force = false) => {
    if ((recs && !force) || !profile) return;
    if (force) { setRecs(null); setGoalsError(false); }
    setTyping(true);
    try {
      const res = await api.functions.invoke("recommendGoals", { profile, goal: profile.goal, lang });
      const data = res.data || res;
      if (data.credit_exhausted) {
        setGoalsError(true);
      } else if (data.error || !Array.isArray(data.recommendations) || data.recommendations.length < 2) {
        // Never show an empty goals screen — backend retries 3x, this is the last resort
        setGoalsError(true);
      } else {
        setRecs(data);
        setGoalsError(false);
      }
      // Do not set keySkills here - wait for per-goal pick
    } catch (e) {
      setGoalsError(true);
    } finally {
      setTyping(false);
    }
  }, [profile, recs, lang]);

  useEffect(() => { if (step === "goal") loadGoals(); }, [step, loadGoals]);

  const pickGoal = async (goal) => {
    // Use per-goal key_skills (fixes Backend showing HTML/CSS).
    // Guarantee: assessment NEVER opens with zero sliders.
    setTyping(true);
    let skillsForGoal = [];
    const matched = recs?.recommendations?.find((r) => r.goal === goal);
    if (matched?.key_skills?.length) {
      skillsForGoal = matched.key_skills;
    } else if (matched?.tools?.length) {
      skillsForGoal = matched.tools.slice(0, 6);
    } else if (Array.isArray(profile?.target_skills) && profile.target_skills.length) {
      skillsForGoal = profile.target_skills.slice(0, 8);
    } else {
      skillsForGoal = [goal];
    }
    setTyping(false);
    if (!skillsForGoal.length) {
      // Last resort stays on the goal step with an error instead of an
      // empty, broken assessment screen.
      setGoalsError(true);
      return;
    }
    setKeySkills(skillsForGoal);
    await updateProfile({ goal, goal_recommendations: recs?.recommendations || [], onboarding_step: "assessment" });
    setStep("assessment");
  };

  // ---------- Assessment ----------
  // If user said "starting from zero" / beginner: core skills start at zero,
  // never ask for self-rated percentages. Quiz assessment replaces sliders.
  const isBeginnerProfile = (() => {
    const lvl = String(profile?.current_level || "").toLowerCase();
    const exp = `${profile?.experience || ""} ${skillsText || ""}`.toLowerCase();
    return lvl.includes("begin") || /مبتدئ|مبتدي|مبتدئة|مبتديه/.test(lvl) || /from zero|starting from zero|no experience|معنديش|من الصفر|صفر/.test(exp + " " + lvl);
  })();
  const submitSkills = async (blendedLevels) => {
    // Non-beginners must pass the mandatory mini-quiz: blended levels
    // (40% self-rating + 60% quiz score) replace raw self-ratings.
    const lv = blendedLevels || skillLevels;
    const graph = isBeginnerProfile
      ? keySkills.map((s) => ({ skill: s, level: 0 }))
      : keySkills.map((s) => ({ skill: s, level: lv[s] ?? 50 }));
    const profileUpdate = { skill_graph: graph, onboarding_step: "roadmap" };
    if (skillsText.trim()) profileUpdate.strengths = skillsText.trim();
    await updateProfile(profileUpdate);
    setStep("roadmap");
  };

  // ---------- Roadmap ----------
  const [roadmapError, setRoadmapError] = useState(false);
  const [roadmapErrorMessage, setRoadmapErrorMessage] = useState("");
  const loadRoadmap = useCallback(async (force = false) => {
    if ((roadmapPreview && !force) || !profile) return;
    if (force) { setRoadmapPreview(null); setRoadmapError(false); setRoadmapErrorMessage(""); }
    setTyping(true);
    try {
      const res = await api.functions.invoke(
        "generateRoadmap",
        { profile, goal: profile.goal, lang },
        { timeoutMs: 300000 }
      );
      const data = res.data || res;
      // Never accept an error/empty payload as a "roadmap" — that produced
      // the infamous all-zeros screen and empty schedules.
      if (data && Array.isArray(data.nodes) && data.nodes.length >= 3) {
        setRoadmapPreview(data);
        setRoadmapError(false);
        setRoadmapErrorMessage("");
      } else {
        setRoadmapError(true);
        const errors = {
          openai_not_configured: isAr ? "توليد الخريطة محتاج مفتاح OpenAI. ضيفه أو فعّله من إعدادات الذكاء الاصطناعي في لوحة الأدمن." : "Roadmap generation requires an OpenAI key. Add or enable it in Admin AI settings.",
          openai_unavailable: isAr ? "تعذر الاتصال بـ OpenAI. راجع إعداداته واتصال الخادم وحاول تاني." : "Could not reach OpenAI. Check its settings and server connectivity, then retry.",
          openai_request_failed: isAr ? "OpenAI رفض طلب الخريطة. راجع اسم الموديل ومفتاح OpenAI في لوحة الأدمن." : "OpenAI rejected the roadmap request. Check the model name and API key in Admin.",
          openai_auth_failed: isAr ? "مفتاح OpenAI المحفوظ غير مقبول. تأكد من المفتاح في إعدادات الذكاء الاصطناعي." : "The saved OpenAI key was rejected. Check the key in Admin AI settings.",
          openai_rate_limited: isAr ? "وصلت طلبات OpenAI إلى الحد المؤقت. انتظر قليلًا ثم أعد المحاولة." : "OpenAI rate limit reached. Wait briefly, then retry.",
          openai_model_unavailable: isAr ? "موديل OpenAI المحدد غير متاح لهذا المفتاح. غيّر الموديل من إعدادات الأدمن." : "The selected OpenAI model is unavailable for this key. Change it in Admin settings.",
          openai_timeout: isAr ? "استغرق رد OpenAI وقتًا أطول من المتوقع. أعد المحاولة بعد قليل." : "OpenAI took too long to respond. Please retry shortly.",
          openai_invalid_response: isAr ? "وصل رد غير مكتمل من OpenAI؛ الخريطة الناقصة ما اتحفظتش. جرّب تاني." : "OpenAI returned an incomplete roadmap; it was not saved. Please retry.",
          incomplete_roadmap: isAr ? "الخريطة ناقصها أجزاء أساسية؛ ما اتحفظتش. جرّب إعادة التوليد." : "The roadmap is missing required sections and was not saved. Please regenerate it.",
          credit_exhausted: isAr ? "رصيد OpenAI غير كافٍ لتوليد الخريطة. راجع الرصيد والفوترة في حساب OpenAI ثم حاول مرة أخرى." : "Your OpenAI account has insufficient credit to generate the roadmap. Check billing and try again.",
        };
        setRoadmapErrorMessage(
          data?.credit_exhausted
            ? errors.credit_exhausted
            : errors[data?.error] || data?.reply || (isAr ? "تعذر توليد الخريطة. جرّب تاني." : "Could not generate the roadmap. Please retry.")
        );
      }
    } catch (e) {
      setRoadmapError(true);
      const timedOut = /timed out|timeout|abort/i.test(e?.message || "");
      setRoadmapErrorMessage(timedOut
        ? (isAr ? "استغرق توليد الخريطة وقتًا أطول من المتوقع. جرّب مرة أخرى." : "Roadmap generation took longer than expected. Please retry.")
        : (isAr ? "حصل خطأ في الاتصال بالخادم أثناء توليد الخريطة. حاول تاني." : "The server connection failed while generating the roadmap. Please retry."));
    } finally {
      setTyping(false);
    }
  }, [profile, roadmapPreview, lang]);

  useEffect(() => { if (step === "roadmap") loadRoadmap(); }, [step, loadRoadmap]);

  const buildRoadmap = async () => {
    const nodes = roadmapPreview?.nodes || [];
    // Guard: never persist an empty roadmap (would create an empty product).
    if (!nodes.length) { setRoadmapError(true); return; }
    setBuilding(true);
    try {
      const roadmap = await api.entities.Roadmap.create({ goal: profile.goal, version: 1, status: "active", nodes });
      // Mirror every node task as a trackable Task (ALL phases) so
      // Progress/Home reflect real lesson completion as lessons pass.
      const tasks = [];
      nodes.forEach((node) => {
        (node.tasks || []).forEach((taskTitle, i) => {
          tasks.push({ title: taskTitle, node_id: node.id, node_title: node.title, status: "todo", estimated_minutes: Math.round((node.estimated_hours || 4) * 60 / Math.max(1, (node.tasks || []).length)), difficulty: "medium", order: tasks.length });
        });
      });
      if (tasks.length) await api.entities.Task.bulkCreate(tasks);
      // Generate study schedule
      await api.functions.invoke("generateSchedule", { roadmapId: roadmap.id, availableDays: profile.available_days || [], lang });
      // welcome notification
      await api.entities.Notification.create({
        type: "ai", title: isAr ? "خريطتك جاهزة! 🎉" : "Your roadmap is ready! 🎉",
        body: isAr ? `بدأنا رحلتك نحو "${profile.goal}". أول مهامك مستنية في تبويب تعلّم.` : `Your journey toward "${profile.goal}" started. Your first tasks are waiting in Learn.`,
        action_label: isAr ? "ابدأ" : "Start", action_url: "/learn"
      });
      await updateProfile({ onboarding_step: "done" });
      nav("/app", { replace: true });
    } catch (e) {
      toast({
        title: isAr ? "تعذر حفظ الخريطة" : "Could not save the roadmap",
        description: isAr ? "خريطتك لسه معروضة؛ حصل خطأ أثناء حفظها أو تجهيز جدولها. حاول تاني." : "Your roadmap is still shown, but saving it or preparing the schedule failed. Please retry.",
        variant: "destructive",
      });
    } finally {
      setBuilding(false);
    }
  };

  if (loading) {
    return <div className="fixed inset-0 flex items-center justify-center"><div className="w-9 h-9 border-4 border-zeus-gold/30 border-t-zeus-gold rounded-full animate-spin" /></div>;
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" dir={dir}>
      <header className="h-16 border-b border-border/40 bg-background/70 backdrop-blur-xl flex items-center justify-between px-5">
        <span className="onboarding-logo flex h-11 items-center rounded-xl px-3">
          <Logo size={30} />
        </span>
        <div className="flex items-center gap-3">
          <button onClick={skipToDashboard} className="text-xs text-muted-foreground hover:text-zeus-brightgold transition px-3 py-1.5 rounded-full border border-border/40 hover:border-zeus-gold/40">
            {isAr ? "تخطّي للوحة التحكم" : "Skip to dashboard"}
          </button>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Step indicator */}
      <div className="px-5 py-4 border-b border-border/40">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    active ? "bg-zeus-gold text-zeus-midnight shadow-gold scale-110" : done ? "bg-zeus-gold/20 text-zeus-brightgold" : "bg-secondary/50 text-muted-foreground"
                  }`}>
                    {done ? <Check style={{ width: 16, height: 16 }} /> : <Icon style={{ width: 16, height: 16 }} />}
                  </div>
                  <span className={`text-[10px] hidden sm:block ${active ? "text-zeus-brightgold font-medium" : "text-muted-foreground"}`}>{t(s.labelKey)}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < stepIndex ? "bg-zeus-gold/40" : "bg-border/60"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-2xl">
          {step === "discovery" && bootError && !conversation && (
            <div className="zeus-glass p-8 text-center animate-fade-up">
              <p className="text-muted-foreground mb-4 text-sm">{isAr ? "مقدرتش أبدأ المحادثة. اتأكد إن السيرفر شغال وحاول تاني." : "Couldn't start the chat. Make sure the server is running and retry."}</p>
              <button onClick={() => { setBootError(false); startedRef.current = false; window.location.reload(); }} className="px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold text-sm">
                {isAr ? "إعادة المحاولة" : "Retry"}
              </button>
            </div>
          )}
              {step === "discovery" && !bootError && (
            <>
            <div className="zeus-glass p-4 sm:p-5 h-[58vh] sm:h-[60vh] flex flex-col">
              <div className="mb-3 pb-3 border-b border-border/60 flex items-center gap-3">
                <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="w-10 h-10 rounded-full object-cover object-top shrink-0" onError={withImageFallback} />
                <div>
                  <div className="font-heading font-bold text-lg">{companionName || t("onb.name.default")} — {isAr ? "رفيقك في التعلّم" : "Your Learning Companion"}</div>
                  <div className="text-xs text-muted-foreground">{isAr ? "محادثة طبيعية عشان أفهمك" : "A natural conversation to understand you"}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0"><ChatPanel messages={messages} onSend={sendDiscovery} disabled={!conversation || chatBusy} onRetry={() => {
                const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
                if (lastUserMessage) sendDiscovery(lastUserMessage.content, true);
              }} typing={typing} placeholder={isAr ? "اكتب ردك..." : "Type your reply..."} companionName={companionName} t={t} lang={lang} /></div>
            </div>
            {fieldComparison && (
              <div className="mt-4 max-h-[30vh] overflow-y-auto space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zeus-brightgold flex items-center gap-1.5">
                  <GitCompare style={{ width: 13, height: 13 }} /> {isAr ? "مقارنة المجالات" : "Field Comparison"}
                </div>
                {fieldComparison.map((f, i) => (
                  <div key={i} className="zeus-glass p-4">
                    <h3 className="font-heading font-bold text-sm mb-2">{f.field}</h3>
                    {f.description && <p className="text-xs text-muted-foreground mb-2">{f.description}</p>}
                    {f.difficulty && <p className="text-xs mb-1.5"><span className="font-semibold text-zeus-brightgold">{isAr ? "الصعوبة: " : "Difficulty: "}</span><span className="text-muted-foreground">{f.difficulty}</span></p>}
                    {f.daily_tasks && <p className="text-xs mb-2"><span className="font-semibold">{isAr ? "المهام اليومية: " : "Daily Tasks: "}</span><span className="text-muted-foreground">{f.daily_tasks}</span></p>}
                    {f.personality_fit && <p className="text-xs mb-2"><span className="font-semibold text-zeus-brightgold">{isAr ? "نوع الشخص المناسب: " : "Personality Fit: "}</span><span className="text-muted-foreground">{f.personality_fit}</span></p>}
                    {f.job_titles?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "الوظائف" : "Job Titles"}</span><div className="flex flex-wrap gap-1">{f.job_titles.map((j, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-zeus-gold/10 text-zeus-brightgold text-[10px]">{j}</span>)}</div></div>}
                    {f.specializations?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "تخصصات جوه المجال" : "Specializations"}</span><div className="flex flex-wrap gap-1">{f.specializations.map((item, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{item}</span>)}</div></div>}
                    {f.workplaces?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "أماكن الشغل المعتادة" : "Typical workplaces"}</span><div className="flex flex-wrap gap-1">{f.workplaces.map((item, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{item}</span>)}</div></div>}
                    {f.market_outlook && <p className="text-xs mb-2"><span className="font-semibold text-zeus-brightgold">{isAr ? "صورة عامة عن الطلب: " : "General market outlook: "}</span><span className="text-muted-foreground">{f.market_outlook}</span></p>}
                    {f.skills?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "المهارات" : "Skills"}</span><div className="flex flex-wrap gap-1">{f.skills.map((s, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{s}</span>)}</div></div>}
                    {f.tools?.length > 0 && <div className="mb-2"><span className="text-[10px] font-semibold text-muted-foreground block mb-1">{isAr ? "الأدوات" : "Tools"}</span><div className="flex flex-wrap gap-1">{f.tools.map((s, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{s}</span>)}</div></div>}
                    {f.example_projects?.length > 0 && (
                      <div className="mb-2 p-2.5 rounded-xl bg-zeus-gold/5 border border-zeus-gold/15">
                        <span className="text-[10px] font-bold text-zeus-brightgold block mb-1">{isAr ? "مثال مشروع حقيقي" : "Real Project Example"}</span>
                        {f.example_projects.map((p, k) => <p key={k} className="text-[11px] text-muted-foreground mb-0.5">• {p}</p>)}
                      </div>
                    )}
                    {f.growth_opportunities && <p className="text-xs mb-2"><span className="font-semibold text-zeus-brightgold">{isAr ? "فرص التطور: " : "Growth: "}</span><span className="text-muted-foreground">{f.growth_opportunities}</span></p>}
                    {f.pros?.length > 0 && <div className="text-[11px] text-emerald-400 mb-1">{isAr ? "مميزات: " : "Pros: "}{f.pros.join("، ")}</div>}
                    {f.cons?.length > 0 && <div className="text-[11px] text-red-400 mb-1">{isAr ? "عيوب: " : "Cons: "}{f.cons.join("، ")}</div>}
                    {f.why_fits && <div className="text-[11px] text-zeus-brightgold mt-2 pt-2 border-t border-border/40">{f.why_fits}</div>}
                    <button type="button" onClick={() => sendDiscovery(f.field)} disabled={typing} className="mt-3 w-full rounded-full bg-zeus-gold/10 border border-zeus-gold/30 px-3 py-2 text-xs font-semibold text-zeus-brightgold hover:bg-zeus-gold/20 disabled:opacity-50">
                      {isAr ? `أنا ميّال لـ ${f.field}` : `I'm leaning toward ${f.field}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
            </>
          )}
          {step === "dna" && <DnaSummary profile={profile} isAr={isAr} Arrow={Arrow} onBack={() => setStep("discovery")} onConfirm={() => goto("goal")} />}
          {step === "goal" && <GoalStep recs={recs} profile={profile} typing={typing} onPick={pickGoal} onRetry={() => loadGoals(true)} goalsError={goalsError} t={t} isAr={isAr} />}
          {step === "assessment" && <AssessmentStep skills={keySkills} levels={skillLevels} setLevels={setSkillLevels} skillsText={skillsText} setSkillsText={setSkillsText} onSubmit={submitSkills} t={t} isAr={isAr} Arrow={Arrow} isBeginner={isBeginnerProfile} goal={profile?.goal} lang={lang} />}
          {step === "roadmap" && <RoadmapReveal preview={roadmapPreview} typing={typing} building={building} onBuild={buildRoadmap} onRetry={() => loadRoadmap(true)} error={roadmapError} errorMessage={roadmapErrorMessage} isAr={isAr} companionName={companionName} />}
        </div>
      </main>
    </div>
  );
}

function GoalStep({ recs, profile, typing, onPick, onRetry, goalsError, t, isAr }) {
  const [custom, setCustom] = useState("");
  const [expanded, setExpanded] = useState(0);
  const empty = !recs || !Array.isArray(recs.recommendations) || recs.recommendations.length === 0;
  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "اختيار المسار" : "Choose your direction"}</div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{isAr ? "مجالات ممكن تناسبك" : "Fields that may fit you"}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{recs?.is_comprehensive_ai_path
          ? (isAr ? `بناءً على ميولك وهدفك${profile?.goal ? ` (${profile.goal})` : ""}، هتلاقي مسار AI Engineer الشامل الأول وبعده تخصصات بديلة. افتح التفاصيل وقارن طبيعة الشغل والمهارات والمشاريع قبل ما تختار.` : `Based on your interests and goals${profile?.goal ? ` (${profile.goal})` : ""}, you'll see the full AI Engineer path first, followed by optional specializations. Open the details and compare the work, skills, and projects before choosing.`)
          : (isAr ? `بناءً على ميولك وهدفك${profile?.goal ? ` (${profile.goal})` : ""}، قارن طبيعة الشغل والمهارات والمشاريع قبل ما تختار.` : `Based on your interests and goals${profile?.goal ? ` (${profile.goal})` : ""}, compare the work, skills, and projects before choosing.`)}</p>
      </div>
      {typing ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="text-zeus-gold animate-spin" style={{ width: 32, height: 32 }} />
          <p className="text-muted-foreground text-sm">{isAr ? "بحلّل أفضل مسار ليك..." : "Analyzing your best path..."}</p>
        </div>
      ) : (goalsError || empty) ? (
        <div className="zeus-glass p-8 text-center">
          <p className="text-muted-foreground mb-4 text-sm">{isAr ? "تعثر تحليل الأهداف — دوس إعادة المحاولة" : "Goal analysis stumbled — hit retry"}</p>
          <button onClick={onRetry} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold text-sm">
            {isAr ? "إعادة المحاولة" : "Retry"}
          </button>
          <div className="zeus-glass p-4 mt-4">
            <label className="text-xs text-muted-foreground block mb-1.5">{isAr ? "أو اكتب هدفك مباشرة" : "Or type your goal directly"}</label>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isAr ? "اكتب هدفك" : "Your goal"}
                className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:zeus-gold-border" />
              <button onClick={() => custom.trim() && onPick(custom.trim())} className="px-4 rounded-lg bg-zeus-gold text-zeus-midnight font-medium text-sm">{isAr ? "تأكيد" : "Confirm"}</button>
            </div>
          </div>
        </div>
      ) : recs ? (
        <div className="space-y-3">
          {recs.recommendations?.map((r, i) => (
            <div key={i} className="zeus-glass overflow-hidden">
              <button onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-start p-4 hover:zeus-gold-border transition">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-heading font-bold text-lg">{r.goal}{i === 0 && recs.is_comprehensive_ai_path && <span className="ms-2 align-middle text-[10px] rounded-full px-2 py-1 bg-zeus-gold/15 text-zeus-brightgold">{isAr ? "المسار الشامل" : "Full path"}</span>}</span>
                  <span className="text-zeus-gold font-bold text-sm">{isAr ? `توافق ${r.score}%` : `${r.score}% fit`}</span>
                </div>
                <p className="text-muted-foreground text-sm">{r.reason}</p>
                <div className="mt-2 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold" style={{ width: `${r.score}%` }} />
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-2">{r.description}</p>}
                <span className="text-xs text-zeus-brightgold mt-2 inline-block">{expanded === i ? (isAr ? "إخفاء التفاصيل ▲" : "Hide details ▲") : (isAr ? "عرض التفاصيل ▼" : "View details ▼")}</span>
              </button>
              {expanded === i && (
                <div className="px-4 pb-4 space-y-3 animate-fade-in border-t border-border/40 pt-3">
                  {r.nature && <Detail label={isAr ? "طبيعة العمل" : "Nature of Work"} value={r.nature} />}
                  {r.key_skills?.length > 0 && <Chips label={isAr ? "المهارات المطلوبة" : "Key Skills"} items={r.key_skills} />}
                  {r.tools?.length > 0 && <Chips label={isAr ? "الأدوات" : "Tools"} items={r.tools} />}
                  {r.job_titles?.length > 0 && <Chips label={isAr ? "الوظائف" : "Job Titles"} items={r.job_titles} />}
                  {r.example_projects?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "مشاريع حقيقية" : "Real Projects"}</div>
                      {r.example_projects.map((p, k) => <p key={k} className="text-xs text-muted-foreground mb-1">• {p}</p>)}
                    </div>
                  )}
                  {r.current_level && <Detail label={isAr ? "مستواك الحالي" : "Your Current Level"} value={r.current_level} />}
                  {r.gap && <Detail label={isAr ? "الفجوة" : "The Gap"} value={r.gap} />}
                  {r.what_to_learn && <Detail label={isAr ? "إيه اللي محتاج تتعلمه" : "What to Learn"} value={r.what_to_learn} />}
                  {r.learning_outline?.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-zeus-brightgold mb-1">{isAr ? "هتتعلم بالترتيب" : "What you will learn"}</div>
                      <ol className="list-decimal ps-5 space-y-1">
                        {r.learning_outline.map((item, k) => <li key={k} className="text-xs text-muted-foreground">{item}</li>)}
                      </ol>
                    </div>
                  )}
                  {r.tradeoffs && <Detail label={isAr ? "خد بالك" : "Trade-offs"} value={r.tradeoffs} />}
                  {r.why_fits && <div className="p-3 rounded-xl bg-zeus-gold/10 border border-zeus-gold/20"><p className="text-xs text-zeus-brightgold"><span className="font-bold">{isAr ? "ليه يناسبك: " : "Why it fits: "}</span>{r.why_fits}</p></div>}
                  <button onClick={() => onPick(r.goal)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold">
                    {isAr ? "اختار المسار ده" : "Choose this path"} <ArrowRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="zeus-glass p-4">
            <label className="text-xs text-muted-foreground block mb-1.5">{isAr ? "أو اكتب هدف مختلف" : "Or type a different goal"}</label>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isAr ? "اكتب هدفك" : "Your goal"}
                className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:zeus-gold-border" />
              <button onClick={() => custom.trim() && onPick(custom.trim())} className="px-4 rounded-lg bg-zeus-gold text-zeus-midnight font-medium text-sm">{isAr ? "تأكيد" : "Confirm"}</button>
            </div>
          </div>
        </div>
      ) : <p className="text-center text-muted-foreground">{isAr ? "حصل خطأ، حدّث الصفحة" : "Something went wrong, refresh"}</p>}
    </div>
  );
}

function Detail({ label, value }) {
  return <div><span className="text-xs font-bold text-zeus-brightgold">{label}: </span><span className="text-xs text-muted-foreground">{value}</span></div>;
}

function Chips({ label, items }) {
  return (
    <div>
      <div className="text-xs font-bold text-zeus-brightgold mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">{items.map((s, k) => <span key={k} className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px]">{s}</span>)}</div>
    </div>
  );
}

function AssessmentStep({ skills, levels, setLevels, skillsText, setSkillsText, onSubmit, t, isAr, Arrow, isBeginner, goal, lang }) {
  const [quizState, setQuizState] = useState("idle"); // idle|loading|taking|submitted|error
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const blendedPreview = quizScore === null ? null
    : Object.fromEntries(skills.map((s) => [s, Math.round(((levels[s] ?? 50) * 0.4) + (quizScore * 0.6))]));

  const startQuiz = async () => {
    setQuizState("loading");
    try {
      const res = await api.functions.invoke("generateAssessmentQuiz", { goal, skills, lang });
      const data = res.data || res;
      if (data.credit_exhausted) { setQuizState("error"); return; }
      if (data.questions?.length >= 3) {
        setQuestions(data.questions.slice(0, 5));
        setAnswers({});
        setQuizScore(null);
        setQuizState("taking");
      } else {
        setQuizState("error");
      }
    } catch {
      setQuizState("error");
    }
  };

  const submitQuiz = () => {
    let correct = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
    setQuizScore(questions.length ? Math.round((correct / questions.length) * 100) : 0);
    setQuizState("submitted");
  };

  const finish = () => {
    // Mandatory quiz gate: cannot build the roadmap without a quiz score.
    if (quizScore === null || !blendedPreview) return;
    onSubmit(blendedPreview);
  };
  if (isBeginner) {
    return (
      <div className="animate-fade-up">
        <div className="text-center mb-6">
          <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "تقييم سريع" : "Quick Assessment"}</div>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("onb.assess.title")}</h2>
          <p className="text-muted-foreground mt-2 text-sm">{isAr ? "بما إنك بتبدأ من الصفر، ثبّتنا مهاراتك الأساسية على مستوى مبتدئ تلقائيًا — من غير ما تقيّم نفسك بنسب." : "Since you're starting from zero, we've set your core skills to Beginner automatically — no self-rating needed."}</p>
        </div>
        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s} className="zeus-glass p-4 flex items-center justify-between">
              <span className="font-medium">{s}</span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-zeus-gold/15 text-zeus-brightgold">{isAr ? "مبتدئ" : "Beginner"}</span>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <button onClick={onSubmit} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold">
            {isAr ? "ابني خريطتي" : "Build my roadmap"} <Arrow style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="animate-fade-up">
      <div className="text-center mb-6">
        <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-1">{isAr ? "تقييم سريع" : "Quick Assessment"}</div>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("onb.assess.title")}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{isAr ? "قيّم نفسك مبدئيًا، وبعدها اختبار قصير إجباري (5 أسئلة) يظبط تقييمك — مش هنعتمد على رأيك لوحده." : "Rate yourself first, then a mandatory short quiz (5 questions) calibrates it — no self-rating alone."}</p>
      </div>
      <div className="space-y-4">
        {skills.map((s) => {
          const shown = blendedPreview ? blendedPreview[s] : (levels[s] ?? 50);
          return (
            <div key={s} className="zeus-glass p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{s}</span>
                <span className="text-zeus-gold font-bold">{shown}%{blendedPreview && <span className="text-[10px] text-muted-foreground font-normal"> {isAr ? "(بعد المعايرة)" : "(calibrated)"}</span>}</span>
              </div>
              <input type="range" min="0" max="100" value={levels[s] ?? 50}
                onChange={(e) => setLevels({ ...levels, [s]: Number(e.target.value) })}
                className="w-full accent-zeus-gold" />
            </div>
          );
        })}
      </div>
      <div className="zeus-glass p-4 mt-4">
        <label className="text-xs font-semibold text-zeus-brightgold block mb-2">{isAr ? "احكي لنا عن مهاراتك بالتفصيل" : "Tell us about your skills in detail"}</label>
        <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} rows={3}
          placeholder={isAr ? "اكتب إيه اللي تقدر تعمله فعليًا، الأدوات اللي استخدمتها، والمشاريع اللي اشتغلت عليها..." : "Write what you can actually do, tools you've used, and projects you've worked on..."}
          className="w-full bg-transparent border border-border/60 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:zeus-gold-border resize-none" />
      </div>

      {/* Mandatory mini-quiz */}
      <div className="zeus-glass p-5 mt-4">
        <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "الاختبار القصير (إجباري) 🧪" : "Short Quiz (required) 🧪"}</h3>
        <p className="text-xs text-muted-foreground mb-3">{isAr ? "5 أسئلة من مستوى مهاراتك — لازم تخلّصه عشان نبني خطتك. درجتك هتتدمج مع تقييمك (40% رأيك + 60% الاختبار)." : "5 questions on your skills — required before building your plan. Blended 40% self + 60% quiz."}</p>
        {quizState === "idle" && (
          <button onClick={startQuiz} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-secondary/60 border border-zeus-gold/40 text-zeus-brightgold font-semibold text-sm hover:bg-zeus-gold/10 transition">
            {isAr ? "ابدأ الاختبار القصير" : "Start Short Quiz"}
          </button>
        )}
        {quizState === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> {isAr ? "بجهّز أسئلتك..." : "Preparing your questions..."}</div>
        )}
        {quizState === "error" && (
          <div className="space-y-2">
            <p className="text-xs text-destructive">{isAr ? "تعثر تجهيز الاختبار — حاول تاني (إجباري قبل المتابعة)." : "Quiz setup stumbled — retry (required to continue)."}</p>
            <button onClick={startQuiz} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-secondary/60 border border-border/60 text-sm hover:border-zeus-gold/40 transition">{isAr ? "إعادة المحاولة" : "Retry"}</button>
          </div>
        )}
        {(quizState === "taking" || quizState === "submitted") && (
          <div className="space-y-3 mt-1">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded-xl bg-secondary/20 border border-border/40 p-3.5">
                <p className="font-medium text-sm mb-2.5">{qi + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {(q.options || []).map((opt, oi) => {
                    const picked = answers[qi] === oi;
                    const reveal = quizState === "submitted";
                    const isRight = oi === q.correct;
                    return (
                      <button key={oi} disabled={reveal} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                        className={`w-full text-start p-2.5 rounded-lg border text-sm transition flex items-center gap-2 ${reveal && isRight ? "bg-emerald-500/15 border-emerald-500/50" : reveal && picked ? "bg-destructive/10 border-destructive/40" : picked ? "bg-zeus-gold/15 border-zeus-gold/50" : "bg-transparent border-border/40 hover:border-zeus-gold/30"}`}>
                        <span className="text-[11px] font-bold opacity-70">{String.fromCharCode(65 + oi)}</span> {opt}
                      </button>
                    );
                  })}
                </div>
                {quizState === "submitted" && q.explanation && <p className="text-[11px] text-muted-foreground mt-2">💡 {q.explanation}</p>}
              </div>
            ))}
            {quizState === "taking" && (
              <button onClick={submitQuiz} disabled={Object.keys(answers).length < questions.length}
                className="w-full py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition disabled:opacity-50">
                {isAr ? `سلّم الاختبار (${Object.keys(answers).length}/${questions.length})` : `Submit (${Object.keys(answers).length}/${questions.length})`}
              </button>
            )}
            {quizState === "submitted" && (
              <div className="rounded-xl bg-zeus-gold/10 border border-zeus-gold/30 p-3.5 text-sm">
                <span className="font-bold text-zeus-brightgold">{isAr ? `درجتك: ${quizScore}%` : `Your score: ${quizScore}%`}</span>
                <span className="text-muted-foreground"> — {isAr ? "اتظبطت مستوياتك تلقائيًا فوق." : "your levels above were auto-calibrated."} </span>
                <button onClick={startQuiz} className="text-zeus-brightgold underline text-xs">{isAr ? "إعادة الاختبار" : "Retake"}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-center mt-6">
        <button onClick={finish} disabled={quizScore === null}
          title={quizScore === null ? (isAr ? "لازم تخلّص الاختبار القصير الأول" : "Finish the short quiz first") : ""}
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50">
          {isAr ? "ابني خريطتي" : "Build my roadmap"} <Arrow style={{ width: 18, height: 18 }} />
        </button>
        {quizScore === null && <p className="text-[11px] text-muted-foreground mt-2">{isAr ? "زرار بناء الخطة هيفتح بعد الاختبار القصير." : "Plan building unlocks after the short quiz."}</p>}
      </div>
    </div>
  );
}