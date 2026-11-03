import { expect, test } from "@playwright/test";
import {
  addPartnerStudent,
  createAdminUser,
  createPartner,
  getAdminToken,
  uniqueEmail,
} from "./helpers.js";

test("admin account filters separate individual learners from institution learners and pages load", async ({ page, request }) => {
  test.setTimeout(120_000);

  const adminToken = await getAdminToken(request);
  const password = "E2E-Account-Password-2026";
  const individualEmail = uniqueEmail("individual");
  const partnerStudentEmail = uniqueEmail("institution-student");
  const individual = await createAdminUser(request, adminToken, {
    fullName: "E2E Individual Learner",
    email: individualEmail,
    password,
  });
  const partner = await createPartner(request, adminToken, {
    name: "E2E Partner Academy",
    email: uniqueEmail("partner"),
    password: "E2E-Partner-Password-2026",
  });
  await addPartnerStudent(request, adminToken, partner.id, {
    fullName: "E2E Institution Learner",
    email: partnerStudentEmail,
    password,
  });
  const pageErrors = [];
  const serverErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.addInitScript(() => localStorage.setItem("zeus_lang", "en"));
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();

  await page.getByRole("link", { name: "Users", exact: true }).click();
  const accountTypeFilter = page.locator("#admin-account-type-filter");
  await expect(accountTypeFilter).toBeVisible({ timeout: 30_000 });
  await accountTypeFilter.selectOption("individual");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: individualEmail, exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: partnerStudentEmail, exact: false })).toHaveCount(0);

  await accountTypeFilter.selectOption("partner_student");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: partnerStudentEmail, exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: individualEmail, exact: false })).toHaveCount(0);

  const previewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/admin/users/${individual.id}/learning` && response.ok(),
  );
  await page.goto(`/admin/users/${individual.id}/preview`, { waitUntil: "domcontentloaded" });
  await previewResponse;
  await expect(page.getByRole("heading", { name: "E2E Individual Learner", exact: true })).toBeVisible();
  await expect(page.getByText("Admin read-only preview", { exact: false })).toBeVisible();

  for (const [route, label] of [
    ["/admin", "Stats"],
    ["/admin/users", "Users"],
    ["/admin/partners", "Partners"],
    ["/admin/subscribers", "Subscribers"],
    ["/admin/communities", "Communities & moderation"],
    ["/admin/broadcast", "Broadcast"],
    ["/admin/support", "Support"],
    ["/admin/support-chats", "Support chats"],
    ["/admin/settings", "Settings"],
    ["/admin/ai-settings", "AI & YouTube"],
    ["/admin/certificates", "Certificates"],
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new URL(route, process.env.E2E_BASE_URL || "http://127.0.0.1:5173").toString());
    await expect(page.getByRole("main").last()).not.toBeEmpty();
    await expect(page).not.toHaveURL(/\/login/);
  }

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
