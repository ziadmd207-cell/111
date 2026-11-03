import { expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
export const apiBaseUrl = process.env.E2E_API_URL || `${baseUrl}/api`;

export function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

export function uniqueEgyptianPhone() {
  return `10${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
}

export async function apiCall(request, method, path, { body, token } = {}) {
  const options = {};
  if (body !== undefined) options.data = body;
  if (token) options.headers = { Authorization: `Bearer ${token}` };
  if (options.timeout === undefined) options.timeout = 30_000;
  const response = await request[method](`${apiBaseUrl}${path}`, options);
  const responseText = await response.text();
  let payload = responseText;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Keep non-JSON API responses available in the thrown error below.
  }

  if (!response.ok()) {
    throw new Error(`${method.toUpperCase()} ${path} failed (${response.status()}): ${responseText}`);
  }
  return payload;
}

export async function loginViaApi(request, email, password) {
  const result = await apiCall(request, "post", "/auth/login", {
    body: { email, password },
  });
  expect(result.access_token).toBeTruthy();
  return result.access_token;
}

export async function loginThroughUi(page, email, password) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}

export async function getAdminToken(request) {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run live admin E2E tests.");
  }
  return loginViaApi(request, email, password);
}

export async function createAdminUser(request, token, { fullName, email, password }) {
  return apiCall(request, "post", "/admin/users", {
    token,
    body: { full_name: fullName, email, password },
  });
}

export async function createPartner(request, token, { name, email, password }) {
  return apiCall(request, "post", "/partners/admin", {
    token,
    body: {
      name,
      email,
      password,
      institution_type: "educational_institution",
      learning_mode: "student_discovery",
      subscription_plan: "PRO",
      subscription_days: 30,
      max_students: 20,
    },
  });
}

export async function addPartnerStudent(request, token, partnerId, { fullName, email, password }) {
  return apiCall(request, "post", `/partners/admin/${partnerId}/members`, {
    token,
    body: {
      member_type: "student",
      full_name: fullName,
      email,
      username: "",
      password,
      national_id: "",
      phone: "",
    },
  });
}
