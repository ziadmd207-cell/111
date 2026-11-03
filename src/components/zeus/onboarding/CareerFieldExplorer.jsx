import { useMemo } from "react";
import { ArrowLeft, ArrowRight, BookOpen, BriefcaseBusiness, Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { CAREER_FIELDS, getFieldSearchTerms, getFieldText } from "@/data/careerFields";

const CATEGORY_LABELS = {
  web: ["الويب والبرمجيات", "Web & Software"],
  mobile: ["تطبيقات الموبايل", "Mobile Apps"],
  desktop: ["تطبيقات الكمبيوتر", "Desktop Apps"],
  data: ["البيانات", "Data"],
  ai: ["الذكاء الاصطناعي", "Artificial Intelligence"],
  security: ["الأمن", "Security"],
  cloud: ["السحابة والتشغيل", "Cloud & Operations"],
  testing: ["الاختبار والجودة", "Testing & Quality"],
  embedded: ["الأجهزة والأنظمة", "Devices & Systems"],
  ux: ["التصميم وتجربة المستخدم", "Design & User Experience"],
  game: ["الألعاب", "Games"],
};

export default function CareerFieldExplorer({
  isAr,
  onBack,
  onChoose,
  source = "discovery",
  query,
  onQueryChange,
  selectedId,
  onSelectedChange,
}) {
  const selected = CAREER_FIELDS.find((entry) => entry.id === selectedId);
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const DetailArrow = isAr ? ChevronLeft : ChevronRight;
  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return CAREER_FIELDS;
    return CAREER_FIELDS.filter((entry) => {
      const fieldText = [
        entry.id,
        entry.title.ar,
        entry.title.en,
        entry.summary.ar,
        entry.summary.en,
        ...(CATEGORY_LABELS[entry.category] || []),
      ];
      const matchesText = fieldText.some((value) => (
        normalized.length < 3
          ? value.toLocaleLowerCase() === normalized
          : value.toLocaleLowerCase().includes(normalized)
      ));
      const matchesAlias = getFieldSearchTerms(entry).some((value) => (
        value.toLocaleLowerCase() === normalized
        || (normalized.length >= 3 && value.toLocaleLowerCase().includes(normalized))
      ));
      return matchesText || matchesAlias;
    });
  }, [query]);

  const choose = (entry) => onChoose?.(entry.title[isAr ? "ar" : "en"]);

  return (
    <section className="mx-auto w-full max-w-6xl animate-fade-up" dir={isAr ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm font-medium hover:bg-secondary/50">
          <BackArrow className="h-4 w-4" />
          {isAr ? (source === "goal" ? "العودة لاختيار المسار" : "العودة للمحادثة") : (source === "goal" ? "Back to path selection" : "Back to conversation")}
        </button>
        <span className="text-xs text-muted-foreground">{isAr ? "دليل المجالات" : "Career field guide"}</span>
      </header>

      <div className="mx-auto max-w-3xl px-1 pb-8">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">{isAr ? "اختار براحتك" : "Explore at your pace"}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {isAr ? "افهم المجالات قبل ما تختار" : "Understand a field before you choose"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            {isAr
              ? "اقرأ عن طبيعة كل مجال وشغل أصحابه وأمثلة لمشاريعهم. المحتوى ثابت وتقدر ترجع له أو تقارن بين المجالات في أي وقت."
              : "Read what each field involves, what its practitioners do, and examples of their projects. This guide is always available when you want to compare paths."}
          </p>
        </div>

        <label className="mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onSelectedChange("");
            }}
            placeholder={isAr ? "ابحث باسم المجال..." : "Search by field name..."}
            aria-label={isAr ? "ابحث في المجالات" : "Search career fields"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        {selected ? (
          <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
            <button type="button" onClick={() => onSelectedChange("")} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <BackArrow className="h-4 w-4" /> {isAr ? "كل المجالات" : "All fields"}
            </button>
            <div className="mb-6 border-b border-border/60 pb-5">
              <p className="text-xs font-medium text-muted-foreground">{(CATEGORY_LABELS[selected.category] || [])[isAr ? 0 : 1]}</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{getFieldText(selected, "title", isAr)}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "summary", isAr)}</p>
            </div>

            <div className="space-y-6">
              <section>
                <h3 className="text-base font-semibold">{isAr ? "المجال ده معناه إيه؟" : "What is this field?"}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "about", isAr)}</p>
              </section>
              <section>
                <h3 className="text-base font-semibold">{isAr ? "الشغل فيه بيكون عامل إزاي؟" : "What does the work look like?"}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "work", isAr)}</p>
              </section>
              <section>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
                  {isAr ? "وظائف ممكن تشتغلها" : "Possible roles"}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {getFieldText(selected, "roles", isAr).map((role) => (
                    <li key={role} className="rounded-full border border-border/70 px-3 py-1.5 text-xs">{role}</li>
                  ))}
                </ul>
              </section>
              <section className="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
                <h3 className="text-base font-semibold">{isAr ? "مثال مشروع بالتفصيل" : "A project example"}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "project", isAr)}</p>
              </section>
              <section>
                <h3 className="text-base font-semibold">{isAr ? "إيه اللي هتتعلمه؟" : "What you will learn"}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{getFieldText(selected, "skills", isAr)}</p>
              </section>
              <section>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  {isAr ? "مصادر للقراءة والتعمّق" : "Further reading"}
                </h3>
                <ul className="mt-2 space-y-2">
                  {selected.sources.map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                        {link.title}<DetailArrow className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {source === "goal" ? (
              <button type="button" onClick={() => choose(selected)} className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90">
                <Check className="h-4 w-4" />
                {isAr ? "اختار المجال ده" : "Choose this field"}
              </button>
            ) : (
              <button type="button" onClick={onBack} className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border/70 px-5 text-sm font-semibold text-foreground transition hover:bg-secondary/50">
                <BackArrow className="h-4 w-4" />
                {isAr ? "خلصت قراءة؟ ارجع للمحادثة" : "Done reading? Return to chat"}
              </button>
            )}
          </article>
        ) : filteredFields.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredFields.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => onSelectedChange(entry.id)}
                className="group min-h-36 rounded-2xl border border-border/70 bg-card p-4 text-start transition hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-[11px] text-muted-foreground">{(CATEGORY_LABELS[entry.category] || [])[isAr ? 0 : 1]}</span>
                <span className="mt-1 flex items-center justify-between gap-2 text-base font-semibold">
                  {getFieldText(entry, "title", isAr)}
                  <DetailArrow className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">{getFieldText(entry, "summary", isAr)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
            {isAr ? "مفيش مجال بالاسم ده. جرّب كلمة تانية." : "No field found. Try another search."}
          </p>
        )}
      </div>
    </section>
  );
}
