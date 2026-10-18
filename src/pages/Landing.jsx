import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Brain, Map, Rocket, Briefcase, Users, Zap, Search, Compass, Shuffle, Hammer, FileText, GitCompare } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/api/client";
import Logo from "@/components/zeus/Logo";
import LanguageToggle from "@/components/zeus/LanguageToggle";
import ThemeToggle from "@/components/zeus/ThemeToggle";
import { ZEUS_IMAGES, withImageFallback } from "@/lib/zeus-images";

const PROBLEMS = [
  { icon: Search, ar: { title: "مش عارف نقاط قوتك وضعفك", desc: "ميعرفش إيه اللي بيجيده فعلاً وإيه المهارات اللي محتاج يطوّرها." }, en: { title: "Doesn't know their strengths", desc: "Doesn't know what they excel at and what skills need development." } },
  { icon: Compass, ar: { title: "مش عارف يبدأ منين", desc: "محتار يتعلم إيه وأنهي مجال أو Track يناسبه." }, en: { title: "Doesn't know where to start", desc: "Confused about what to learn and which field fits them." } },
  { icon: Shuffle, ar: { title: "تشتت بين المجالات والمصادر", desc: "كل فترة بيغير الـ Roadmap بسبب كتر المحتوى والمصادر." }, en: { title: "Scattered across fields", desc: "Keeps changing their roadmap due to overwhelming content and sources." } },
  { icon: Hammer, ar: { title: "مش عارف يبني خبرة حقيقية", desc: "بيتعلم نظري بس ومش عارف يبني مشاريع تثبت مهاراته." }, en: { title: "Can't build real experience", desc: "Learns theory but doesn't know what to build to prove skills." } },
  { icon: FileText, ar: { title: "صعب عليه تجهيز Portfolio وCV", desc: "مالوش حد يساعده يختار المشاريع ويظبطها ويجهزها بشكل احترافي." }, en: { title: "Hard to prepare Portfolio & CV", desc: "No one to help select, organize, and present projects professionally." } },
  { icon: Briefcase, ar: { title: "فرص الشغل متوزعة", desc: "بيبحث في أماكن كتير ومش عارف أنهي فرصة تناسبه فعلاً." }, en: { title: "Job opportunities are scattered", desc: "Searches multiple platforms and can't tell which jobs truly fit." } }
];

const STEPS = [
  { icon: Brain, ar: { title: "اكتشف نفسك", desc: "محادثة ذكية بتفهم مشاكلك، اهتماماتك، نقاط قوتك وضعفك، طريقة تفكيرك، وتحدد المجالات الأقرب ليك." }, en: { title: "Discover Yourself", desc: "A smart conversation that understands your problems, interests, strengths, and thinking style to find your best fields." } },
  { icon: GitCompare, ar: { title: "افهم مجالك", desc: "ZEUS بيقارن بين المجالات اللي محتار فيها ويوضح أنهي أنسب ليك بناءً على شخصيتك ومهاراتك." }, en: { title: "Understand Your Field", desc: "ZEUS compares fields you're unsure about and shows which fits best based on your personality and skills." } },
  { icon: Map, ar: { title: "ابنِ مسارك", desc: "Roadmap شخصية تبدأ من مستواك وتبني مهاراتك تدريجيًا بمشاريع واختبارات ومراحل واضحة." }, en: { title: "Build Your Path", desc: "A personal roadmap from your level, building skills gradually with projects, tests, and clear stages." } },
  { icon: Rocket, ar: { title: "جهّزك لسوق العمل", desc: "بناء وتقييم المشاريع، تجهيز CV وPortfolio، واقتراح وظائف مناسبة لملفك الشخصي." }, en: { title: "Career Ready", desc: "Build & evaluate projects, prepare CV and portfolio, and get matched with suitable jobs." } }
];

export default function Landing() {
  const { t, lang, dir } = useI18n();
  const nav = useNavigate();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  // Stay on Landing - don't auto redirect, let user click Start
  // useEffect removed to keep Home visible first

  const start = async () => {
    const authed = await api.auth.isAuthenticated();
    nav(authed ? "/app" : "/register");
  };

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="landing-page min-h-screen" dir={dir}>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="landing-logo flex h-11 items-center rounded-xl px-3 shadow-sm">
            <Logo size={28} />
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => nav("/subscriptions")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-zeus-gold/40 text-zeus-brightgold text-xs font-bold hover:bg-zeus-gold/10 transition"
            >
              {isAr ? "الاشتراكات" : "Subscriptions"}
            </button>
            <LanguageToggle />
            <ThemeToggle />
            <button onClick={start} className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold hover:bg-zeus-brightgold transition shadow-gold-sm">
              {t("landing.cta.start")} <Arrow style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 zeus-grid-bg opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" />
        <div className="relative max-w-7xl mx-auto px-5 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zeus-gold/30 bg-zeus-gold/10 text-zeus-brightgold text-xs font-medium mb-6">
              <Zap style={{ width: 14, height: 14 }} /> {isAr ? "من التعلّم لسوق العمل" : "From Learning to Career"}
            </div>
            <h1 className="font-heading font-extrabold text-4xl lg:text-6xl leading-[1.1] tracking-tight">
              {isAr ? <>رحلتك من <span className="zeus-gold-text">التعلّم لسوق العمل</span></> : <>From Learning <span className="zeus-gold-text">to Your Career</span></>}
            </h1>
            <p className="mt-5 text-muted-foreground text-lg max-w-xl leading-relaxed">
              {isAr
                ? "ZEUS بيساعدك تختار مجالك، تكتشف نقاط قوتك والجوانب اللي تطورها، وتبني مهاراتك بمشاريع حقيقية — عشان تجهّز نفسك لأول وظيفة بخطة مخصصة ليك."
                : "ZEUS helps you choose a field, discover your strengths and growth areas, and build skills through real projects — with a personalized plan to prepare for your first job."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={start} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold hover:bg-zeus-brightgold transition shadow-gold">
                {t("landing.cta.start")} <Arrow style={{ width: 18, height: 18 }} />
              </button>
              <button onClick={() => scrollTo("how")} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-border bg-card/50 hover:zeus-gold-border transition font-medium">
                {t("landing.cta.how")}
              </button>
            </div>
          </div>
          <div className="relative animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 -z-10 blur-3xl bg-zeus-gold/15 rounded-full" />
              <img src={ZEUS_IMAGES.hero} alt="Zeus Robot" className="relative w-full max-w-md mx-auto rounded-3xl shadow-2xl" onError={withImageFallback} />
            </div>
          </div>
        </div>
      </section>

      {/* Why ZEUS */}
      <section className="py-20 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle eyebrow={isAr ? "ليه ZEUS" : "Why ZEUS"} title={isAr ? "المشاكل اللي بنحلها" : "Problems We Solve"} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {PROBLEMS.map((p, i) => {
              const Icon = p.icon;
              const data = isAr ? p.ar : p.en;
              return (
                <div key={i} className="zeus-glass p-5 hover:zeus-gold-border transition">
                  <div className="w-10 h-10 rounded-xl bg-zeus-gold/10 flex items-center justify-center mb-3">
                    <Icon className="text-zeus-gold" style={{ width: 20, height: 20 }} />
                  </div>
                  <h3 className="font-heading font-bold text-sm mb-1">{data.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">{data.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle eyebrow={isAr ? "إزاي بيشتغل" : "How it works"} title={isAr ? "رحلتك في 4 خطوات" : "Your Journey in 4 Steps"} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const data = isAr ? s.ar : s.en;
              return (
                <div key={i} className="relative zeus-glass p-6 hover:zeus-gold-border transition group">
                  <span className="absolute top-4 end-4 text-5xl font-heading font-extrabold text-zeus-gold/10 group-hover:text-zeus-gold/20 transition">{i + 1}</span>
                  <div className="w-12 h-12 rounded-xl bg-zeus-gold/15 flex items-center justify-center mb-4">
                    <Icon className="text-zeus-gold" style={{ width: 24, height: 24 }} />
                  </div>
                  <h3 className="font-heading font-bold text-base mb-1.5">{data.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{data.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Community */}
      <section className="py-20 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionTitle align="start" eyebrow={isAr ? "مجتمع ذكي" : "Smart Community"} title={t("landing.community.title")} />
            <p className="text-muted-foreground mt-4 leading-relaxed">
              {isAr
                ? "ZEUS بيربط المتعلّمين اللي ليهم نفس الهدف ونفس المرحلة في مجتمعات تعلّم صغيرة — عشان تتعلموا سوا، تشاركوا مصادر، وتحتفلوا بالإنجازات."
                : "ZEUS connects learners with the same goal and stage into small learning communities — to learn together, share resources, and celebrate milestones."}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-3 rtl:space-x-reverse">
                {["#FFC107","#FFD54F","#FFE9A3","#3B4A66"].map((c, i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-background flex items-center justify-center text-white font-bold text-xs" style={{ background: c }}>{["A","M","S","K"][i]}</div>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">{isAr ? "+24 متعلّم على نفس المسار" : "+24 learners on the same path"}</span>
            </div>
          </div>
          <CommunityCard isAr={isAr} />
        </div>
      </section>

      {/* Career */}
      <section className="py-20 border-t border-border/40">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle eyebrow={isAr ? "من التعلّم للشغل" : "Learning to Career"} title={t("landing.career.title")} />
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
            {[
              { icon: Map, label: isAr ? "خريطة" : "Roadmap" },
              { icon: Rocket, label: isAr ? "مشاريع" : "Projects" },
              { icon: FileText, label: isAr ? "سيرة ذاتية" : "CV" },
              { icon: Briefcase, label: isAr ? "وظائف" : "Jobs" }
            ].map((s, i, arr) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2 px-5 py-3 rounded-full zeus-gold-border bg-zeus-gold/5">
                    <Icon className="text-zeus-gold" style={{ width: 18, height: 18 }} />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  {i < arr.length - 1 && <Arrow className="text-zeus-gold/40" style={{ width: 18, height: 18 }} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}

function SectionTitle({ eyebrow, title, align = "center" }) {
  return (
    <div className={align === "center" ? "text-center" : "text-start"}>
      <div className="text-zeus-gold text-sm font-semibold uppercase tracking-wider mb-2">{eyebrow}</div>
      <h2 className="font-heading font-extrabold text-3xl lg:text-4xl">{title}</h2>
    </div>
  );
}

function CommunityCard({ isAr }) {
  return (
    <div className="zeus-glass p-6 rounded-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-muted-foreground">{isAr ? "مجتمع" : "Community"}</div>
          <div className="font-heading font-bold">{isAr ? "هندسة الذكاء الاصطناعي — مسار المبتدئين" : "AI Engineering — Beginner Track"}</div>
        </div>
        <div className="text-zeus-gold font-bold text-2xl">94%</div>
      </div>
      <div className="space-y-3">
        {[["Python", 82], ["Math", 54], ["ML", 31]].map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-xs mb-1"><span>{k}</span><span className="text-muted-foreground">{v}%</span></div>
            <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-zeus-gold to-zeus-brightgold rounded-full" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 text-xs text-muted-foreground">
        <Users style={{ width: 14, height: 14 }} className="text-zeus-gold" /> {isAr ? "24 متعلّم على نفس المرحلة" : "24 learners at the same stage"}
      </div>
    </div>
  );
}