import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Award, BarChart3, Bell, BookOpen, Briefcase, CalendarDays,
  Compass, CreditCard, Eye, FolderKanban, GraduationCap, Home, Loader2, MessageCircle,
  MessagesSquare, Settings, UserRound, Users,
} from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";

const TABS = [
  ["home", Home],
  ["roadmap", CalendarDays],
  ["learning", BookOpen],
  ["discovery", Compass],
  ["statistics", BarChart3],
  ["community", Users],
  ["projects", FolderKanban],
  ["career", Briefcase],
  ["cv", UserRound],
  ["profile", UserRound],
  ["notifications", Bell],
  ["companion", MessagesSquare],
  ["certificates", Award],
  ["subscriptions", CreditCard],
  ["settings", Settings],
  ["assessments", GraduationCap],
  ["support", MessageCircle],
];

export default function AdminUserPreview() {
  const { userId } = useParams();
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const Arrow = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelectedLesson(null);
    api.admin.get(`/users/${encodeURIComponent(userId)}/learning`)
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => {
        if (active) setError(loadError.message || (isAr ? "تعذر فتح معاينة حساب الطالب." : "Couldn't load the student account preview."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, isAr, reloadKey]);

  const lessonsByTrack = useMemo(() => {
    const groups = new Map();
    for (const lesson of data?.lessons || []) {
      if (!groups.has(lesson.roadmap_id)) groups.set(lesson.roadmap_id, []);
      groups.get(lesson.roadmap_id).push(lesson);
    }
    return groups;
  }, [data]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-zeus-gold" /></div>;
  }
  if (error || !data) {
    return (
      <main dir={dir} className="mx-auto max-w-3xl space-y-4 p-6">
        <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm text-zeus-brightgold"><Arrow className="h-4 w-4" />{isAr ? "العودة للمستخدمين" : "Back to users"}</Link>
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error || (isAr ? "بيانات الطالب غير متاحة." : "Student data is unavailable.")}</p>
        <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="rounded-xl border border-border/70 px-4 py-2 text-sm">{isAr ? "إعادة المحاولة" : "Retry"}</button>
      </main>
    );
  }

  const user = data.user || {};
  const completedLessons = (data.lessons || []).filter((lesson) => lesson.status === "completed" || lesson.quiz_passed).length;
  const completedTracks = (data.tracks || []).filter((track) => ["completed", "finished"].includes(track.status)).length;
  const quizAttempts = (data.lessons || []).flatMap((lesson) => (lesson.quiz_history || []).map((attempt) => ({
    ...attempt,
    lesson_title: lesson.title,
  }))).sort((a, b) => String(a.submitted_at || "").localeCompare(String(b.submitted_at || "")));
  const averageQuiz = quizAttempts.length
    ? Math.round(quizAttempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / quizAttempts.length)
    : 0;
  const portfolioUrl = user.portfolio_url ? `${window.location.origin}${user.portfolio_url}` : "";
  const text = (ar, en) => isAr ? ar : en;
  const tabLabels = {
    home: text("الرئيسية", "Home"),
    roadmap: text("الخطة والمسارات", "Roadmap"),
    learning: text("الدروس", "Lessons"),
    discovery: text("الاكتشاف", "Discover"),
    statistics: text("الإحصائيات", "Statistics"),
    community: text("المجتمع", "Community"),
    projects: text("المشاريع", "Projects"),
    career: text("المسار المهني", "Career"),
    cv: text("السيرة والبورتفوليو", "CV & portfolio"),
    profile: text("الملف الشخصي", "Profile"),
    notifications: text("الإشعارات", "Notifications"),
    companion: text("محادثات الذكاء الاصطناعي", "AI conversations"),
    certificates: text("الشهادات", "Certificates"),
    subscriptions: text("الاشتراكات", "Subscriptions"),
    settings: text("الإعدادات", "Settings"),
    assessments: text("اختبارات الجهة", "Partner exams"),
    support: text("الدعم", "Support"),
  };
  const visibleTabs = TABS.filter(([id]) => id !== "assessments" || user.role === "partner_student");

  return (
    <main dir={dir} className="min-h-screen bg-background px-4 py-5 sm:px-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Link to="/admin/users" className="inline-flex items-center gap-2 text-xs font-semibold text-zeus-brightgold hover:underline"><Arrow className="h-4 w-4" />{text("العودة لإدارة المستخدمين", "Back to user management")}</Link>
            <div className="flex items-center gap-3">
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zeus-gold/10 text-zeus-gold"><Eye className="h-5 w-5" /></span>}
              <div>
                <h1 className="font-heading text-2xl font-extrabold">{user.full_name || user.email}</h1>
                <p className="text-xs text-muted-foreground">{user.email} · {user.phone || text("لا يوجد هاتف", "No phone")} · {user.subscription_plan || "FREE"}</p>
              </div>
            </div>
          </div>
          {portfolioUrl && <a href={portfolioUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold hover:border-zeus-gold/50">{text("فتح البورتفوليو المنشور", "Open public portfolio")}</a>}
        </header>

        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
          <Eye className="h-4 w-4 shrink-0" />
          {text("معاينة إدارية للقراءة فقط — لا يتم تسجيل الدخول بحساب الطالب ولا يمكن تعديل بياناته من هنا.", "Admin read-only preview — this does not sign in as the student or allow changes to their account.")}
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label={text("صفحات حساب الطالب", "Student account pages")}>
          {visibleTabs.map(([id, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${tab === id ? "border-zeus-gold/60 bg-zeus-gold/10 text-zeus-brightgold" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />
              {tabLabels[id]}
            </button>
          ))}
        </nav>

        {tab === "home" && (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={text("الدروس المكتملة", "Lessons completed")} value={`${completedLessons}/${data.lessons?.length || 0}`} />
              <Metric label={text("المسارات المكتملة", "Tracks completed")} value={`${completedTracks}/${data.tracks?.length || 0}`} />
              <Metric label={text("المهارات المسجلة", "Tracked skills")} value={(data.skill_graph || []).length} />
              <Metric label={text("الإشعارات غير المقروءة", "Unread notifications")} value={(data.notifications || []).filter((item) => !item.read).length} />
            </div>
            <Panel title={text("بيانات الحساب", "Account details")}>
              <DataGrid items={[
                [text("الاسم", "Name"), user.full_name],
                [text("البريد", "Email"), user.email],
                [text("الهاتف", "Phone"), user.phone],
                [text("حالة الحساب", "Account status"), user.status],
                [text("الاشتراك", "Subscription"), `${user.subscription_plan || "FREE"} · ${user.subscription_status || "none"}`],
                [text("المجال الحالي", "Learning goal"), data.profile?.goal],
                [text("الوظيفة المستهدفة", "Target role"), data.profile?.current_role || data.profile?.career_intent],
                [text("مستوى التعلم", "Learning level"), data.profile?.current_level],
                [text("أسلوب التعلم", "Learning style"), data.profile?.learning_style],
                [text("اللغة المفضلة", "Preferred language"), data.profile?.preferred_language],
                [text("ساعات أسبوعية", "Weekly study hours"), data.profile?.weekly_hours],
                [text("أيام الدراسة", "Study days"), data.profile?.available_days],
                [text("وقت الدراسة المفضل", "Preferred study time"), data.profile?.preferred_time],
                [text("الدافع", "Motivation"), data.profile?.motivation],
                [text("العوائق", "Learning obstacles"), data.profile?.obstacles],
                [text("نقاط القوة", "Declared strengths"), data.profile?.strengths],
                [text("مجالات التحسين", "Growth areas"), data.profile?.weaknesses],
                [text("المهارات المعروفة", "Known skills"), data.profile?.known_skills],
                [text("المهارات المستهدفة", "Target skills"), data.profile?.target_skills],
                [text("التعليم", "Education"), data.profile?.education],
                [text("الخبرة", "Experience"), data.profile?.experience],
                [text("الخلفية", "Background"), data.profile?.background],
              ]} />
            </Panel>
            <Panel title={text("ملخص المسارات", "Track overview")}>
              <TrackList tracks={data.tracks || []} lessonsByTrack={lessonsByTrack} onSelectLesson={setSelectedLesson} isAr={isAr} />
            </Panel>
          </section>
        )}

        {tab === "roadmap" && (
          <section className="space-y-4">
            <Panel title={text("خطة التعلم والمسارات", "Learning plan and tracks")}>
              <TrackList tracks={data.tracks || []} lessonsByTrack={lessonsByTrack} onSelectLesson={setSelectedLesson} isAr={isAr} expanded />
            </Panel>
            {selectedLesson && <LessonPreview lesson={selectedLesson} isAr={isAr} onClose={() => setSelectedLesson(null)} />}
          </section>
        )}

        {tab === "learning" && (
          <section className="space-y-4">
            <Panel title={text("دروس الطالب", "Student lessons")}>
              {(data.lessons || []).length ? <div className="space-y-2">{data.lessons.map((lesson) => (
                <button key={lesson.id} type="button" onClick={() => setSelectedLesson(lesson)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/30 p-3 text-start hover:border-zeus-gold/40">
                  <span className="text-xs font-semibold">{lesson.title || lesson.node_id}</span>
                  <span className="text-[10px] text-muted-foreground">{text(`مرحلة ${lesson.phase}`, `Phase ${lesson.phase}`)} · {lesson.status} · {lesson.quiz_score ?? "—"}% {text("اختبار", "quiz")}</span>
                </button>
              ))}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد دروس مسجلة.", "No lessons recorded.")}</p>}
            </Panel>
            {selectedLesson && <LessonPreview lesson={selectedLesson} isAr={isAr} onClose={() => setSelectedLesson(null)} />}
          </section>
        )}

        {tab === "discovery" && (
          <section className="space-y-4">
            <Panel title={text("الاهتمامات والمسارات المقترحة", "Interests and suggested tracks")}>
              <DataGrid items={[
                [text("الهدف الحالي", "Current goal"), data.profile?.goal],
                [text("المسمى المستهدف", "Target role"), data.profile?.current_role || data.profile?.career_intent],
                [text("المستوى الحالي", "Current level"), data.profile?.current_level],
                [text("المهارات المعروفة", "Known skills"), data.profile?.known_skills],
                [text("المهارات المستهدفة", "Target skills"), data.profile?.target_skills],
              ]} />
              {(data.profile?.goal_recommendations || []).length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">{data.profile.goal_recommendations.map((item, index) => (
                  <article key={`${item.goal || item.title || "recommendation"}-${index}`} className="rounded-xl border border-border/40 bg-background/30 p-3">
                    <h3 className="text-xs font-semibold">{item.goal || item.title || text("مجال مقترح", "Suggested field")}</h3>
                    {item.reason && <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>}
                  </article>
                ))}</div>
              )}
            </Panel>
          </section>
        )}

        {tab === "statistics" && (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={text("محاولات الكويز", "Quiz attempts")} value={quizAttempts.length} />
              <Metric label={text("متوسط الدرجات", "Average quiz score")} value={`${averageQuiz}%`} />
              <Metric label={text("اجتياز الكويزات", "Passed quizzes")} value={quizAttempts.filter((attempt) => attempt.passed).length} />
              <Metric label={text("نقاط تحسين", "Weak topics")} value={(data.weak_topics || []).length} />
            </div>
            <Panel title={text("تطور درجات الاختبارات", "Quiz score history")}>
              {quizAttempts.length ? <div className="flex h-48 items-end gap-2 overflow-x-auto border-b border-border/50 px-1 pb-1">
                {quizAttempts.slice(-16).map((attempt, index) => {
                  const score = Math.max(0, Math.min(100, Number(attempt.score || 0)));
                  return <div key={`${attempt.lesson_title}-${attempt.submitted_at}-${index}`} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1" title={`${attempt.lesson_title}: ${score}%`}>
                    <span className="text-[9px] text-muted-foreground">{score}</span>
                    <div className={`w-full max-w-10 rounded-t-md ${attempt.passed ? "bg-emerald-500/80" : "bg-amber-500/80"}`} style={{ height: `${Math.max(3, score)}%` }} />
                    <span className="max-w-12 truncate text-[8px] text-muted-foreground">{attempt.lesson_title}</span>
                  </div>;
                })}
              </div> : <p className="text-xs text-muted-foreground">{text("لا توجد درجات اختبارات مسجلة بعد.", "No quiz scores recorded yet.")}</p>}
            </Panel>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={text("موضوعات تحتاج مراجعة", "Topics to review")}>
                {(data.weak_topics || []).length ? <div className="space-y-2">{data.weak_topics.slice(0, 10).map((item) => <div key={item.topic} className="flex items-center justify-between gap-3 rounded-lg bg-rose-500/5 px-3 py-2"><span className="truncate text-xs font-medium">{item.topic}</span><span className="shrink-0 text-[10px] text-rose-300">{item.incorrect_answers} {text("إجابة خاطئة", "incorrect answers")}</span></div>)}</div> : <p className="text-xs text-muted-foreground">{text("لا تظهر نقاط ضعف متكررة حتى الآن.", "No repeated weak topics detected yet.")}</p>}
              </Panel>
              <Panel title={text("موضوعات متقنة", "Strengths")}>
                {(data.strength_topics || []).length ? <div className="flex flex-wrap gap-2">{data.strength_topics.slice(0, 10).map((item) => <span key={item.topic} className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] text-emerald-300">{item.topic} · {item.correct}/{item.questions}</span>)}</div> : <p className="text-xs text-muted-foreground">{text("لم تتوفر محاولات كافية لتحديد نقاط القوة.", "Not enough quiz attempts to identify strengths yet.")}</p>}
              </Panel>
            </div>
            <Panel title={text("المهارات المسجلة", "Tracked skills")}>
              {(data.skill_graph || []).length ? <div className="space-y-2">{data.skill_graph.map((skill, index) => <div key={`${skill.skill}-${index}`} className="grid grid-cols-[minmax(0,1fr)_2fr_40px] items-center gap-3 text-xs"><span className="truncate">{skill.skill}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-zeus-gold" style={{ width: `${Math.min(100, Math.max(0, Number(skill.level || 0)))}%` }} /></div><span className="text-end text-muted-foreground">{Number(skill.level || 0)}%</span></div>)}</div> : <p className="text-xs text-muted-foreground">{text("لا توجد مهارات مسجلة حتى الآن.", "No skills recorded yet.")}</p>}
            </Panel>
          </section>
        )}

        {tab === "community" && (
          <section className="space-y-4">
            <Panel title={text("المجتمعات التي ينتمي إليها", "Joined communities")}>
              {(data.communities || []).length ? <div className="grid gap-3 sm:grid-cols-2">{data.communities.map((community) => (
                <article key={community.id} className="rounded-xl border border-border/50 bg-background/30 p-3">
                  <h3 className="text-sm font-semibold">{community.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{community.goal || "—"} · {community.stage || "—"}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{community.is_closed ? text("المجتمع مغلق", "Community is closed") : text("المجتمع مفتوح", "Community is open")} · {community.member_count} {text("عضو", "members")}</p>
                </article>
              ))}</div> : <p className="text-sm text-muted-foreground">{text("لا ينتمي الطالب إلى مجتمعات.", "The student has not joined a community.")}</p>}
            </Panel>
            <Panel title={text("رسائل المجتمعات", "Community messages")}>
              <MessageList items={(data.community_messages || []).map((item) => ({
                title: `${item.community_name || text("مجتمع", "Community")} · ${item.user_name || (item.is_student_message ? user.full_name : text("عضو", "Member"))}${item.is_student_message ? text(" (الطالب)", " (student)") : ""}`,
                body: item.text || (item.attachments || []).map((attachment) => attachment.name || attachment.url).join(", "),
                date: item.created_date,
              }))} isAr={isAr} />
            </Panel>
          </section>
        )}

        {tab === "projects" && (
          <section className="space-y-4">
            <Panel title={text("مشاريع الطالب", "Student projects")}>
              {(data.projects || []).length ? <div className="grid gap-3 md:grid-cols-2">{data.projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد مشاريع محفوظة.", "No projects saved.")}</p>}
            </Panel>
            <Panel title={text("تسليمات مشاريع الدروس", "Lesson project submissions")}>
              {(data.lessons || []).filter((lesson) => lesson.project_submission).length ? <div className="space-y-2">{data.lessons.filter((lesson) => lesson.project_submission).map((lesson) => (
                <article key={lesson.id} className="rounded-xl border border-border/50 p-3">
                  <h3 className="text-xs font-semibold">{lesson.title}</h3>
                  {lesson.project_submission.text && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{lesson.project_submission.text}</p>}
                  {lesson.project_submission.url && /^https?:\/\//i.test(lesson.project_submission.url) && <a href={lesson.project_submission.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-zeus-brightgold underline">{text("فتح رابط التسليم", "Open submission")}</a>}
                  {lesson.project_submission.feedback && <p className="mt-2 text-xs text-muted-foreground">{lesson.project_submission.feedback}</p>}
                </article>
              ))}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد تسليمات مشاريع.", "No project submissions.")}</p>}
            </Panel>
          </section>
        )}

        {tab === "career" && (
          <section className="space-y-4">
            <Panel title={text("المسار المهني", "Career page")}>
              <DataGrid items={[
                [text("الوظيفة المستهدفة", "Target role"), data.profile?.current_role || data.profile?.career_intent],
                [text("المجال", "Field"), data.profile?.goal],
                [text("المهارات المسجلة", "Tracked skills"), (data.skill_graph || []).map((skill) => skill.skill)],
                [text("مهارات قيد التعلم", "Skills in progress"), data.skills_in_progress],
              ]} />
              <p className="text-xs text-muted-foreground">{text("قوائم الوظائف في صفحة الطالب تُجلب وقت الطلب ولا تُحفظ كسجل؛ لذلك لا تظهر هنا وظائف قديمة غير محفوظة.", "Job listings are fetched on demand and are not stored as a history, so unsaved previous listings are not shown here.")}</p>
              {portfolioUrl && <a href={portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold text-zeus-brightgold hover:border-zeus-gold/50">{text("معاينة البورتفوليو المنشور", "Preview published portfolio")}</a>}
            </Panel>
          </section>
        )}

        {tab === "cv" && (
          <section className="space-y-4">
            {data.cv ? <CVCard cv={data.cv} isAr={isAr} /> : <Panel title={text("السيرة الذاتية", "CV")}><p className="text-sm text-muted-foreground">{text("لم ينشئ الطالب سيرة ذاتية بعد.", "The student has not created a CV yet.")}</p></Panel>}
            {portfolioUrl && <Panel title={text("البورتفوليو المنشور", "Published portfolio")}><a href={portfolioUrl} target="_blank" rel="noreferrer" className="text-sm text-zeus-brightgold underline">{portfolioUrl}</a></Panel>}
          </section>
        )}

        {tab === "profile" && (
          <Panel title={text("الملف الشخصي للطالب", "Student profile")}>
            <DataGrid items={[
              [text("الاسم", "Name"), user.full_name],
              [text("البريد الإلكتروني", "Email"), user.email],
              [text("الهاتف", "Phone"), user.phone],
              [text("الدور", "Account role"), user.role],
              [text("التعليم", "Education"), data.profile?.education],
              [text("الخبرة", "Experience"), data.profile?.experience],
              [text("الخلفية", "Background"), data.profile?.background],
              [text("نبذة السيرة الذاتية", "CV summary"), data.cv?.summary],
            ]} />
          </Panel>
        )}

        {tab === "notifications" && (
          <Panel title={text("إشعارات الطالب", "Student notifications")}>
            <MessageList items={(data.notifications || []).map((item) => ({
              title: item.title,
              body: item.body,
              date: item.created_date,
              label: item.read ? text("مقروء", "Read") : text("جديد", "Unread"),
            }))} isAr={isAr} />
          </Panel>
        )}

        {tab === "companion" && (
          <section className="space-y-4">
            <Panel title={text("محادثات مدرس الدروس والمراجعة", "Lesson tutor and review conversations")}>
              {(data.tutor_chats || []).length ? <div className="max-h-[32rem] space-y-3 overflow-y-auto">{data.tutor_chats.map((chat, index) => <article key={`${chat.type}-${chat.lesson_id || index}`} className="rounded-xl border border-border/50 p-3"><h3 className="mb-2 text-xs font-bold">{chat.lesson_title || text("مدرس المراجعة", "Review tutor")}</h3><MessageList items={(chat.messages || []).map((message) => ({ title: message.role === "user" ? text("الطالب", "Student") : text("المدرس", "Tutor"), body: message.content, date: message.ts }))} isAr={isAr} /></article>)}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد محادثات مسجلة.", "No tutor conversations recorded.")}</p>}
            </Panel>
            <Panel title={text("محادثات الذكاء الاصطناعي الأخرى", "Other AI conversations")}>
              {(data.conversations || []).length ? <div className="max-h-[32rem] space-y-3 overflow-y-auto">{data.conversations.map((chat, index) => <article key={`${chat.type}-${index}`} className="rounded-xl border border-border/50 p-3"><h3 className="mb-2 text-xs font-bold">{chat.type}</h3><MessageList items={(chat.messages || []).map((message) => ({ title: message.role === "user" ? text("الطالب", "Student") : text("المساعد", "Assistant"), body: message.content, date: message.ts }))} isAr={isAr} /></article>)}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد محادثات أخرى.", "No other conversations.")}</p>}
            </Panel>
          </section>
        )}

        {tab === "certificates" && (
          <Panel title={text("شهادات الطالب", "Student certificates")}>
            {(data.certificates || []).length ? <div className="space-y-2">{data.certificates.map((certificate) => (
              <article key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
                <div><h3 className="text-xs font-semibold">{certificate.title}</h3><p className="text-[10px] text-muted-foreground">{certificate.file_name} · {certificate.created_date?.slice(0, 10)}</p></div>
                <a href={`/certificate/${encodeURIComponent(certificate.share_token)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-border/60 px-3 py-2 text-xs text-zeus-brightgold">{text("فتح الشهادة", "Open certificate")}</a>
              </article>
            ))}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد شهادات صادرة.", "No certificates issued.")}</p>}
          </Panel>
        )}

        {tab === "subscriptions" && (
          <section className="space-y-4">
            <Panel title={text("الباقة الحالية", "Current plan")}>
              <DataGrid items={[
                [text("الخطة", "Plan"), user.subscription_plan || "FREE"],
                [text("الحالة", "Status"), user.subscription_status || "—"],
              ]} />
            </Panel>
            <Panel title={text("سجل الاشتراكات والطلبات", "Subscription and request history")}>
              {(data.subscription_history || []).length ? <div className="space-y-2">{data.subscription_history.map((item) => (
                <article key={item.id} className="grid gap-2 rounded-xl border border-border/50 p-3 sm:grid-cols-4">
                  <span className="text-xs font-semibold">{item.plan}</span>
                  <span className="text-xs">{item.amount} EGP</span>
                  <span className="text-xs text-muted-foreground">{item.status}</span>
                  <span className="text-[10px] text-muted-foreground">{item.start_date?.slice(0, 10) || "—"} – {item.expires_at?.slice(0, 10) || "—"}</span>
                  {/^https?:\/\//i.test(item.payment_image_url || "") && <a href={item.payment_image_url} target="_blank" rel="noreferrer" className="text-[10px] text-zeus-brightgold underline">{text("فتح الإيصال", "View receipt")}</a>}
                </article>
              ))}</div> : <p className="text-sm text-muted-foreground">{text("لا يوجد سجل طلبات اشتراك.", "No subscription requests recorded.")}</p>}
            </Panel>
          </section>
        )}

        {tab === "settings" && (
          <Panel title={text("إعدادات الحساب والتعلم (عرض فقط)", "Account and learning settings (read-only)")}>
            <DataGrid items={[
              [text("البريد", "Email"), user.email],
              [text("الهاتف", "Phone"), user.phone],
              [text("الباقة", "Plan"), user.subscription_plan],
              [text("حالة الاشتراك", "Subscription status"), user.subscription_status],
              [text("لغة التعلم", "Learning language"), data.profile?.preferred_language],
              [text("أسلوب التعلم", "Learning style"), data.profile?.learning_style],
              [text("مدة الجلسة", "Session length"), data.profile?.session_length],
              [text("الساعات الأسبوعية", "Weekly hours"), data.profile?.weekly_hours],
              [text("أيام الدراسة", "Study days"), data.profile?.available_days],
              [text("وقت الدراسة", "Study time"), data.profile?.preferred_time],
              [text("تفضيل الفيديو", "Video preference"), data.profile?.video_preference],
            ]} />
          </Panel>
        )}

        {tab === "assessments" && (
          <Panel title={text("اختبارات الجهة ونتائجها", "Partner assessments and results")}>
            {(data.exam_results || []).length ? <div className="space-y-3">{data.exam_results.map((exam) => (
              <article key={exam.assessment_id} className="rounded-xl border border-border/50 p-3">
                <h3 className="text-xs font-semibold">{exam.title} · {exam.kind}</h3>
                {(exam.attempts || []).length ? <div className="mt-2 space-y-1">{exam.attempts.map((attempt, index) => <p key={`${attempt.submitted_date}-${index}`} className="text-[11px] text-muted-foreground">{text("محاولة", "Attempt")} {index + 1}: {attempt.score}/{attempt.total_points} ({attempt.percentage}%) · {attempt.submitted_date?.slice(0, 10)}</p>)}</div> : <p className="mt-2 text-[11px] text-muted-foreground">{text("لم يُجر الاختبار بعد.", "Not attempted yet.")}</p>}
              </article>
            ))}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد اختبارات مسجلة للطالب.", "No assessments found for this student.")}</p>}
          </Panel>
        )}

        {tab === "support" && (
          <section className="space-y-4">
            <Panel title={text("محادثات دعم الطالب", "Student support conversations")}>
              {(data.support_chats || []).length ? <div className="max-h-[32rem] space-y-3 overflow-y-auto">{data.support_chats.map((chat) => <article key={chat.id} className="rounded-xl border border-border/50 p-3"><h3 className="mb-2 text-xs font-bold">{text("حالة المحادثة:", "Chat status:")} {chat.status}</h3><MessageList items={(chat.messages || []).map((message) => ({ title: message.sender_type, body: message.text || (message.attachments || []).map((item) => item.name || item.url).join(", "), date: message.created_date }))} isAr={isAr} /></article>)}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد محادثات دعم.", "No support conversations.")}</p>}
            </Panel>
            <Panel title={text("طلبات الدعم", "Support requests")}>
              {(data.support_requests || []).length ? <div className="space-y-2">{data.support_requests.map((request) => (
                <article key={request.id} className="rounded-xl border border-border/50 p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground"><span>{request.status}</span><time>{request.created_date?.slice(0, 10)}</time></div>
                  <p className="mt-2 whitespace-pre-wrap text-xs">{request.problem}</p>
                  {(request.attachments || []).length > 0 && <p className="mt-2 break-all text-[10px] text-muted-foreground">{text("المرفقات:", "Attachments:")} {request.attachments.map((item) => typeof item === "string" ? item : item.name || item.url || "").filter(Boolean).join(", ")}</p>}
                </article>
              ))}</div> : <p className="text-sm text-muted-foreground">{text("لا توجد طلبات دعم.", "No support requests.")}</p>}
            </Panel>
          </section>
        )}
      </div>
    </main>
  );
}

function Panel({ title, children }) {
  return <section className="zeus-glass space-y-3 rounded-2xl border border-border/60 p-4 sm:p-5"><h2 className="font-heading text-sm font-bold">{title}</h2>{children}</section>;
}

function Metric({ label, value }) {
  return <div className="zeus-glass rounded-xl border border-border/50 p-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-extrabold text-zeus-brightgold">{value}</p></div>;
}

function DataGrid({ items }) {
  return <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{items.filter(([, value]) => value != null && value !== "").map(([label, value]) => <div key={label} className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="break-words text-sm">{Array.isArray(value) ? value.join(", ") : value}</p></div>)}</div>;
}

function TrackList({ tracks, lessonsByTrack, onSelectLesson, isAr, expanded = false }) {
  return tracks.length ? <div className="space-y-3">{tracks.map((track) => {
    const lessons = lessonsByTrack.get(track.id) || [];
    return <details key={track.id} open={expanded} className="rounded-xl border border-border/50 bg-background/30 p-3">
      <summary className="cursor-pointer text-xs font-bold">{track.goal} · {track.status} · {track.lessons_completed}/{track.lessons_total} {isAr ? "درسًا" : "lessons"} · {track.capstone_completed ? (isAr ? "مشروع التخرج مكتمل" : "Capstone complete") : (isAr ? "مشروع التخرج غير مكتمل" : "Capstone pending")}</summary>
      <div className="mt-3 space-y-2">{lessons.map((lesson) => <button key={lesson.id} type="button" onClick={() => onSelectLesson(lesson)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2 text-start hover:border-zeus-gold/40">
        <span className="text-xs font-semibold">{lesson.title || lesson.node_id}</span>
        <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground">
          {lesson.video_title && <span>{lesson.video_watched ? "✓ " : ""}{Math.min(100, Math.round((lesson.video_watched_sec || 0) / (lesson.video_duration || 1) * 100))}% {isAr ? "فيديو" : "video"}</span>}
          {lesson.quiz_score != null && <span>{lesson.quiz_score}% quiz</span>}
          <span>{lesson.status}</span>
        </span>
      </button>)}</div>
    </details>;
  })}</div> : <p className="text-sm text-muted-foreground">{isAr ? "لا توجد مسارات." : "No learning tracks."}</p>;
}

function LessonPreview({ lesson, isAr, onClose }) {
  const title = isAr ? "تفاصيل الدرس" : "Lesson details";
  const videoLink = /^https?:\/\//i.test(lesson.video_url || "") ? lesson.video_url : "";
  return <Panel title={title}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{lesson.title}</h3><button type="button" onClick={onClose} className="rounded-lg border border-border/60 px-3 py-1 text-xs">{isAr ? "إغلاق" : "Close"}</button></div>
    <p className="text-xs text-muted-foreground">{lesson.status} · {isAr ? "الاختبار:" : "Quiz:"} {lesson.quiz_score ?? "—"}% · {lesson.video_watched_sec || 0}/{lesson.video_duration || 0} {isAr ? "ثانية مشاهدة" : "seconds watched"}</p>
    {videoLink && <a href={videoLink} target="_blank" rel="noreferrer" className="text-xs text-zeus-brightgold underline">{lesson.video_title || (isAr ? "فتح فيديو الدرس" : "Open lesson video")}</a>}
    {lesson.summary && <div><h4 className="mb-1 text-xs font-bold">{isAr ? "الملخص" : "Summary"}</h4><p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{lesson.summary}</p></div>}
    {lesson.reading_content && <details className="rounded-xl border border-border/40 p-3"><summary className="cursor-pointer text-xs font-semibold">{isAr ? "شرح الدرس" : "Lesson explanation"}</summary><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{lesson.reading_content}</div></details>}
    {lesson.task_details?.description && <div><h4 className="mb-1 text-xs font-bold">{isAr ? "التطبيق أو المشروع" : "Practice or project"}</h4><p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{lesson.task_details.description}</p></div>}
    {lesson.project_submission && <div className="rounded-lg border border-border/40 p-3"><h4 className="mb-1 text-xs font-bold">{isAr ? "تسليم الطالب" : "Student submission"}</h4>{lesson.project_submission.text && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{lesson.project_submission.text}</p>}{lesson.project_submission.url && /^https?:\/\//i.test(lesson.project_submission.url) && <a href={lesson.project_submission.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zeus-brightgold underline">{lesson.project_submission.url}</a>}{lesson.project_submission.feedback && <p className="mt-2 text-xs text-muted-foreground">{lesson.project_submission.feedback}</p>}</div>}
    {(lesson.resources || []).length > 0 && <div><h4 className="mb-1 text-xs font-bold">{isAr ? "مصادر الدرس" : "Lesson resources"}</h4><ul className="space-y-1">{lesson.resources.map((resource, index) => <li key={index} className="text-xs">{/^https?:\/\//i.test(resource.url || "") ? <a href={resource.url} target="_blank" rel="noreferrer" className="text-zeus-brightgold underline">{resource.title || resource.url}</a> : (resource.title || resource.url)}</li>)}</ul></div>}
    {(lesson.quiz_history || []).length > 0 && <div><h4 className="mb-1 text-xs font-bold">{isAr ? "محاولات الاختبار" : "Quiz attempts"}</h4>{lesson.quiz_history.map((attempt, index) => <details key={`${attempt.submitted_at || index}`} className="mb-2 rounded-lg border border-border/40 p-2"><summary className="cursor-pointer text-xs">{attempt.score}% · {attempt.passed ? (isAr ? "ناجح" : "Passed") : (isAr ? "لم يجتز" : "Not passed")}</summary><ul className="mt-2 space-y-2 text-[11px]">{attempt.feedback.map((answer, answerIndex) => <li key={answerIndex} className="border-s-2 border-border/50 ps-2"><p>{answer.question}</p><p className="text-muted-foreground">{isAr ? "إجابة الطالب:" : "Student:"} {answer.student_answer}</p>{!answer.correct && <p className="text-emerald-400">{isAr ? "الصحيحة:" : "Correct:"} {answer.correct_answer}</p>}</li>)}</ul></details>)}</div>}
  </Panel>;
}

function CVCard({ cv, isAr }) {
  const projects = cv.projects || [];
  return <Panel title={isAr ? "السيرة الذاتية والبورتفوليو" : "CV and portfolio"}>
    <div className="space-y-3">
      <DataGrid items={[
        [isAr ? "الاسم" : "Name", cv.full_name],
        [isAr ? "المسمى الوظيفي" : "Professional title", cv.title_role],
        [isAr ? "البريد" : "Email", cv.email],
        [isAr ? "الهاتف" : "Phone", cv.phone],
        [isAr ? "الموقع" : "Location", cv.location],
        [isAr ? "لينكدإن" : "LinkedIn", cv.linkedin],
        [isAr ? "جيت هب" : "GitHub", cv.github],
      ]} />
      {cv.summary && <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{cv.summary}</p>}
      <div><h3 className="mb-2 text-xs font-bold">{isAr ? "المهارات" : "Skills"}</h3><div className="flex flex-wrap gap-1.5">{(cv.skills || []).map((skill, index) => <span key={index} className="rounded-full bg-zeus-gold/10 px-2.5 py-1 text-[10px] text-zeus-brightgold">{typeof skill === "string" ? skill : skill.name}</span>)}</div></div>
      {["experiences", "education", "certifications"].map((section) => <div key={section}><h3 className="mb-2 text-xs font-bold">{section === "experiences" ? (isAr ? "الخبرات" : "Experience") : section === "education" ? (isAr ? "التعليم" : "Education") : (isAr ? "الشهادات" : "Certifications")}</h3>{(cv[section] || []).map((item, index) => <p key={index} className="mb-1 text-xs text-muted-foreground">{item.role || item.degree || item.name || item.title || item.institution || item.issuer || JSON.stringify(item)}{item.description ? ` — ${item.description}` : ""}</p>)}</div>)}
      {projects.length > 0 && <div><h3 className="mb-2 text-xs font-bold">{isAr ? "مشاريع السيرة" : "CV projects"}</h3>{projects.map((project, index) => <article key={project.source_project_id || index} className="mb-2 rounded-lg border border-border/40 p-3"><h4 className="text-xs font-semibold">{project.title}</h4><p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{project.description}</p>{/^https?:\/\//i.test(project.link || "") && <a href={project.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] text-zeus-brightgold underline">{isAr ? "رابط المشروع" : "Project link"}</a>}</article>)}</div>}
    </div>
  </Panel>;
}

function ProjectCard({ project }) {
  return <article className="overflow-hidden rounded-xl border border-border/50 bg-background/30">
    {project.images?.[0] && <img src={project.images[0]} alt="" className="h-36 w-full object-cover" />}
    <div className="space-y-2 p-3"><h3 className="text-sm font-bold">{project.title}</h3><p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{project.description}</p>{project.link && /^https?:\/\//i.test(project.link) && <a href={project.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-zeus-brightgold underline">{project.link}</a>}</div>
  </article>;
}

function MessageList({ items, isAr }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد نشاط." : "No activity."}</p>;
  return <div className="max-h-[24rem] space-y-2 overflow-y-auto">{items.map((item, index) => <article key={`${item.date || item.title}-${index}`} className="rounded-lg border border-border/40 bg-background/20 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold">{item.title || (isAr ? "رسالة" : "Message")}</span><time className="text-[9px] text-muted-foreground">{item.date ? new Date(item.date).toLocaleString(isAr ? "ar-EG" : "en-US") : ""}</time></div>{item.label && <span className="text-[9px] text-zeus-brightgold">{item.label}</span>}<p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.body}</p></article>)}</div>;
}
