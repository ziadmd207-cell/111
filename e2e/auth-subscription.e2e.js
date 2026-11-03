import { expect, test } from "@playwright/test";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getAdminToken, loginThroughUi, uniqueEgyptianPhone, uniqueEmail, apiCall } from "./helpers.js";

let uploadedReceiptPath;

test.afterEach(async () => {
  if (!uploadedReceiptPath) return;
  await unlink(uploadedReceiptPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  uploadedReceiptPath = undefined;
});

test("registration, subscription receipt, admin approval, and sign-in complete end to end", async ({ page, request }) => {
  test.setTimeout(120_000);

  const email = uniqueEmail("learner");
  const password = "E2E-Learner-Password-2026";
  const phone = uniqueEgyptianPhone();

  await page.addInitScript(() => localStorage.setItem("zeus_lang", "en"));
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Full name").fill("Test Learner One");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="tel"]').fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const registrationResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/register") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create account" }).click();
  expect((await registrationResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/login\?pending=1/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("status")).toContainText("Account awaiting activation");

  await page.goto("/subscriptions", { waitUntil: "domcontentloaded" });
  const proPlan = page.locator(".subscription-plan-card").filter({
    has: page.getByText("PRO", { exact: true }),
  });
  await expect(proPlan).toBeVisible();
  await proPlan.getByRole("button", { name: "Subscribe Now" }).click();

  const modal = page.locator(".subscription-form-modal");
  await expect(modal).toBeVisible();
  await modal.locator('input[type="text"]').fill("Test Learner One");
  await modal.locator('input[type="email"]').fill(email);
  await modal.locator('input[type="tel"]').fill(`0${phone}`);
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/subscriptions/upload-receipt") && response.request().method() === "POST"
    ),
    modal.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=", "base64"),
    }),
  ]);
  expect(uploadResponse.ok()).toBeTruthy();
  const upload = await uploadResponse.json();
  const receiptUrl = new URL(upload.file_url, process.env.E2E_BASE_URL || "http://127.0.0.1:5173");
  const receiptName = receiptUrl.pathname.split("/").pop();
  expect(receiptName).toMatch(/^receipt_[a-f0-9]{32}\.(png|jpe?g|webp)$/i);
  uploadedReceiptPath = resolve(process.cwd(), "uploads", receiptName);
  await expect(modal.getByRole("img", { name: "Transfer receipt" })).toBeVisible();

  const [submitResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/subscriptions/submit") && response.request().method() === "POST"
    ),
    modal.locator('button[type="submit"]').click(),
  ]);
  expect(submitResponse.ok()).toBeTruthy();
  const submission = await submitResponse.json();
  expect(submission.id).toBeTruthy();
  await expect(modal.getByText("Your request has been submitted", { exact: false })).toBeVisible();

  const adminToken = await getAdminToken(request);
  const approval = await apiCall(request, "post", `/admin/subscribers/${submission.id}/approve`, { token: adminToken });
  expect(approval.success).toBeTruthy();

  await loginThroughUi(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
  const learnerToken = await page.evaluate(() => localStorage.getItem("zeus_token"));
  const profile = await apiCall(request, "get", "/auth/me", { token: learnerToken });
  expect(profile.subscription_plan).toBe("PRO");
  expect(profile.subscription_status).toBe("active");

  if (uploadedReceiptPath) await unlink(uploadedReceiptPath);
});
