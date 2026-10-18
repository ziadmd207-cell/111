import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

export default function ChatPanel({ messages, onSend, onRetry, typing, disabled = false, placeholder, companionName, t, lang, options, onSelectOption }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [animatedReply, setAnimatedReply] = useState(null);
  const endRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastSpokenRef = useRef(null);
  const previousReplyRef = useRef(null);
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.retryable);
  const visibleOptions = Array.isArray(options)
    ? [...new Set(options.filter((option) => typeof option === "string" && option.trim().length >= 3).map((option) => option.trim()))]
    : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

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

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || typing || disabled) return;
    onSend(v);
    setText("");
  };

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
        <input
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? (lang === "ar" ? "بتسمع..." : "Listening...") : placeholder}
          className="flex-1 px-4 py-3 rounded-full bg-card border border-border/60 focus:zeus-gold-border outline-none text-sm transition"
        />
        <button type="button" onClick={toggleSpeak}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition ${
            speakEnabled ? "bg-zeus-gold/20 text-zeus-gold border border-zeus-gold/50" : "bg-card border border-border/60 text-muted-foreground hover:text-zeus-gold"
          }`}
          title={lang === "ar" ? "رد صوتي" : "Voice replies"}>
          {speakEnabled ? <Volume2 style={{ width: 18, height: 18 }} /> : <VolumeX style={{ width: 18, height: 18 }} />}
        </button>
        <button type="button" onClick={listening ? stopListening : startListening}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition ${
            listening ? "bg-red-500 text-white animate-pulse" : "bg-card border border-border/60 text-muted-foreground hover:text-zeus-gold"
          }`}
          title={lang === "ar" ? "تحدث" : "Voice input"}>
          {listening ? <MicOff style={{ width: 18, height: 18 }} /> : <Mic style={{ width: 18, height: 18 }} />}
        </button>
        <button type="submit" disabled={typing || disabled || !text.trim()} className="w-11 h-11 shrink-0 rounded-full bg-zeus-gold text-zeus-midnight flex items-center justify-center hover:bg-zeus-brightgold transition disabled:opacity-40 shadow-gold-sm">
          <Send style={{ width: 18, height: 18 }} />
        </button>
      </form>
    </div>
  );
}