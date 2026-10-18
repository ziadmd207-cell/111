import React, { useState, useEffect } from "react";
import { Briefcase, Loader2, FileText, FolderKanban, Copy, Check, ExternalLink, RefreshCw, Rocket, Link as LinkIcon } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";
import { Link } from "react-router-dom";

export default function Career() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [projects, setProjects] = useState([]);
  const [cv, setCv] = useState(null);
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState("");
  const [copied, setCopied] = useState(false);

  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const [p, c, u] = await Promise.all([
          api.entities.Project.filter({}, "-created_date", 50).catch(() => []),
          api.entities.CV.filter({}, "-created_date", 1).catch(() => []),
          api.auth.me().catch(() => null)
        ]);
        setProjects(Array.isArray(p) ? p : []);
        if (Array.isArray(c) && c.length) setCv(c[0]);
        setUser(u);
      } catch (e) {
        setLoadError(e.message || "Failed to load career data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const portfolioUrl = user ? `${window.location.origin}/portfolio/${user.id}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(portfolioUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadJobs = async () => {
    setJobLoading(true);
    setJobError("");
    try {
      const res = await api.functions.invoke("searchJobs", { profile, cv, lang });
      const data = res.data || res;
      const jobs = data.jobs || [];
      setJobs(jobs);
      if (!jobs.length) {
        setJobError(isAr ? "ملقتش وظائف دلوقتي — دوس تحديث وحاول تاني." : "No jobs found right now — hit refresh and retry.");
      }
    } catch (e) {
      setJobError(isAr ? "تعثر البحث عن وظائف — دوس تحديث وحاول تاني." : "Job search stumbled — hit refresh and retry.");
    }
    setJobLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;
  if (loadError && !projects.length && !cv) return (
    <div dir={dir} className="zeus-glass p-10 text-center">
      <p className="text-sm text-muted-foreground mb-2">{isAr ? "تعذر تحميل المسار المهني" : "Career failed to load"}</p>
      <p className="text-xs text-destructive mb-4">{loadError}</p>
      <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight text-sm font-semibold">{isAr ? "إعادة المحاولة" : "Retry"}</button>
    </div>
  );

  const completedProjects = projects.filter((p) => p.status === "completed");

  return (
    <div dir={dir} className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl flex items-center gap-2"><Briefcase className="text-zeus-gold" style={{ width: 28, height: 28 }} /> {isAr ? "مسارك المهني" : "Career Hub"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{isAr ? "سيرتك، بورتفوليو، وفرص شغل مناسبة ليك" : "Your CV, portfolio, and matched job opportunities"}</p>
      </div>

      {/* Portfolio Link */}
      {portfolioUrl && (
        <div className="zeus-glass p-5">
          <div className="flex items-center gap-2 mb-3"><LinkIcon className="text-zeus-gold" style={{ width: 18, height: 18 }} /><h2 className="font-heading font-bold text-sm">{isAr ? "لينك البورتفوليو بتاعك" : "Your Portfolio Link"}</h2></div>
          <p className="text-xs text-muted-foreground mb-3">{isAr ? "شارك اللينك ده مع الشركات — هيقدروا يشوفوا مشاريعك ومهاراتك بدون تسجيل." : "Share this link with employers — they can view your projects and skills without signing up."}</p>
          <div className="flex gap-2">
            <input value={portfolioUrl} readOnly className="flex-1 px-4 py-3 rounded-xl bg-card border border-border/60 text-sm text-muted-foreground truncate" />
            <button onClick={copyLink} className="px-4 rounded-xl bg-zeus-gold text-zeus-midnight font-medium text-sm hover:bg-zeus-brightgold transition inline-flex items-center gap-1.5 shrink-0">
              {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />} {copied ? (isAr ? "اتنسخ" : "Copied") : (isAr ? "انسخ" : "Copy")}
            </button>
            <a href={portfolioUrl} target="_blank" rel="noreferrer" className="px-4 rounded-xl bg-card border border-border/60 text-sm hover:zeus-gold-border transition inline-flex items-center gap-1.5 shrink-0">
              <ExternalLink style={{ width: 16, height: 16 }} />
            </a>
          </div>
        </div>
      )}

      {/* CV + Projects */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/cv-builder" className="zeus-glass p-5 hover:zeus-gold-border transition group">
          <FileText className="text-zeus-gold mb-3" style={{ width: 24, height: 24 }} />
          <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "السيرة الذاتية" : "CV Builder"}</h3>
          <p className="text-xs text-muted-foreground">{cv ? (isAr ? "سيرتك جاهزة — تقدر تعدّلها" : "Your CV is ready — edit it") : (isAr ? "ابني سيرتك الذاتية" : "Build your CV")}</p>
        </Link>
        <Link to="/projects" className="zeus-glass p-5 hover:zeus-gold-border transition group">
          <FolderKanban className="text-zeus-gold mb-3" style={{ width: 24, height: 24 }} />
          <h3 className="font-heading font-bold text-sm mb-1">{isAr ? "مشاريعي" : "My Projects"}</h3>
          <p className="text-xs text-muted-foreground">{isAr ? `${completedProjects.length} مشروع مكتمل` : `${completedProjects.length} completed projects`}</p>
        </Link>
      </div>

      {/* Jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-bold text-sm flex items-center gap-2"><Briefcase className="text-zeus-gold" style={{ width: 16, height: 16 }} /> {isAr ? "وظائف مناسبة ليك" : "Recommended Jobs"}</h2>
          <button onClick={loadJobs} disabled={jobLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zeus-gold/40 text-zeus-brightgold text-xs font-medium hover:bg-zeus-gold/10 transition disabled:opacity-50">
            {jobLoading ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <RefreshCw style={{ width: 14, height: 14 }} />} {isAr ? "تحديث" : "Refresh"}
          </button>
        </div>
        {jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job, i) => (
              <div key={i} className="zeus-glass p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-heading font-bold text-sm">{job.title}</h3>
                    <p className="text-xs text-muted-foreground">{job.company} · {job.location}</p>
                  </div>
                  <span className="text-zeus-gold font-bold text-lg shrink-0">{job.match_score}%</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{job.description}</p>
                {job.required_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {job.required_skills.map((s, j) => (
                      <span key={j} className="px-2 py-0.5 rounded-full bg-zeus-gold/10 text-zeus-brightgold text-[11px]">{s}</span>
                    ))}
                  </div>
                )}
                {job.missing_skills?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mb-3">{isAr ? "مهارات ناقصة:" : "Missing skills:"} {job.missing_skills.join("، ")}</p>
                )}
                {(job.apply_url || job.url) && (
                  <a href={job.apply_url || job.url} target="_blank" rel="noreferrer" className="mt-1 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold">
                    {isAr ? "تقدم على الوظيفة" : "Apply for this job"} <ExternalLink style={{ width: 15, height: 15 }} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="zeus-glass p-8 text-center">
            <Briefcase className="text-muted-foreground/40 mx-auto mb-3" style={{ width: 32, height: 32 }} />
            <p className="text-sm text-muted-foreground mb-4">{jobError || (isAr ? "اضغط تحديث عشان أبحث عن وظائف مناسبة ليك" : "Click refresh to search for matching jobs")}</p>
            <button onClick={loadJobs} disabled={jobLoading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50">
              {jobLoading ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Rocket style={{ width: 16, height: 16 }} />} {isAr ? "ابحث عن وظائف" : "Search Jobs"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}