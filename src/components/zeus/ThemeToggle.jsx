import React from "react";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function ThemeToggle({ className = "" }) {
  const { t } = useI18n();
  const [theme, setTheme] = React.useState(() => localStorage.getItem("zeus_theme") || "dark");

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("zeus_theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/70 bg-card/50 hover:bg-secondary/60 hover:zeus-gold-border transition ${className}`}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="text-zeus-gold" style={{ width: 14, height: 14 }} /> : <Moon className="text-zeus-gold" style={{ width: 14, height: 14 }} />}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}