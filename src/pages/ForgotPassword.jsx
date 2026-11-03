import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useI18n } from "@/lib/i18n";

export default function ForgotPassword() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <AuthLayout
      icon={Mail}
      title={isAr ? "استعادة كلمة المرور" : "Reset password"}
      subtitle={isAr ? "استعادة كلمة المرور عبر البريد غير متاحة حاليًا" : "Email password reset is not available yet"}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="me-1 inline h-3 w-3" />{isAr ? "العودة لتسجيل الدخول" : "Back to log in"}
        </Link>
      }
    >
      <div role="status" className="rounded-xl border border-border/70 bg-secondary/30 p-4 text-center text-sm leading-relaxed text-muted-foreground">
        {isAr
          ? "لا يوجد نظام بريد لإرسال روابط الاستعادة حاليًا. تواصل مع الدعم للمساعدة؛ لن نعرض رسالة نجاح غير حقيقية."
          : "Password reset email is not configured. Contact support for help; this page will not pretend a reset email was sent."}
      </div>
    </AuthLayout>
  );
}
