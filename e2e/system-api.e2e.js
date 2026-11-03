import { expect, test } from "@playwright/test";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  addPartnerStudent,
  apiBaseUrl,
  apiCall,
  createPartner,
  getAdminToken,
  loginViaApi,
  uniqueEmail,
} from "./helpers.js";

let uploadedReceiptPath;

test.afterEach(async () => {
  if (!uploadedReceiptPath) return;
  await unlink(uploadedReceiptPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  uploadedReceiptPath = undefined;
});

test("@api registration and subscription approval activate an individual account", async ({ request }) => {
  const email = uniqueEmail("api-learner");
  const password = "E2E-Individual-Password-2026";
  const phoneNumber = `10${String(Date.now() % 100_000_000).padStart(8, "0")}`;
  const adminToken = await getAdminToken(request);

  const registration = await apiCall(request, "post", "/auth/register", {
    body: {
      email,
      password,
      full_name: "System Learner One",
      phone_country: "EG",
      phone_number: phoneNumber,
    },
  });
  expect(registration.pending).toBe(true);

  const pendingLogin = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password },
  });
  expect(pendingLogin.status()).toBe(403);

  const uploadResponse = await request.post(`${apiBaseUrl}/subscriptions/upload-receipt`, {
    multipart: {
      file: {
        name: "system-receipt.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=", "base64"),
      },
    },
  });
  expect(uploadResponse.ok()).toBeTruthy();
  const upload = await uploadResponse.json();
  const receiptName = new URL(upload.file_url, apiBaseUrl).pathname.split("/").pop();
  expect(receiptName).toMatch(/^receipt_[a-f0-9]{32}\.png$/i);
  uploadedReceiptPath = resolve(process.cwd(), "uploads", receiptName);

  const subscription = await apiCall(request, "post", "/subscriptions/submit", {
    body: {
      full_name: "System Learner One",
      email,
      phone: `010${String(Date.now() % 100_000_000).padStart(8, "0")}`,
      plan: "PRO",
      payment_image_url: upload.file_url,
      notes: "Automated isolated-system test",
    },
  });
  expect(subscription.status).toBe("pending");
  const approval = await apiCall(request, "post", `/admin/subscribers/${subscription.id}/approve`, {
    token: adminToken,
  });
  expect(approval.success).toBe(true);

  const userToken = await loginViaApi(request, email, password);
  const profile = await apiCall(request, "get", "/auth/me", { token: userToken });
  expect(profile.subscription_plan).toBe("PRO");
  expect(profile.subscription_status).toBe("active");
});

test("@api admin filters isolate institution students and partner assessments stay tenant-scoped", async ({ request }) => {
  const adminToken = await getAdminToken(request);
  const partnerPassword = "E2E-Partner-Password-2026";
  const studentPassword = "E2E-Student-Password-2026";
  const firstEmail = uniqueEmail("api-partner-one");
  const secondEmail = uniqueEmail("api-partner-two");

  const firstPartner = await createPartner(request, adminToken, {
    name: "API Partner One",
    email: firstEmail,
    password: partnerPassword,
  });
  const secondPartner = await createPartner(request, adminToken, {
    name: "API Partner Two",
    email: secondEmail,
    password: partnerPassword,
  });
  const firstStudent = await addPartnerStudent(request, adminToken, firstPartner.id, {
    fullName: "API Partner One Student",
    email: uniqueEmail("api-student-one"),
    password: studentPassword,
  });
  const secondStudent = await addPartnerStudent(request, adminToken, secondPartner.id, {
    fullName: "API Partner Two Student",
    email: uniqueEmail("api-student-two"),
    password: studentPassword,
  });

  const individualListing = await apiCall(request, "get", "/admin/users?account_type=individual", {
    token: adminToken,
  });
  const institutionListing = await apiCall(request, "get", "/admin/users?account_type=partner_student", {
    token: adminToken,
  });
  expect(institutionListing.users.some((user) => user.id === firstStudent.member.id)).toBe(true);
  expect(institutionListing.users.some((user) => user.id === secondStudent.member.id)).toBe(true);
  expect(individualListing.users.some((user) => user.id === firstStudent.member.id)).toBe(false);

  const firstPartnerToken = await loginViaApi(request, firstEmail, partnerPassword);
  const secondPartnerToken = await loginViaApi(request, secondEmail, partnerPassword);
  const firstDashboard = await apiCall(request, "get", "/partners/dashboard", { token: firstPartnerToken });
  const secondDashboard = await apiCall(request, "get", "/partners/dashboard", { token: secondPartnerToken });
  expect(firstDashboard.students.map((student) => student.id)).toContain(firstStudent.member.id);
  expect(firstDashboard.students.map((student) => student.id)).not.toContain(secondStudent.member.id);
  expect(secondDashboard.students.map((student) => student.id)).toContain(secondStudent.member.id);
  expect(secondDashboard.students.map((student) => student.id)).not.toContain(firstStudent.member.id);

  const assessmentTitle = `API Assessment ${Date.now()}`;
  const assessmentResponse = await apiCall(request, "post", "/partners/assessments", {
    token: firstPartnerToken,
    body: {
      title: assessmentTitle,
      kind: "exam",
      description: "Isolated end-to-end assessment",
      questions: [{
        prompt: "Which value is correct?",
        options: ["2", "4", "6"],
        correct_index: 1,
        points: 10,
      }],
    },
  });
  const studentToken = await loginViaApi(request, firstStudent.member.email, studentPassword);
  const assessments = await apiCall(request, "get", "/partners/assessments", { token: studentToken });
  const assessment = assessments.assessments.find((item) => item.title === assessmentTitle);
  expect(assessment).toBeTruthy();

  const attempt = await apiCall(request, "post", `/partners/assessments/${assessmentResponse.assessment.id}/attempts`, {
    token: studentToken,
    body: { answers: [1] },
  });
  expect(attempt.attempt.percentage).toBe(100);
});
