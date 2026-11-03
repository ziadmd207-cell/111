import { describe, expect, it } from "vitest";
import { CAREER_FIELDS, findCareerField, getFieldSearchTerms, getFieldText } from "./careerFields";

describe("career field guide data", () => {
  it("provides bilingual explanations, projects, roles, skills, and two references", () => {
    expect(CAREER_FIELDS.length).toBeGreaterThanOrEqual(15);

    for (const field of CAREER_FIELDS) {
      expect(getFieldText(field, "title", true)).toBeTruthy();
      expect(getFieldText(field, "title", false)).toBeTruthy();
      expect(getFieldText(field, "about", true)).toBeTruthy();
      expect(getFieldText(field, "about", false)).toBeTruthy();
      expect(getFieldText(field, "work", true)).toBeTruthy();
      expect(getFieldText(field, "work", false)).toBeTruthy();
      expect(getFieldText(field, "project", true)).toBeTruthy();
      expect(getFieldText(field, "project", false)).toBeTruthy();
      expect(getFieldText(field, "roles", true).length).toBeGreaterThan(0);
      expect(getFieldText(field, "roles", false).length).toBeGreaterThan(0);
      expect(getFieldText(field, "skills", false)).toBeTruthy();
      expect(field.sources).toHaveLength(2);
      expect(new Set(field.sources.map(({ url }) => url)).size).toBe(2);
      expect(field.sources.every(({ url }) => url.startsWith("https://"))).toBe(true);
    }
  });

  it("finds a field from its Arabic or English title", () => {
    expect(findCareerField("Frontend Development")?.id).toBe("frontend");
    expect(findCareerField("تطوير الواجهات الأمامية")?.id).toBe("frontend");
    expect(findCareerField("فرونت اند")?.id).toBe("frontend");
    expect(findCareerField("تحليل البيانات")?.id).toBe("data-analysis");
    expect(getFieldSearchTerms("ai-ml")).toContain("ذكاء اصطناعي");
  });
});
