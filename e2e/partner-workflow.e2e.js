import { expect, test } from "@playwright/test";
import {
  addPartnerStudent,
  apiCall,
  createPartner,
  getAdminToken,
  loginThroughUi,
  loginViaApi,
  uniqueEmail,
} from "./helpers.js";

test("partner dashboard is tenant-isolated and students can complete partner assessments", async ({ page, request }) => {
  test.setTimeout(120_000);

  const adminToken = await getAdminToken(request);
  const password = "E2E-Partner-Password-2026";
  const studentPassword = "E2E-Student-Password-2026";
  const firstPartnerEmail = uniqueEmail("partner-one");
  const secondPartnerEmail = uniqueEmail("partner-two");
  const firstStudentEmail = uniqueEmail("student-one");
  const secondStudentEmail = uniqueEmail("student-two");

  const firstPartner = await createPartner(request, adminToken, {
    name: "E2E Academy One",
    email: firstPartnerEmail,
    password,
  });
  const secondPartner = await createPartner(request, adminToken, {
    name: "E2E Academy Two",
    email: secondPartnerEmail,
    password,
  });
  const firstStudent = await addPartnerStudent(request, adminToken, firstPartner.id, {
    fullName: "E2E Academy One Student",
    email: firstStudentEmail,
    password: studentPassword,
  });
  const secondStudent = await addPartnerStudent(request, adminToken, secondPartner.id, {
    fullName: "E2E Academy Two Student",
    email: secondStudentEmail,
    password: studentPassword,
  });

  const firstPartnerToken = await loginViaApi(request, firstPartnerEmail, password);
  const secondPartnerToken = await loginViaApi(request, secondPartnerEmail, password);
  const firstDashboard = await apiCall(request, "get", "/partners/dashboard", { token: firstPartnerToken });
  const secondDashboard = await apiCall(request, "get", "/partners/dashboard", { token: secondPartnerToken });
  expect(firstDashboard.students.map((student) => student.id)).toContain(firstStudent.member.id);
  expect(firstDashboard.students.map((student) => student.id)).not.toContain(secondStudent.member.id);
  expect(secondDashboard.students.map((student) => student.id)).toContain(secondStudent.member.id);
  expect(secondDashboard.students.map((student) => student.id)).not.toContain(firstStudent.member.id);

  await page.addInitScript(() => localStorage.setItem("zeus_lang", "en"));
  await loginThroughUi(page, firstPartnerEmail, password);
  await expect(page).toHaveURL(/\/partner$/);
  await expect(page.getByRole("heading", { name: "E2E Academy One" })).toBeVisible();
  await expect(page.getByText("E2E Academy One Student", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Academy Two Student", { exact: true })).toHaveCount(0);

  await page.goto("/partner/assessments", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Partner assessments" })).toBeVisible();
  const assessmentTitle = `E2E Assessment ${Date.now()}`;
  await page.getByPlaceholder("Assessment title").fill(assessmentTitle);
  await page.getByPlaceholder("Question prompt").fill("Which value is correct?");
  await page.getByPlaceholder("Answer choices, one per line").fill("2\n4\n6");
  await page.getByLabel("Correct answer index (starts at 0)").fill("1");
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expect(page.getByText(assessmentTitle, { exact: true })).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem("zeus_token");
    localStorage.removeItem("zeus_auth");
  });
  await loginThroughUi(page, firstStudentEmail, studentPassword);
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/partner/assessments", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(assessmentTitle, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await page.getByLabel("4", { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Result:" })).toContainText("100%");

  const studentToken = await page.evaluate(() => localStorage.getItem("zeus_token"));
  const assessments = await apiCall(request, "get", "/partners/assessments", { token: studentToken });
  expect(assessments.assessments.some((assessment) => assessment.title === assessmentTitle)).toBeTruthy();
});
