import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useI18n } from "@/lib/i18n";

function getLoginQueryError(lang) {
  try {
    const params = new URLSearchParams(window.location.search);
    const accessError = params.get("access_error");
    const isAr = lang === "ar";
    const accessMessages = isAr
      ? {
          inactive: "انتهى اشتراكك أو تم إيقافه. سجّل الدخول بعد تجديد الاشتراك.",
          suspended: "الحساب موقوف مؤقتًا. تواصل مع الدعم للمساعدة.",
          pending: "حسابك في انتظار التفعيل من الإدارة.",
          session_expired: "انتهت صلاحية جلستك. سجّل الدخول مرة أخرى.",
        }
      : {
          inactive: "Your subscription has ended or was stopped. Sign in again after renewing.",
          suspended: "Your account is temporarily suspended. Contact support for help.",
          pending: "Your account is waiting for admin activation.",
          session_expired: "Your session expired. Please sign in again.",
        };
    if (accessError) return accessMessages[accessError] || (isAr ? "يلزم تسجيل الدخول للمتابعة." : "Please sign in to continue.");

    const googleError = params.get("google_error");
    if (!googleError) return null;
    const googleMessages = isAr
      ? {
          phone_required: "أدخل رقم هاتفك من صفحة إنشاء الحساب للمتابعة باستخدام Google.",
          phone_in_use: "رقم الهاتف مرتبط بحساب آخر.",
          pending: "حسابك في انتظار التفعيل من الإدارة.",
          suspended: "الحساب موقوف مؤقتًا. تواصل مع الدعم للمساعدة.",
          account_mismatch: "هذا البريد الإلكتروني مرتبط بحساب Google مختلف.",
        }
      : {
          phone_required: "Enter your phone number on the sign-up page to continue with Google.",
          phone_in_use: "This phone number is already linked to another account.",
          pending: "Your account is waiting for admin activation.",
          suspended: "Your account is temporarily suspended. Contact support for help.",
          account_mismatch: "This email is linked to a different Google account.",
        };
    return googleMessages[googleError] || (isAr ? `تعذر تسجيل الدخول باستخدام Google (${googleError}). حاول مرة أخرى.` : `Google sign-in failed (${googleError}) — please try again`);
  } catch {
    return null;
  }
}

export default function Login() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => getLoginQueryError(lang) || "");
  useEffect(() => {
    const queryError = getLoginQueryError(lang);
    if (queryError) setError(queryError);
  }, [lang]);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const justRegistered = (() => {
    try { return new URLSearchParams(window.location.search).get("pending") === "1"; } catch { return false; }
  })();
  const needsRenewal = (() => {
    try { return new URLSearchParams(window.location.search).get("access_error") === "inactive"; } catch { return false; }
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
      if (data?.user?.role === "partner") {
        window.location.href = "/partner";
        return;
      }
      if (data?.user?.role === "doctor") {
        window.location.href = "/doctor";
        return;
      }
      if (data?.user?.role === "partner_student") {
        window.location.href = "/app";
        return;
      }
      window.location.href = returnTo !== "/" ? returnTo : "/onboarding";
    } catch (err) {
      setError(err.message || (isAr ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "Invalid email or password"));
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
      setError(err.message || (isAr ? "تسجيل الدخول باستخدام Google غير متاح حاليًا." : "Google login unavailable"));
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title={isAr ? "أهلًا بعودتك" : "Welcome back"}
      subtitle={isAr ? "سجّل الدخول إلى حسابك" : "Log in to your account"}
      footer={
        <>
          {isAr ? "ليس لديك حساب؟ " : "Don't have an account? "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            {isAr ? "أنشئ حسابًا" : "Create one"}
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
        <GoogleIcon className="me-2 h-5 w-5" />
        {googleLoading ? (isAr ? "جارٍ التحويل إلى Google…" : "Redirecting to Google…") : (isAr ? "المتابعة باستخدام Google" : "Continue with Google")}
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">{isAr ? "أو" : "or"}</span>
        </div>
      </div>

      {justRegistered && !error && (
        <div className="mb-4 p-3 rounded-lg bg-zeus-gold/10 border border-zeus-gold/30 text-zeus-brightgold text-sm">
          {isAr ? "تم إنشاء حسابك بنجاح — حسابك في انتظار التفعيل قبل تسجيل الدخول." : "Your account was created and is waiting for activation before you can log in."}
        </div>
      )}

      {(() => {
        if (!error) return null;
        const suspended = /اتوقف|موقوف|suspend/i.test(error);
        const pending = !suspended && /انتظار|تفعيل|pending/i.test(error);
        if (suspended || pending) {
          return (
            <div role={pending ? "status" : "alert"} className={`mb-4 p-4 rounded-xl border text-sm leading-relaxed ${suspended ? "bg-red-500/10 border-red-500/40 text-red-300" : "bg-zeus-gold/10 border-zeus-gold/40 text-zeus-brightgold"}`}>
              <div className="mb-1 font-bold">{suspended ? (isAr ? "الحساب موقوف مؤقتًا" : "Account temporarily suspended") : (isAr ? "الحساب بانتظار التفعيل" : "Account awaiting activation")}</div>
              <div>{error}</div>
            </div>
          );
        }
        return (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
            {needsRenewal && <Link to="/subscriptions" className="ms-2 font-semibold underline">
              {isAr ? "عرض الباقات وتجديد الاشتراك" : "View plans and renew"}
            </Link>}
          </div>
        );
      })()}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2 text-start">
          <Label htmlFor="email">{isAr ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}</Label>
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="text"
              autoComplete="username"
              autoFocus
              dir="ltr"
              placeholder={isAr ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <div className="space-y-2 text-start">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">{isAr ? "كلمة المرور" : "Password"}</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {isAr ? "جارٍ تسجيل الدخول..." : "Logging in..."}
            </>
          ) : (
            isAr ? "تسجيل الدخول" : "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
