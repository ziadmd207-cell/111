import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    try {
      const g = new URLSearchParams(window.location.search).get("google_error");
      return g ? `Google sign-in failed (${g}) — please try again` : "";
    } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const justRegistered = (() => {
    try { return new URLSearchParams(window.location.search).get("pending") === "1"; } catch { return false; }
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.auth.loginViaEmailPassword(email, password);
      // Admins live in their own console, never in user pages/onboarding
      if (data && data.user && data.user.role === "admin") {
        window.location.href = "/admin";
        return;
      }
      window.location.href = returnTo !== "/" ? returnTo : "/onboarding";
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await api.auth.loginWithProvider("google", returnTo);
    } catch (err) {
      setError(err.message || "Google login unavailable");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
        disabled={googleLoading}
        type="button"
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {justRegistered && !error && (
        <div className="mb-4 p-3 rounded-lg bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-sm">
          { "تم إنشاء حسابك بنجاح — بانتظار تفعيل الأدمن قبل أول دخول." }
        </div>
      )}

      {(() => {
        if (!error) return null;
        const suspended = /اتوقف|موقوف|suspend/i.test(error);
        const pending = !suspended && /انتظار|تفعيل|pending/i.test(error);
        if (suspended || pending) {
          return (
            <div className={`mb-4 p-4 rounded-xl border text-sm leading-relaxed ${suspended ? "bg-red-500/10 border-red-500/40 text-red-300" : "bg-zeus-gold/10 border-zeus-gold/40 text-zeus-brightgold"}`}>
              <div className="font-bold mb-1">{suspended ? "🚫 الحساب موقوف مؤقتًا" : "⏳ الحساب بانتظار التفعيل"}</div>
              <div>{error}</div>
            </div>
          );
        }
        return (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        );
      })()}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
