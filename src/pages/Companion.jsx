import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import ChatPanel from "@/components/zeus/ChatPanel";

export default function Companion() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [roadmap, setRoadmap] = useState(null);
  const [currentTask, setCurrentTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.entities.Roadmap.filter({ status: "active" }, "-created_date", 1);
        if (r.length) setRoadmap(r[0]);
        const tk = await api.entities.Task.filter({ status: { $ne: "done" } }, "order", 1);
        if (tk.length) setCurrentTask(tk[0]);
        const conv = await api.entities.Conversation.filter({ type: "companion" }, "-created_date", 1);
        if (conv.length) {
          setConversation(conv[0]);
          setMessages(conv[0].messages || []);
        } else {
          // No fixed greeting by design: first message is crafted by the LLM
          // from the user's real goal/progress.
          const c = await api.entities.Conversation.create({
            type: "companion", companion_name: profile?.companion_name || "ZEUS", messages: [],
          });
          setConversation(c);
          setMessages([]);
          try {
            const res = await api.functions.invoke("companionChat", {
              messages: [], profile, roadmap: r[0], currentTask: tk[0],
              companionName: profile?.companion_name, lang, greet: true,
            });
            const data = res.data || res;
            const txt = (data.reply || "").trim();
            if (txt) {
              const greet = [{ role: "assistant", content: txt, ts: new Date().toISOString() }];
              setMessages(greet);
              await api.entities.Conversation.update(c.id, { messages: greet });
            }
          } catch (error) {
            console.error("Failed to load companion greeting:", error);
          }
        }
        setInitError(false);
      } catch (error) {
        console.error("Failed to initialize companion chat:", error);
        setInitError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAttempt]);

  const send = async (text, images = [], retry = false) => {
    if (inFlightRef.current || typing) return;
    inFlightRef.current = true;
    const userMsg = { role: "user", content: text, images, ts: new Date().toISOString() };
    const history = retry ? messages.filter((message) => !message.retryable) : messages;
    const next = retry ? history : [...history, userMsg];
    setMessages(next);
    setChatBusy(true);
    setTyping(true);
    try {
      const res = await api.functions.invoke("companionChat", {
        messages: next.map((m) => ({ role: m.role, content: m.content, images: m.images || [] })),
        profile, roadmap, currentTask, companionName: profile?.companion_name, lang
      });
      const data = res.data || res;
      const replyText = (data.reply || "").trim();
      const aiMsg = {
        role: "assistant",
        content: replyText || (isAr ? "حصل خطأ، دوس إعادة المحاولة" : "The reply was empty; retry"),
        ts: new Date().toISOString(),
        ...(!replyText ? { retryable: true } : {}),
      };
      const updated = [...next, aiMsg];
      setMessages(updated);
      setTyping(false);
      try {
        await api.entities.Conversation.update(conversation.id, { messages: updated });
      } catch (error) {
        console.error("Failed to save companion conversation:", error);
      }
    } catch (e) {
      setMessages([...next.filter((message) => !message.retryable), {
        role: "assistant",
        content: isAr ? "حصل خطأ، دوس إعادة المحاولة" : "An error occurred; retry",
        ts: new Date().toISOString(),
        retryable: true,
      }]);
      try {
        await api.entities.Conversation.update(conversation.id, { messages: next.filter((message) => !message.retryable) });
      } catch (saveError) {
        console.error("Failed to save companion user message:", saveError);
      }
    } finally {
      setTyping(false);
      setChatBusy(false);
      inFlightRef.current = false;
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
  if (initError) return (
    <div dir={dir} className="zeus-glass p-6 max-w-xl mx-auto text-center">
      <p className="text-sm text-muted-foreground mb-4">{isAr ? "تعذر تحميل المحادثة الآن. تحقق من اتصالك وحاول مرة أخرى." : "The conversation could not be loaded. Check your connection and try again."}</p>
      <button type="button" onClick={() => { setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}
        className="px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold">
        {isAr ? "إعادة المحاولة" : "Retry"}
      </button>
    </div>
  );

  return (
    <div dir={dir} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-zeus-gold to-zeus-brightgold flex items-center justify-center"><MessageSquare className="text-white" style={{ width: 22, height: 22 }} /></div>
        <div>
          <h1 className="font-heading font-extrabold text-2xl">{profile?.companion_name || "ZEUS"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "رفيقك في التعلّم — فاهم خريطتك ومهامك" : "Your learning companion — knows your roadmap & tasks"}</p>
        </div>
      </div>
      <div className="zeus-glass p-5 h-[65vh] flex flex-col">
        <ChatPanel messages={messages} onSend={send} onRetry={() => {
          const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
          if (lastUserMessage) send(lastUserMessage.content, lastUserMessage.images || [], true);
        }} typing={typing} disabled={!conversation || chatBusy} placeholder={t("companion.placeholder")} companionName={profile?.companion_name} t={t} lang={lang} />
      </div>
    </div>
  );
}