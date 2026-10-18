import React from "react";

export default function CVPreview({ cv, isAr, previewRef }) {
  const exp = cv.experiences || [];
  const edu = cv.education || [];
  const skills = cv.skills || [];
  const langs = cv.languages || [];
  const certs = cv.certifications || [];
  const softSkills = cv.soft_skills || [];
  const projects = cv.projects || [];

  const skillCategories = {};
  skills.forEach((s) => {
    const cat = s.category || "Other";
    if (!skillCategories[cat]) skillCategories[cat] = [];
    skillCategories[cat].push(s.name);
  });

  const certList = certs.map((c) => typeof c === "string" ? { name: c } : c);

  return (
    <div ref={previewRef} className="bg-white text-black overflow-hidden" style={{ minHeight: 400, fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      <div className="px-8 py-6 border-b-2 border-black">
        <h1 className="text-3xl font-bold tracking-tight text-black">{cv.full_name || "—"}</h1>
        {cv.title_role && <p className="text-sm font-medium mt-1 text-gray-700">{cv.title_role}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-600">
          {cv.email && <span>{cv.email}</span>}
          {cv.phone && <span>{cv.phone}</span>}
          {cv.location && <span>{cv.location}</span>}
          {cv.linkedin && <a href={cv.linkedin} target="_blank" rel="noreferrer" className="text-blue-700 underline cursor-pointer">LinkedIn</a>}
          {cv.github && <a href={cv.github} target="_blank" rel="noreferrer" className="text-blue-700 underline cursor-pointer">GitHub</a>}
        </div>
      </div>

      <div className="px-8 py-5 space-y-4">
        {cv.summary && (
          <Section title="Professional Summary">
            <p className="text-[12px] leading-relaxed text-gray-800">{cv.summary}</p>
          </Section>
        )}

        {Object.keys(skillCategories).length > 0 && (
          <Section title="Technical Skills">
            <div className="space-y-1">
              {Object.entries(skillCategories).map(([cat, sks]) => (
                <div key={cat} className="text-[12px]">
                  <span className="font-bold text-black">{cat}: </span>
                  <span className="text-gray-800">{sks.join(", ")}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {softSkills.length > 0 && (
          <Section title="Soft Skills">
            <p className="text-[12px] text-gray-800">{softSkills.join(", ")}</p>
          </Section>
        )}

        {exp.length > 0 && (
          <Section title="Experience">
            <div className="space-y-3">
              {exp.map((e, i) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline gap-2">
                    <h4 className="font-bold text-[13px] text-black">{e.role || ""}{e.company ? `, ${e.company}` : ""}</h4>
                    <span className="text-[11px] text-gray-600 shrink-0">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
                  </div>
                  {e.description && (
                    <ul className="mt-1 list-disc ps-4 text-[12px] text-gray-800 space-y-0.5">
                      {e.description.split("\n").filter(Boolean).map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {projects.length > 0 && (
          <Section title="Projects">
            <div className="space-y-2">
              {projects.map((p, i) => (
                <div key={i}>
                  <h4 className="font-bold text-[13px] text-black">{p.title}</h4>
                  {p.description && <p className="text-[12px] text-gray-800 mt-0.5">{p.description}</p>}
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 underline">{p.link}</a>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {edu.length > 0 && (
          <Section title="Education">
            <div className="space-y-2">
              {edu.map((e, i) => (
                <div key={i} className="flex justify-between items-baseline gap-2">
                  <div>
                    <span className="font-bold text-[13px] text-black">{e.degree}</span>
                    {e.institution && <span className="text-[12px] text-gray-700">, {e.institution}</span>}
                  </div>
                  <span className="text-[11px] text-gray-600 shrink-0">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {certList.length > 0 && (
          <Section title="Certifications">
            <div className="space-y-1">
              {certList.map((c, i) => (
                <div key={i} className="text-[12px]">
                  <span className="font-bold text-black">{c.name}</span>
                  {c.issuer && <span className="text-gray-700">, {c.issuer}</span>}
                  {c.date && <span className="text-gray-600"> ({c.date})</span>}
                  {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="text-blue-700 underline ms-1">Link</a>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {langs.length > 0 && (
          <Section title="Languages">
            <p className="text-[12px] text-gray-800">{langs.map((l) => `${l.name} (${l.level})`).join(" · ")}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-black border-b border-gray-300 pb-1 mb-2">{title}</h3>
      {children}
    </div>
  );
}