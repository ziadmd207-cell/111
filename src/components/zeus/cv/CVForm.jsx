import React, { useState } from "react";
import { Plus, Trash2, User, Mail, Phone, MapPin, Linkedin, Github, FileText, Briefcase, GraduationCap, Wrench, Languages, Award, Sparkles, Loader2, Wand2 } from "lucide-react";
import { api } from "@/api/client";
import { useProfile } from "@/lib/ProfileContext";

export default function CVForm({ cv, setCv, isAr }) {
  const { profile } = useProfile();
  const set = (k, v) => setCv({ ...cv, [k]: v });
  const setArr = (k, i, field, v) => {
    const next = [...(cv[k] || [])];
    next[i] = { ...next[i], [field]: v };
    setCv({ ...cv, [k]: next });
  };
  const add = (k, item) => setCv({ ...cv, [k]: [...(cv[k] || []), item] });
  const remove = (k, i) => setCv({ ...cv, [k]: (cv[k] || []).filter((_, x) => x !== i) });

  const [aiLoading, setAiLoading] = useState(false);

  const syncSkills = () => {
    const profileSkills = (profile?.skill_graph || []).map((s) => ({ name: s.skill, category: s.skill }));
    const existing = (cv.skills || []).map((s) => s.name);
    const newSkills = profileSkills.filter((s) => !existing.includes(s.name));
    set("skills", [...(cv.skills || []), ...newSkills]);
  };

  const rewriteSummary = async () => {
    if (!cv.summary?.trim()) return;
    setAiLoading(true);
    try {
      // CV is English-only: always rewrite in English regardless of UI lang
      const res = await api.functions.invoke("rewriteSummary", { summary: cv.summary, isAr: false });
      const data = res.data || res;
      if (data.rewritten) set("summary", data.rewritten);
    } catch (e) {}
    setAiLoading(false);
  };

  const [projLoading, setProjLoading] = useState(null);
  const rewriteProject = async (i) => {
    const p = (cv.projects || [])[i];
    if (!p?.description?.trim()) return;
    setProjLoading(i);
    try {
      const res = await api.functions.invoke("rewriteProjectDescription", { description: p.description, isAr: false });
      const data = res.data || res;
      if (data.rewritten) setArr("projects", i, "description", data.rewritten);
    } catch (e) {}
    setProjLoading(null);
  };

  return (
    <div className="space-y-5">
      <Card title={isAr ? "بيانات التواصل" : "Contact"} icon={User}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input icon={User} placeholder={isAr ? "الاسم بالكامل" : "Full name"} value={cv.full_name || ""} onChange={(v) => set("full_name", v)} />
          <Input icon={Briefcase} placeholder={isAr ? "المسمى الوظيفي" : "Professional title"} value={cv.title_role || ""} onChange={(v) => set("title_role", v)} />
          <Input icon={Mail} placeholder="Email" value={cv.email || ""} onChange={(v) => set("email", v)} />
          <Input icon={Phone} placeholder={isAr ? "الهاتف" : "Phone"} value={cv.phone || ""} onChange={(v) => set("phone", v)} />
          <Input icon={MapPin} placeholder={isAr ? "الموقع" : "Location"} value={cv.location || ""} onChange={(v) => set("location", v)} />
          <Input icon={Linkedin} placeholder="LinkedIn URL" value={cv.linkedin || ""} onChange={(v) => set("linkedin", v)} />
          <Input icon={Github} placeholder="GitHub URL" value={cv.github || ""} onChange={(v) => set("github", v)} />
        </div>
      </Card>

      <Card title={isAr ? "ملخص مهني" : "Professional Summary"} icon={FileText}
        action={<button onClick={rewriteSummary} disabled={aiLoading || !cv.summary?.trim()} className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold disabled:opacity-50">
          {aiLoading ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />} {isAr ? "إعادة صياغة بالإنجليزية" : "Rewrite in English"}
        </button>}>
        <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
          <p>{isAr ? "💡 جاوب على الأسئلة دي وأنا أعيد صياغتها:" : "💡 Answer these prompts and I'll rewrite them:"}</p>
          <p>{isAr ? "• إيه دورك الحالي وكم سنة خبرة؟" : "• Your current role and years of experience?"}</p>
          <p>{isAr ? "• إيه أهم مهاراتك ونقاط قوتك؟" : "• Your key skills and strengths?"}</p>
          <p>{isAr ? "• بتدور على إيه؟" : "• What are you looking for?"}</p>
        </div>
        <textarea value={cv.summary || ""} onChange={(e) => set("summary", e.target.value)} rows={4}
          placeholder={isAr ? "اكتب إجاباتك هنا أو نقاط مختصرة..." : "Write your answers here or bullet points..."}
          className="w-full rounded-lg bg-secondary/30 border border-border/60 px-3 py-2 text-sm focus:outline-none focus:zeus-gold-border" />
      </Card>

      <Card title={isAr ? "الخبرات" : "Experience"} icon={Briefcase} onAdd={() => add("experiences", { role: "", company: "", start: "", end: "", description: "" })}>
        {(cv.experiences || []).map((exp, i) => (
          <Repeatable key={i} onRemove={() => remove("experiences", i)}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder={isAr ? "المسمى" : "Role"} value={exp.role} onChange={(v) => setArr("experiences", i, "role", v)} />
              <Input placeholder={isAr ? "الشركة" : "Company"} value={exp.company} onChange={(v) => setArr("experiences", i, "company", v)} />
              <Input placeholder={isAr ? "من" : "Start"} value={exp.start} onChange={(v) => setArr("experiences", i, "start", v)} />
              <Input placeholder={isAr ? "إلى" : "End"} value={exp.end} onChange={(v) => setArr("experiences", i, "end", v)} />
            </div>
            <textarea placeholder={isAr ? "الإنجازات (كل سطر نقطة)..." : "Achievements (one per line)..."} rows={3} value={exp.description}
              onChange={(e) => setArr("experiences", i, "description", e.target.value)}
              className="mt-3 w-full rounded-lg bg-secondary/30 border border-border/60 px-3 py-2 text-sm focus:outline-none focus:zeus-gold-border" />
          </Repeatable>
        ))}
      </Card>

      <Card title={isAr ? "التعليم" : "Education"} icon={GraduationCap} onAdd={() => add("education", { degree: "", institution: "", start: "", end: "" })}>
        {(cv.education || []).map((ed, i) => (
          <Repeatable key={i} onRemove={() => remove("education", i)}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder={isAr ? "الدرجة" : "Degree"} value={ed.degree} onChange={(v) => setArr("education", i, "degree", v)} />
              <Input placeholder={isAr ? "المؤسسة" : "Institution"} value={ed.institution} onChange={(v) => setArr("education", i, "institution", v)} />
              <Input placeholder={isAr ? "من" : "Start"} value={ed.start} onChange={(v) => setArr("education", i, "start", v)} />
              <Input placeholder={isAr ? "إلى" : "End"} value={ed.end} onChange={(v) => setArr("education", i, "end", v)} />
            </div>
          </Repeatable>
        ))}
      </Card>

      <Card title={isAr ? "المهارات التقنية" : "Technical Skills"} icon={Wrench}
        onAdd={() => add("skills", { name: "", category: isAr ? "أخرى" : "Other" })}
        action={<button onClick={syncSkills} className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold">
          <Sparkles style={{ width: 14, height: 14 }} /> {isAr ? "مزامنة من الملف" : "Sync from Profile"}
        </button>}>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {(cv.skills || []).map((s, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 border border-border/60">
              <input value={s.name} onChange={(e) => setArr("skills", i, "name", e.target.value)} placeholder={isAr ? "مهارة" : "Skill"}
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              <input value={s.category || ""} onChange={(e) => setArr("skills", i, "category", e.target.value)} placeholder={isAr ? "فئة" : "Category"}
                className="w-24 bg-secondary/40 rounded text-xs px-2 py-1 focus:outline-none" />
              <button onClick={() => remove("skills", i)} className="text-muted-foreground hover:text-destructive"><Trash2 style={{ width: 14, height: 14 }} /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card title={isAr ? "المهارات الشخصية" : "Soft Skills"} icon={Sparkles} onAdd={() => add("soft_skills", "")}>
        <div className="flex flex-wrap gap-2">
          {(cv.soft_skills || []).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/20 border border-border/60">
              <input value={s} onChange={(e) => { const n = [...(cv.soft_skills || [])]; n[i] = e.target.value; set("soft_skills", n); }} placeholder={isAr ? "مهارة" : "Skill"}
                className="bg-transparent text-xs focus:outline-none w-24" />
              <button onClick={() => remove("soft_skills", i)} className="text-muted-foreground hover:text-destructive"><Trash2 style={{ width: 12, height: 12 }} /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card title={isAr ? "المشاريع" : "Projects"} icon={FileText} onAdd={() => add("projects", { title: "", description: "", link: "" })}>
        {(cv.projects || []).map((p, i) => (
          <Repeatable key={i} onRemove={() => remove("projects", i)}>
            <Input placeholder={isAr ? "اسم المشروع" : "Project title"} value={p.title} onChange={(v) => setArr("projects", i, "title", v)} />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{isAr ? "الوصف (إنجليزي)" : "Description (English)"}</span>
              <button onClick={() => rewriteProject(i)} disabled={projLoading === i || !p.description?.trim()} className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold disabled:opacity-50">
                {projLoading === i ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />} {isAr ? "إعادة صياغة بالإنجليزية" : "Rewrite in English"}
              </button>
            </div>
            <textarea placeholder="Description in English..." rows={2} value={p.description}
              onChange={(e) => setArr("projects", i, "description", e.target.value)}
              className="mt-1.5 w-full rounded-lg bg-secondary/30 border border-border/60 px-3 py-2 text-sm focus:outline-none focus:zeus-gold-border" />
            <div className="mt-2">
              <Input placeholder={isAr ? "رابط" : "Link"} value={p.link} onChange={(v) => setArr("projects", i, "link", v)} />
            </div>
          </Repeatable>
        ))}
      </Card>

      <Card title={isAr ? "الشهادات" : "Certifications"} icon={Award} onAdd={() => add("certifications", { name: "", issuer: "", date: "", link: "" })}>
        {(cv.certifications || []).map((c, i) => (
          <Repeatable key={i} onRemove={() => remove("certifications", i)}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder={isAr ? "اسم الشهادة" : "Certification name"} value={c.name || ""} onChange={(v) => setArr("certifications", i, "name", v)} />
              <Input placeholder={isAr ? "الجهة" : "Issuer"} value={c.issuer || ""} onChange={(v) => setArr("certifications", i, "issuer", v)} />
              <Input placeholder={isAr ? "التاريخ" : "Date"} value={c.date || ""} onChange={(v) => setArr("certifications", i, "date", v)} />
              <Input placeholder={isAr ? "رابط" : "Link"} value={c.link || ""} onChange={(v) => setArr("certifications", i, "link", v)} />
            </div>
          </Repeatable>
        ))}
      </Card>

      <Card title={isAr ? "اللغات" : "Languages"} icon={Languages} onAdd={() => add("languages", { name: "", level: "Intermediate" })}>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {(cv.languages || []).map((s, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 border border-border/60">
              <input value={s.name} onChange={(e) => setArr("languages", i, "name", e.target.value)} placeholder={isAr ? "لغة" : "Language"}
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              <select value={s.level} onChange={(e) => setArr("languages", i, "level", e.target.value)} className="bg-secondary/40 rounded text-xs px-2 py-1 focus:outline-none">
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Native</option>
              </select>
              <button onClick={() => remove("languages", i)} className="text-muted-foreground hover:text-destructive"><Trash2 style={{ width: 14, height: 14 }} /></button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, icon: Icon, children, onAdd, action }) {
  return (
    <div className="zeus-glass p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-sm flex items-center gap-2"><Icon className="text-zeus-gold" style={{ width: 16, height: 16 }} /> {title}</h3>
        <div className="flex items-center gap-2">
          {action}
          {onAdd && <button onClick={onAdd} className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold"><Plus style={{ width: 14, height: 14 }} /> {isArText(onAdd)}</button>}
        </div>
      </div>
      {children}
    </div>
  );
}

function isArText() { return "Add"; }

function Input({ icon: Icon, placeholder, value, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary/30 border border-border/60 px-3 py-2 focus-within:zeus-gold-border">
      {Icon && <Icon className="text-muted-foreground shrink-0" style={{ width: 15, height: 15 }} />}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60" />
    </div>
  );
}

function Repeatable({ children, onRemove }) {
  return (
    <div className="relative p-3 rounded-xl bg-secondary/15 border border-border/50 mb-3">
      <button onClick={onRemove} className="absolute top-2 end-2 text-muted-foreground hover:text-destructive"><Trash2 style={{ width: 14, height: 14 }} /></button>
      {children}
    </div>
  );
}