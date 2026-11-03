import React, { useState, useEffect, useRef } from "react";
import { Users, Loader2, Send, ArrowLeft, ArrowRight, Hash, Sparkles, Paperclip, Mic, Square, X, Image as ImageIcon, AlertCircle } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";

export default function Community() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoadError("");
    try {
      const u = await api.auth.me();
      setMe(u);
      const c = await api.entities.Community.filter({}, "-created_date", 50);
      setCommunities(c);
    } catch (error) {
      setLoadError(error.message || (isAr ? "تعذر تحميل المجتمعات." : "Couldn't load communities."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Communities are admin-managed: users only browse and join.
  // (The old client-side auto-seed was removed.)

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  if (active) return <ChatRoom community={active} onBack={() => { setActive(null); load(); }} me={me} isAr={isAr} dir={dir} />;

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Users className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {t("nav.community")}</h1>
        <p className="text-muted-foreground mt-1">{isAr ? "مجتمعات متعلّمين متلائمين مع رحلتك" : "Communities matched to your journey"}</p>
      </div>
      {loadError && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <span>{loadError}</span>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="shrink-0 underline">{isAr ? "إعادة المحاولة" : "Retry"}</button>
      </div>}
      <div className="grid sm:grid-cols-2 gap-4">
        {!loadError && communities.length === 0 && (
          <div className="zeus-glass p-10 text-center text-muted-foreground sm:col-span-2">
            {isAr ? "الأدمن هيضيفك لمجتمعك قريبًا — هتوصلك إشعار أول ما تنضم." : "The admin will add you to your community soon — you'll get notified."}
          </div>
        )}
        {communities.map((c) => {
          const sameGoal = profile?.goal && c.goal && (c.goal === profile.goal || profile.goal.includes(c.goal) || c.goal.includes(profile.goal));
          return (
            <div key={c.id} className="zeus-glass p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {sameGoal && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zeus-gold/15 text-zeus-brightgold mb-1.5"><Sparkles style={{ width: 10, height: 10 }} /> {isAr ? "نفس هدفك" : "Matches your goal"}</span>}
                  <h3 className="font-heading font-bold">{c.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.stage}</div>
                  {c.is_closed && <div className="text-xs text-amber-500 mt-1">{isAr ? "المجتمع مغلق للكتابة" : "This community is closed for posting"}</div>}
                </div>
                <div className="text-zeus-gold font-bold text-xl">{c.member_count || 0}</div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{c.description}</p>
              <div className="mt-4 flex items-center gap-2">
                {/* Membership is assigned by the admin only */}
                <button onClick={() => setActive(c)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-medium hover:bg-zeus-brightgold transition"><Hash style={{ width: 14, height: 14 }} /> {isAr ? "افتح الشات" : "Open chat"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatRoom({ community, onBack, me, isAr, dir }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const loadMsgs = async () => {
    try {
      const m = await api.entities.CommunityMessage.filter({ community_id: community.id }, "created_date", 100);
      setMessages(m);
      setError("");
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل الرسائل." : "Couldn't load messages."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadMsgs(); }, [community.id]);

  useEffect(() => {
    const unsub = api.entities.CommunityMessage.subscribe((event) => {
      if (event.data?.community_id !== community.id) return;
      loadMsgs();
    });
    return unsub;
  }, [community.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if ((!v && !files.length) || sending) return;
    setSending(true);
    setError("");
    try {
      const attachments = await Promise.all(files.map(async (file) => {
        const { file_url } = await api.integrations.Core.UploadPublicFile({ file });
        if (!file_url) throw new Error(isAr ? "تعذر رفع أحد المرفقات." : "An attachment upload returned no URL.");
        return { url: file_url, mime_type: file.type, name: file.name };
      }));
      await api.entities.CommunityMessage.create({
        community_id: community.id,
        user_name: me.full_name || me.email,
        text: v,
        attachments,
      });
      setText("");
      setFiles([]);
      await loadMsgs();
    } catch (sendError) {
      setError(sendError.message || (isAr ? "تعذر إرسال الرسالة." : "Couldn't send the message."));
    } finally {
      setSending(false);
    }
  };

  const addFiles = (selectedFiles) => {
    const selected = Array.from(selectedFiles || []);
    const valid = selected.filter((file) => (file.type.startsWith("image/") || file.type.startsWith("audio/")) && file.size <= 10 * 1024 * 1024);
    if (valid.length !== selected.length) {
      setError(isAr ? "المرفقات المسموحة صور أو صوت حتى 10 ميجابايت." : "Only image/audio files up to 10 MB are allowed.");
    } else {
      setError("");
    }
    setFiles((current) => {
      if (current.length + valid.length > 5) {
        setError(isAr ? "الحد الأقصى 5 مرفقات للرسالة." : "You can attach up to 5 files per message.");
        return current;
      }
      return [...current, ...valid];
    });
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(isAr ? "تسجيل الصوت غير مدعوم في المتصفح ده." : "Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("ogg") ? "ogg" : "webm";
        const voiceNote = new File(chunksRef.current, `voice-note.${extension}`, { type });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (voiceNote.size) addFiles([voiceNote]);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        setError(isAr ? "فشل تسجيل الرسالة الصوتية." : "Voice recording failed.");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError("");
    } catch (recordError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(recordError.message || (isAr ? "تعذر الوصول إلى الميكروفون." : "Couldn't access the microphone."));
    }
  };

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return (
    <div dir={dir} className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">{isAr ? <ArrowRight style={{ width: 16, height: 16 }} /> : <ArrowLeft style={{ width: 16, height: 16 }} />} {isAr ? "كل المجتمعات" : "All communities"}</button>
      <div className="zeus-glass p-5 h-[65vh] flex flex-col">
        <div className="pb-3 mb-3 border-b border-border/60">
          <h2 className="font-heading font-bold text-lg">{community.name}</h2>
          <div className="text-xs text-muted-foreground">{community.member_count || 0} {isAr ? "عضو" : "members"} · {community.stage}</div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pe-1">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 22, height: 22 }} /></div> :
            messages.map((m) => {
            const mine = m.user_id === me?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-fade-up`}>
                  {!mine && <div className="w-8 h-8 shrink-0 rounded-full bg-secondary/60 flex items-center justify-center text-xs font-bold me-2 mt-0.5">{(m.user_name || "?").charAt(0).toUpperCase()}</div>}
                  <div className={`max-w-[75%]`}>
                    {!mine && <div className="text-[11px] text-muted-foreground mb-0.5">{m.user_name}</div>}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${mine ? "bg-zeus-gold text-zeus-midnight rounded-ee-sm" : "bg-card border border-border/60 rounded-es-sm"}`}>
                      {m.is_pinned && <div className="mb-1 text-[10px] font-semibold text-zeus-brightgold">{isAr ? "رسالة مثبتة" : "Pinned message"}</div>}
                      {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                      {(m.attachments || []).map((attachment, index) => (
                        attachment.mime_type?.startsWith("audio/")
                          ? <audio key={`${attachment.url}-${index}`} controls preload="metadata" src={`${import.meta.env.VITE_API_URL || ""}${attachment.url}`} className="mt-2 max-w-full" />
                          : <a key={`${attachment.url}-${index}`} href={`${import.meta.env.VITE_API_URL || ""}${attachment.url}`} target="_blank" rel="noreferrer">
                              <img src={`${import.meta.env.VITE_API_URL || ""}${attachment.url}`} alt={attachment.name || (isAr ? "صورة مرفقة" : "Attached image")} className="mt-2 max-h-56 max-w-full rounded-xl object-contain" />
                            </a>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          <div ref={endRef} />
        </div>
        {error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        {community.is_closed
          ? <p className="mt-3 rounded-xl bg-secondary/40 px-4 py-3 text-center text-sm text-muted-foreground">{isAr ? "المجتمع مغلق حاليًا، تقدر تقرأ الرسائل لكن مش هتقدر تبعت." : "This community is closed. You can read messages but cannot send."}</p>
          : <>
            {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary/50 px-3 py-1 text-xs"><ImageIcon className="h-3.5 w-3.5 shrink-0" /><span className="max-w-40 truncate">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={isAr ? "إزالة المرفق" : "Remove attachment"}><X className="h-3.5 w-3.5" /></button></span>)}</div>}
            <form onSubmit={send} className="mt-3 flex items-center gap-2">
              <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-zeus-gold" aria-label={isAr ? "إرفاق صور أو صوت" : "Attach images or audio"}>
                <Paperclip className="h-4 w-4" />
                <input type="file" accept="image/*,audio/*" multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
              </label>
              <button type="button" onClick={toggleRecording} aria-label={recording ? (isAr ? "إيقاف التسجيل" : "Stop recording") : (isAr ? "تسجيل صوت" : "Record voice")} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 ${recording ? "text-rose-500" : "text-muted-foreground hover:text-zeus-gold"}`}>
                {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
              </button>
              <input value={text} onChange={(event) => setText(event.target.value)} placeholder={isAr ? "اكتب رسالة..." : "Type a message..."} className="flex-1 rounded-full border border-border/60 bg-card px-4 py-3 text-sm outline-none focus:zeus-gold-border" />
              <button type="submit" disabled={sending || (!text.trim() && !files.length)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zeus-gold text-zeus-midnight shadow-gold-sm transition hover:bg-zeus-brightgold disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
              </button>
            </form>
          </>}
      </div>
    </div>
  );
}