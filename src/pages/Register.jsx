import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, Phone, UserRound } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useI18n } from "@/lib/i18n";

const PHONE_COUNTRIES = [
  { code: "EG", dial: "+20", name: { ar: "مصر", en: "Egypt" }, pattern: /^1[0125]\d{8}$/ },
  { code: "SA", dial: "+966", name: { ar: "السعودية", en: "Saudi Arabia" }, pattern: /^5\d{8}$/ },
  { code: "AE", dial: "+971", name: { ar: "الإمارات", en: "United Arab Emirates" }, pattern: /^5\d{8}$/ },
  { code: "BH", dial: "+973", name: { ar: "البحرين", en: "Bahrain" }, pattern: /^[36]\d{7}$/ },
  { code: "KW", dial: "+965", name: { ar: "الكويت", en: "Kuwait" }, pattern: /^[4569]\d{7}$/ },
  { code: "OM", dial: "+968", name: { ar: "عُمان", en: "Oman" }, pattern: /^[79]\d{7}$/ },
  { code: "QA", dial: "+974", name: { ar: "قطر", en: "Qatar" }, pattern: /^[3567]\d{7}$/ },
];

function normalizeDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩".indexOf(digit);
    return String(arabic >= 0 ? arabic : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
  });
}

export default function Register() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("EG");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError(isAr ? "البريد الإلكتروني وكلمة المرور مطلوبان." : "Email and password are required");
      return;
    }
    if (fullName.trim().length < 2) {
      setError(isAr ? "اكتب اسمك (حرفان على الأقل)." : "Enter your name (at least 2 characters).");
      return;
    }
    const country = PHONE_COUNTRIES.find((item) => item.code === phoneCountry);
    const normalizedPhone = normalizeDigits(phoneNumber).replace(/[\s().-]/g, "");
    if (!country || !country.pattern.test(normalizedPhone)) {
      setError(isAr ? "رقم الهاتف غير صحيح أو لا يطابق الدولة المختارة." : "Enter a valid phone number for the selected country.");
      return;
    }
    if (password !== confirmPassword) {
      setError(isAr ? "كلمتا المرور غير متطابقتين." : "Passwords do not match");
      return;
    }
    if (password.length < 6 || password.length > 72) {
      setError(isAr ? "يجب أن تتكون كلمة المرور من 6 إلى 72 حرفًا." : "Password must be 6-72 characters");
      return;
    }
    setLoading(true);
    try {
      await api.auth.register({ full_name: fullName.trim(), email, password, phone_country: phoneCountry, phone_number: normalizedPhone });
      // New accounts start pending: send to login with an activation notice.
      // Full reload so AuthContext re-checks the fresh token (SPA nav would
      // see stale logged-out state and bounce back to /login).
      window.location.href = "/login?pending=1";
    } catch (err) {
      setError(err.message || (isAr ? "تعذر إنشاء الحساب." : "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);
  const handleGoogle = async () => {
    setError("");
    const country = PHONE_COUNTRIES.find((item) => item.code === phoneCountry);
    const normalizedPhone = normalizeDigits(phoneNumber).replace(/[\s().-]/g, "");
    if (!fullName.trim() || fullName.trim().length < 2 || !country?.pattern.test(normalizedPhone)) {
      setError(isAr ? "أدخل اسمك ورقم هاتف صحيحًا قبل المتابعة باستخدام Google." : "Enter your name and a valid phone number before continuing with Google.");
      return;
    }
    setGoogleLoading(true);
    try {
      await api.auth.loginWithProvider("google", safeReturnTo(), { phone_country: phoneCountry, phone_number: normalizedPhone, full_name: fullName.trim() });
    } catch (err) {
      setError(err.message || (isAr ? "تسجيل الدخول باستخدام Google غير متاح حاليًا." : "Google login unavailable"));
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title={isAr ? "إنشاء حساب جديد" : "Create your account"}
      subtitle={isAr ? "ابدأ رحلتك التعليمية مع ZEUS" : "Sign up to get started"}
      footer={
        <>
          {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            {isAr ? "تسجيل الدخول" : "Log in"}
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2 text-start">
          <Label htmlFor="full-name">{isAr ? "الاسم بالكامل" : "Full name"}</Label>
          <div className="relative">
            <UserRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="full-name" type="text" autoComplete="name" maxLength={100} value={fullName}
              onChange={(e) => setFullName(e.target.value)} className="h-12 ps-10" required />
          </div>
        </div>
        <div className="space-y-2 text-start">
          <Label htmlFor="email">{isAr ? "البريد الإلكتروني" : "Email"}</Label>
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              dir="ltr"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <div className="space-y-2 text-start">
          <Label htmlFor="phone-country">{isAr ? "الدولة ورمز الاتصال" : "Country and calling code"}</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
            <select id="phone-country" value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}
              className="h-12 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              {PHONE_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name[lang]} ({country.dial})</option>)}
            </select>
            <div className="relative">
              <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="tel" inputMode="numeric" autoComplete="tel-national" dir="ltr" value={phoneNumber}
                onChange={(e) => setPhoneNumber(normalizeDigits(e.target.value).replace(/[^\d\s().-]/g, ""))}
                placeholder={phoneCountry === "EG" ? "10XXXXXXXX" : "5XXXXXXXX"} maxLength={14}
                className="h-12 ps-10" required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{isAr ? "أدخل الرقم المحلي بدون رمز الدولة؛ سيتم حفظه بالصيغة الدولية." : "Enter the local number without the country code; it will be stored internationally."}</p>
        </div>
        <div className="space-y-2 text-start">
          <Label htmlFor="password">{isAr ? "كلمة المرور" : "Password"}</Label>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <div className="space-y-2 text-start">
          <Label htmlFor="confirm">{isAr ? "تأكيد كلمة المرور" : "Confirm password"}</Label>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 ps-10"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {isAr ? "جارٍ إنشاء الحساب..." : "Creating account..."}
            </>
          ) : (
            isAr ? "إنشاء الحساب" : "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
