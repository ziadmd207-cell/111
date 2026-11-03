import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { api } from "@/api/client";

const MAX_FILES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function attachmentUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_API_URL || ""}${url}`;
}

export default function SupportChatThread({ chatId, isAr, adminMode = false, onChatUpdated }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    try {
      const result = adminMode
        ? await api.admin.supportChat(chatId)
        : await api.support.myChat();
      const received = result.messages || [];
      setMessages((current) => current.length === received.length
        && current.every((item, index) => item.id === received[index].id)
        ? current
        : received);
      if (result.chat) onChatUpdated?.(result.chat);
      setError("");
    } catch (loadError) {
      setError(loadError.message || (isAr ? "تعذر تحميل المحادثة." : "Could not load conversation."));
    } finally {
      setLoading(false);
    }
  }, [adminMode, chatId, isAr, onChatUpdated]);

  useEffect(() => {
    loadMessages();
    const timer = window.setInterval(loadMessages, 3500);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addFiles = (selectedFiles) => {
    const combined = [...files, ...Array.from(selectedFiles || [])];
    if (combined.length > MAX_FILES) {
      setError(isAr ? "مسموح إرفاق 4 ملفات كحد أقصى." : "You can attach up to 4 files.");
      return;
    }
    if (combined.some((file) => file.size > MAX_FILE_SIZE)) {
      setError(isAr ? "حجم الملف لازم يكون 10 ميجابايت أو أقل." : "Each file must be 10MB or smaller.");
      return;
    }
    setFiles(combined);
    setError("");
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
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("ogg") ? "ogg" : "webm";
        const voiceNote = new File(chunks, `voice-note.${extension}`, { type });
        addFiles([voiceNote]);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError("");
    } catch (recordError) {
      setError(recordError.message || (isAr ? "تعذر تشغيل الميكروفون." : "Could not access the microphone."));
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    setError("");
    try {
      const result = adminMode
        ? await api.admin.sendSupportMessage(chatId, text.trim(), files)
        : await api.support.sendMessage(text.trim(), files);
      setText("");
      setFiles([]);
      if (result.chat) onChatUpdated?.(result.chat);
      await loadMessages();
    } catch (sendError) {
      setError(sendError.message || (isAr ? "تعذر إرسال الرسالة." : "Could not send message."));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zeus-gold" /></div>;
  }

  return (
    <div className="support-chat-thread flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-48 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(120, 120, 120, 0.10) 1px, transparent 1px)",
          backgroundPosition: "0 0",
          backgroundSize: "22px 22px",
        }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="mx-auto my-6 w-fit rounded-lg bg-[#fff8c6] px-4 py-2 text-center text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#d1d7db]">
            {isAr ? "اكتب رسالتك لفريق الدعم، وهنرد عليك هنا." : "Send a message to support. We’ll reply here."}
          </p>
        )}
        {messages.map((message) => {
          const mine = adminMode ? message.sender_type === "admin" : message.sender_type === "user";
          return (
            <article
              key={message.id}
              className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[78%] ${
                mine
                  ? "ms-auto rounded-ee-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                  : "me-auto rounded-es-sm bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
              }`}
            >
              {message.text && <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.text}</p>}
              {!!message.attachments?.length && (
                <div className="mt-2 grid gap-2">
                  {message.attachments.map((file, index) => {
                    const url = attachmentUrl(file.url);
                    if (file.mime_type?.startsWith("image/")) {
                      return <a key={`${file.url}-${index}`} href={url} target="_blank" rel="noreferrer"><img src={url} alt={file.name || "Attachment"} className="max-h-64 max-w-full rounded-lg object-contain" /></a>;
                    }
                    if (file.mime_type?.startsWith("audio/")) {
                      return <audio key={`${file.url}-${index}`} controls preload="metadata" src={url} className="max-w-full" />;
                    }
                    if (file.mime_type?.startsWith("video/")) {
                      return <video key={`${file.url}-${index}`} controls preload="metadata" src={url} className="max-h-64 max-w-full rounded-lg" />;
                    }
                    return <a key={`${file.url}-${index}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-zeus-brightgold underline"><Paperclip className="h-3.5 w-3.5" />{file.name || (isAr ? "ملف مرفق" : "Attachment")}</a>;
                  })}
                </div>
              )}
              <time className={`mt-1 block text-end text-[10px] ${mine ? "text-[#667781] dark:text-[#b4c7c3]" : "text-[#667781] dark:text-[#8696a0]"}`} dateTime={message.created_date}>
                {new Date(message.created_date).toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
              </time>
            </article>
          );
        })}
      </div>

      <form onSubmit={send} className="space-y-2 bg-[#f0f2f5] px-3 py-3 dark:bg-[#202c33] sm:px-4">
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs">
                <span className="max-w-48 truncate">{file.name}</span>
                <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={isAr ? "إزالة الملف" : "Remove file"}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] hover:bg-black/5 hover:text-[#128c7e] dark:text-[#aebac1] dark:hover:bg-white/5 dark:hover:text-[#25d366]" title={isAr ? "إرفاق صورة أو ملف صوتي" : "Attach an image or audio file"}>
            <ImagePlus className="h-4 w-4" />
            <input type="file" accept="image/*,audio/*,video/mp4,application/pdf" multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          </label>
          <button type="button" onClick={toggleRecording} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${recording ? "text-rose-500" : "text-[#54656f] hover:bg-black/5 hover:text-[#128c7e] dark:text-[#aebac1] dark:hover:bg-white/5 dark:hover:text-[#25d366]"}`} aria-label={recording ? (isAr ? "إيقاف التسجيل" : "Stop recording") : (isAr ? "تسجيل رسالة صوتية" : "Record voice message")}>
            {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={3000} rows={1} placeholder={isAr ? "اكتب رسالة..." : "Type a message"} className="max-h-28 min-h-10 flex-1 resize-y rounded-full border-0 bg-white px-4 py-2.5 text-sm text-[#111b21] outline-none focus:ring-1 focus:ring-[#25d366] dark:bg-[#2a3942] dark:text-[#e9edef]" />
          <button type="submit" disabled={sending || (!text.trim() && !files.length)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white transition hover:bg-[#075e54] disabled:opacity-50 dark:bg-[#00a884] dark:hover:bg-[#06cf9c]" aria-label={isAr ? "إرسال" : "Send"}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
      </form>
    </div>
  );
}
