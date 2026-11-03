import React from "react";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ThemeToggle({ className = "" }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [theme, setTheme] = React.useState(() => {
    try { return localStorage.getItem("zeus_theme") || "dark"; } catch { return "dark"; }
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("zeus_theme", theme); } catch (error) {
      console.error("Unable to save the selected theme", error);
    }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-card/50 hover:bg-secondary/60 hover:zeus-gold-border transition ${className}`}
      type="button"
      aria-label={theme === "dark" ? (isAr ? "تفعيل المظهر الفاتح" : "Switch to light mode") : (isAr ? "تفعيل المظهر الداكن" : "Switch to dark mode")}
      title={theme === "dark" ? (isAr ? "المظهر الفاتح" : "Light mode") : (isAr ? "المظهر الداكن" : "Dark mode")}
    >
      {theme === "dark" ? <Sun className="text-zeus-gold" style={{ width: 14, height: 14 }} /> : <Moon className="text-zeus-gold" style={{ width: 14, height: 14 }} />}
      {theme === "dark" ? (isAr ? "فاتح" : "Light") : (isAr ? "داكن" : "Dark")}
    </button>
  );
}