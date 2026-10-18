import React, { useState, useEffect } from "react";
import { Plus, Loader2, Wand2, X, Upload, ExternalLink, Trash2, Image as ImageIcon, AlertCircle } from "lucide-react";
import { api } from "@/api/client";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/ProfileContext";


function normalizeUrl(u) {
  const v = (u || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}


export default function Projects() {
  const { t, lang, dir } = useI18n();
  const { profile } = useProfile();
  const isAr = lang === "ar";
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [form, setForm] = useState({ description: "", link: "", images: [] });
  const [saveError, setSaveError] = useState("");

  const load = async () => {
    const p = await api.entities.Project.filter({}, "-created_date", 50);
    setProjects(p);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ description: "", link: "", images: [] });
    setShowForm(false);
  };

  const rewrite = async () => {
    if (!form.description.trim()) return;
    setRewriting(true);
    try {
      const res = await api.functions.invoke("rewriteProjectDescription", { description: form.description, lang });
      const data = res.data || res;
      // Backend returns {rewritten} — never silently drop it
      if (data.rewritten) setForm({ ...form, description: data.rewritten });
    } catch {}
    setRewriting(false);
  };

  const uploadImage = async (file, slot) => {
    setUploadingIdx(slot);
    try {
      const { file_url } = await api.integrations.Core.UploadPublicFile({ file });
      const imgs = [...form.images];
      imgs[slot] = file_url;
      setForm({ ...form, images: imgs });
    } catch {}
    setUploadingIdx(null);
  };

  const save = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const title = form.description.trim().split("\n")[0].slice(0, 80) || (isAr ? "مشروعي" : "My Project");
      await api.entities.Project.create({
        title,
        goal: profile?.goal || "",
        description: form.description.trim(),
        link: normalizeUrl(form.link),
        images: form.images.filter(Boolean),
        status: "completed"
      });
      resetForm();
      load();
    } catch (e) {
      setSaveError(e.message || (isAr ? "تعذر حفظ المشروع — حاول تاني" : "Couldn't save the project — try again"));
    }
    setSaving(false);
  };

  const remove = async (id) => {
    await api.entities.Project.delete(id);
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="text-zeus-gold animate-spin" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl">{t("projects.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{isAr ? "شارك مشاريعك الحقيقية" : "Share your real projects"}</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold-sm">
            <Plus style={{ width: 18, height: 18 }} /> {isAr ? "إضافة مشروع" : "Add Project"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="zeus-glass p-5 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm">{isAr ? "مشروع جديد" : "New Project"}</h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X style={{ width: 18, height: 18 }} /></button>
          </div>

          {/* Description with AI rewrite */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-muted-foreground">{isAr ? "وصف مشروعك" : "Describe your project"}</label>
              <button onClick={rewrite} disabled={rewriting || !form.description.trim()}
                className="inline-flex items-center gap-1 text-xs text-zeus-brightgold hover:text-zeus-gold disabled:opacity-50">
                {rewriting ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <Wand2 style={{ width: 13, height: 13 }} />}
                {isAr ? "إعادة صياغة بالـ AI" : "Rewrite with AI"}
              </button>
            </div>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4}
              placeholder={isAr ? "اكتب وصف مشروعك... إيه بيعمل، التقنيات المستخدمة، والمميزات..." : "Describe your project... what it does, technologies used, features..."}
              className="w-full rounded-xl bg-secondary/30 border border-border/60 px-3.5 py-3 text-sm focus:outline-none focus:zeus-gold-border resize-none" />
          </div>

          {/* Link */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{isAr ? "رابط المشروع" : "Project Link"}</label>
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={isAr ? "https://..." : "https://..."}
              className="w-full rounded-xl bg-secondary/30 border border-border/60 px-3.5 py-3 text-sm focus:outline-none focus:zeus-gold-border" />
          </div>

          {/* 3 Images */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{isAr ? "صور المشروع (3 صور)" : "Project Images (3 images)"}</label>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((slot) => (
                <label key={slot} className="aspect-square rounded-xl border-2 border-dashed border-border/60 bg-secondary/20 flex items-center justify-center cursor-pointer hover:border-zeus-gold/40 transition overflow-hidden relative">
                  {form.images[slot] ? (
                    <>
                      <img src={form.images[slot]} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={(e) => { e.preventDefault(); const imgs = [...form.images]; imgs[slot] = null; setForm({ ...form, images: imgs }); }}
                        className="absolute top-1 end-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    </>
                  ) : uploadingIdx === slot ? (
                    <Loader2 className="text-zeus-gold animate-spin" style={{ width: 20, height: 20 }} />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon style={{ width: 20, height: 20 }} className="mx-auto mb-1 opacity-50" />
                      <span className="text-[10px]">{isAr ? "رفع" : "Upload"}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0], slot)} />
                </label>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving || !form.description.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Plus style={{ width: 16, height: 16 }} />}
            {isAr ? "حفظ المشروع" : "Save Project"}
          </button>
          {saveError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle style={{ width: 13, height: 13 }} /> {saveError}</p>
          )}
        </div>
      )}

      {/* Projects grid */}
      {projects.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="zeus-glass overflow-hidden group">
              {p.images?.[0] && (
                <div className="aspect-video overflow-hidden">
                  <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-heading font-bold text-sm line-clamp-1">{p.title}</h3>
                  <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 style={{ width: 14, height: 14 }} /></button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.description}</p>
                {p.link && (
                  <a href={normalizeUrl(p.link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-zeus-gold hover:underline mt-2">
                    <ExternalLink style={{ width: 12, height: 12 }} /> {isAr ? "فتح المشروع" : "Open project"}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : !showForm && (
        <div className="zeus-glass p-12 text-center">
          <ImageIcon className="text-muted-foreground/30 mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <p className="text-muted-foreground text-sm mb-4">{isAr ? "لسه مفيش مشاريع. أضف أول مشروع ليك!" : "No projects yet. Add your first project!"}</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zeus-gold text-zeus-midnight font-semibold text-sm hover:bg-zeus-brightgold transition shadow-gold">
            <Plus style={{ width: 16, height: 16 }} /> {isAr ? "إضافة مشروع" : "Add Project"}
          </button>
        </div>
      )}
    </div>
  );
}