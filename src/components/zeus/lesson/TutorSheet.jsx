import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot } from "lucide-react";
import ChatPanel from "@/components/zeus/ChatPanel";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

export default function TutorSheet({ open, onClose, messages, onSend, typing, isAr, t, lang }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/60 z-40" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border/60 rounded-t-3xl flex flex-col"
            style={{ height: "80vh" }}
          >
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-zeus-gold/40">
                  <img src={ZEUS_IMAGES.avatar} alt="Tutor" className="w-full h-full object-cover object-top" onError={withImageFallback} />
                </div>
                <div>
                  <div className="font-heading font-bold text-sm">{isAr ? "مدرّبك الذكي" : "AI Tutor"}</div>
                  <div className="text-[10px] text-muted-foreground">{isAr ? "اسأل عن أي حاجة في الدرس" : "Ask about anything in this lesson"}</div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary/40 transition">
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <ChatPanel messages={messages} onSend={onSend} typing={typing}
                placeholder={isAr ? "اكتب سؤالك..." : "Type your question..."}
                companionName="AI Tutor" t={t} lang={lang} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}