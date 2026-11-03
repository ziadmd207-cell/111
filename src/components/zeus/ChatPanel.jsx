import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, Loader2, Paperclip, Send, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { api } from "@/api/client";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_IMAGES = 3;

export default function ChatPanel({ messages, onSend, onRetry, typing, disabled = false, placeholder, companionName, t, lang, options, onSelectOption }) {
  const [text, setText] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [imageError, setImageError] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [animatedReply, setAnimatedReply] = useState(null);
  const endRef = useRef(null);
  const recognitionRef = useRef(null);
  const previewUrlsRef = useRef(new Set());
  const lastSpokenRef = useRef(null);
  const previousReplyRef = useRef(null);
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.retryable);
  const visibleOptions = Array.isArray(options)
    ? [...new Set(options.filter((option) => typeof option === "string" && option.trim().length >= 3).map((option) => option.trim()))]
    : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!latestAssistant) return undefined;
    const signature = `${latestAssistant.ts || ""}:${latestAssistant.content}`;
    if (previousReplyRef.current === null) {
      previousReplyRef.current = signature;
      return undefined;
    }
    if (previousReplyRef.current === signature) return undefined;
    previousReplyRef.current = signature;

    const characters = Array.from(latestAssistant.content || "");
    let index = 0;
    setAnimatedReply({ signature, content: "" });
    const timer = window.setInterval(() => {
      index = Math.min(index + 2, characters.length);
      setAnimatedReply({ signature, content: characters.slice(0, index).join("") });
      if (index >= characters.length) window.clearInterval(timer);
    }, 22);
    return () => window.clearInterval(timer);
  }, [latestAssistant?.ts, latestAssistant?.content]);

  // Speak the last AI response when speak is enabled
  useEffect(() => {
    if (!speakEnabled || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.content !== lastSpokenRef.current) {
      lastSpokenRef.current = lastMsg.content;
      speak(lastMsg.content);
    }
  }, [messages, speakEnabled]);

  const speak = (content) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(content);
    utter.lang = lang === "ar" ? "ar-EG" : "en-US";
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = lang === "ar" ? "ar-EG" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      setText(e.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggleSpeak = () => {
    if (speakEnabled) {
      window.speechSynthesis?.cancel();
    }
    setSpeakEnabled(!speakEnabled);
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if ((!v && !selectedImages.length) || typing || disabled || uploadingImages) return;
    setImageError("");
    setUploadingImages(true);
    try {
      const uploaded = await Promise.all(selectedImages.map(async ({ file }) => {
        const result = await api.integrations.Core.UploadPublicFile({ file });
        if (!result.file_url) throw new Error(lang === "ar" ? "رفع الصورة لم يرجع رابطًا صالحًا." : "Image upload returned no file URL.");
        return result.file_url;
      }));
      const images = uploaded;
      const message = v || (lang === "ar" ? "ممكن تشرحلي الصورة دي؟" : "Please explain this image.");
      onSend(message, images);
      setText("");
      setSelectedImages([]);
      selectedImages.forEach(({ preview }) => {
        URL.revokeObjectURL(preview);
        previewUrlsRef.current.delete(preview);
      });
    } catch (error) {
      setImageError(error.message || (lang === "ar" ? "تعذر رفع الصورة. حاول مرة أخرى." : "Couldn't upload the image. Please try again."));
    } finally {
      setUploadingImages(false);
    }
  };

  const addImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const valid = files.filter((file) => ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) && file.size <= MAX_IMAGE_BYTES);
    if (valid.length !== files.length) {
      setImageError(lang === "ar" ? "ارفع صور PNG أو JPG أو WEBP أو GIF، بحد أقصى 10 ميجابايت للصورة." : "Use PNG, JPG, WEBP, or GIF images up to 10 MB each.");
    } else {
      setImageError("");
    }
    const room = MAX_CHAT_IMAGES - selectedImages.length;
    const candidates = valid.slice(0, room);
    if ([...selectedImages.map((item) => item.file), ...candidates].reduce((total, file) => total + file.size, 0) > 12 * 1024 * 1024) {
      setImageError(lang === "ar" ? "إجمالي الصور المرفقة لازم مايزيدش عن 12 ميجابايت." : "The total attachment size must not exceed 12 MB.");
      return;
    }
    const added = candidates.map((file) => {
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.add(preview);
      return { file, preview };
    });
    if (valid.length > room) setImageError(lang === "ar" ? "مسموح بإرفاق 3 صور كحد أقصى." : "You can attach up to 3 images.");
    setSelectedImages((current) => [...current, ...added]);
  };

  const removeSelectedImage = (preview) => {
    URL.revokeObjectURL(preview);
    previewUrlsRef.current.delete(preview);
    setSelectedImages((current) => current.filter((image) => image.preview !== preview));
  };

  const imageHref = (url) => /^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`;

  return (
    <div className="flex flex-col h-full">
      <div dir="ltr" className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, i) => (
          <div key={i} dir="ltr" className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-up`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-zeus-gold/40 me-2 mt-0.5">
                <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="w-full h-full object-cover object-top" onError={withImageFallback} />
              </div>
            )}
            <div dir={lang === "ar" ? "rtl" : "ltr"} className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
              m.role === "user"
                ? "bg-zeus-gold text-zeus-midnight rounded-ee-sm font-medium"
                : "bg-card border border-border/60 rounded-es-sm"
            }`}>
              {m.images?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.images.map((image, imageIndex) => (
                    <a key={`${image}-${imageIndex}`} href={imageHref(image)} target="_blank" rel="noreferrer">
                      <img src={imageHref(image)} alt={lang === "ar" ? "صورة مرفقة" : "Attached image"} className="max-h-40 max-w-48 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {m.role === "assistant" && latestAssistant === m && animatedReply?.signature === `${m.ts || ""}:${m.content}`
                ? animatedReply.content
                : m.content}
              {m.retryable && onRetry && (
                <button type="button" onClick={onRetry} disabled={typing}
                  className="block mt-2 underline text-zeus-brightgold disabled:opacity-50">
                  {lang === "ar" ? "إعادة المحاولة" : "Retry"}
                </button>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-zeus-gold/40 me-2">
              <img src={ZEUS_IMAGES.avatar} alt="Zeus" className="w-full h-full object-cover object-top" onError={withImageFallback} />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-es-sm bg-card border border-border/60 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{lang === "ar" ? "زيوس بيفكر في كلامك وبيكتب..." : "ZEUS is thinking and typing..."}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zeus-gold animate-pulse-soft" />
              <span className="w-1.5 h-1.5 rounded-full bg-zeus-gold animate-pulse-soft" style={{ animationDelay: "0.2s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zeus-gold animate-pulse-soft" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
        {/* Interactive choices - show only for last assistant message when not typing */}
        {!typing && visibleOptions.length >= 2 && (
          <div dir="ltr" className="flex flex-wrap gap-2 justify-start ps-10 animate-fade-up">
            {visibleOptions.map((opt, idx) => (
              <button
                key={idx}
                disabled={typing || disabled}
                onClick={() => !typing && !disabled && onSelectOption && onSelectOption(opt)}
                className="px-4 py-2 rounded-full bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-sm font-medium hover:bg-zeus-gold hover:text-zeus-midnight hover:border-zeus-gold transition shadow-sm disabled:opacity-40"
              >
                {opt}
              </button>
            ))}
            <span className="w-full text-[11px] text-muted-foreground ps-1 mt-1">{lang === "ar" ? "اختر واحدة أو اكتب إجابتك ✏️" : "Choose one or type your answer ✏️"}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <label className="w-11 h-11 shrink-0 rounded-full bg-card border border-border/60 text-muted-foreground hover:text-zeus-gold flex items-center justify-center cursor-pointer transition has-[:disabled]:opacity-40" title={lang === "ar" ? "إرفاق صورة" : "Attach image"}>
          <Paperclip style={{ width: 18, height: 18 }} />
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={addImages} disabled={disabled || typing || uploadingImages || selectedImages.length >= MAX_CHAT_IMAGES} />
        </label>
        <input
          value={text}
          disabled={disabled || uploadingImages}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? (lang === "ar" ? "بتسمع..." : "Listening...") : placeholder}
          className="flex-1 px-4 py-3 rounded-full bg-card border border-border/60 focus:zeus-gold-border outline-none text-sm transition"
        />
        <button type="button" onClick={toggleSpeak} disabled={uploadingImages}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition ${
            speakEnabled ? "bg-zeus-gold/20 text-zeus-gold border border-zeus-gold/50" : "bg-card border border-border/60 text-muted-foreground hover:text-zeus-gold"
          }`}
          title={lang === "ar" ? "رد صوتي" : "Voice replies"}>
          {speakEnabled ? <Volume2 style={{ width: 18, height: 18 }} /> : <VolumeX style={{ width: 18, height: 18 }} />}
        </button>
        <button type="button" onClick={listening ? stopListening : startListening} disabled={uploadingImages}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition ${
            listening ? "bg-red-500 text-white animate-pulse" : "bg-card border border-border/60 text-muted-foreground hover:text-zeus-gold"
          }`}
          title={lang === "ar" ? "تحدث" : "Voice input"}>
          {listening ? <MicOff style={{ width: 18, height: 18 }} /> : <Mic style={{ width: 18, height: 18 }} />}
        </button>
        <button type="submit" disabled={typing || disabled || uploadingImages || (!text.trim() && !selectedImages.length)} className="w-11 h-11 shrink-0 rounded-full bg-zeus-gold text-zeus-midnight flex items-center justify-center hover:bg-zeus-brightgold transition disabled:opacity-40 shadow-gold-sm">
          {uploadingImages ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : <Send style={{ width: 18, height: 18 }} />}
        </button>
      </form>
      {(selectedImages.length > 0 || imageError) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {selectedImages.map(({ preview }) => (
            <div key={preview} className="relative">
              <img src={preview} alt={lang === "ar" ? "معاينة الصورة" : "Image preview"} className="h-14 w-14 rounded-lg object-cover" />
              <button type="button" onClick={() => removeSelectedImage(preview)} className="absolute -end-1 -top-1 rounded-full bg-black/80 p-1 text-white" aria-label={lang === "ar" ? "إزالة الصورة" : "Remove image"}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}
          {imageError && <p role="alert" className="flex items-center gap-1 text-xs text-destructive"><AlertCircle style={{ width: 13, height: 13 }} />{imageError}</p>}
        </div>
      )}
    </div>
  );
}