import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const token = q.get("token");
      const to = q.get("to") || "/onboarding";
      const gerr = q.get("google_error");
      if (gerr) {
        const map = {
          suspended: "🚫 حسابك موقوف مؤقتًا — تواصل مع الإدارة.",
          pending: "⏳ حسابك بانتظار التفعيل.",
        };
        setError(map[gerr] || `Google login failed (${gerr})`);
        setTimeout(() => { window.location.href = "/login"; }, 2500);
        return;
      }
      if (!token) {
        setError("Missing login token from Google.");
        setTimeout(() => { window.location.href = "/login"; }, 2000);
        return;
      }
      api.auth.setToken(token);
      try { localStorage.setItem("zeus_auth", "true"); } catch {}
      window.location.href = to.startsWith("/") ? to : "/onboarding";
    } catch (e) {
      setError(e.message);
    }
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      {!error ? (
        <>
          <Loader2 className="animate-spin text-zeus-gold" style={{ width: 32, height: 32 }} />
          <p className="text-sm text-muted-foreground">Completing Google sign-in…</p>
        </>
      ) : (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
