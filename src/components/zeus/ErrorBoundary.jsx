import React from "react";
import { RefreshCw } from "lucide-react";

const MSGS = [
  "يبدو أن زوس تعثر! لا تقلق، يحدث هذا أحياناً.",
  "حصل خطأ صغير، جرّب تاني 🙏",
  "عذراً! حدث شيء غير متوقع. دعنا نجرب بديل.",
];

export default function FriendlyError({ onRetry }) {
  const msg = MSGS[Math.floor(Math.random() * MSGS.length)];
  return (
    <div className="zeus-glass p-8 rounded-2xl text-center">
      <div className="text-6xl mb-4">🤖</div>
      <h2 className="font-heading text-xl mb-2">حدث مشكلة صغيرة</h2>
      <p className="text-muted-foreground mb-6 text-sm">{msg}</p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 px-6 py-3 bg-zeus-gold text-zeus-midnight rounded-full font-semibold hover:bg-zeus-brightgold transition">
        <RefreshCw style={{ width: 18, height: 18 }} /> أعد المحاولة ببديل
      </button>
    </div>
  );
}
