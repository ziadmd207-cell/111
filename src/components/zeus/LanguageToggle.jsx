import React from "react";
import { useI18n } from "@/lib/i18n";

export default function LanguageToggle({ className = "" }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-card/50 hover:bg-secondary/60 hover:zeus-gold-border transition ${className}`}
    >
      <span lang={lang === "ar" ? "en" : "ar"}>{lang === "ar" ? "English" : "العربية"}</span>
    </button>
  );
}