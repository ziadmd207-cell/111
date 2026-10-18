/**
 * ZEUS API Client - local FastAPI wrapper.
 * Entities, functions, integrations, auth (JWT via /api/auth).
 */
const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "zeus_token";

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

async function request(path, { method = "GET", body, headers = {}, isFormData = false, signal } = {}) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers: { ...headers } };
  if (signal) opts.signal = signal;
  const token = getToken();
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) {
    if (isFormData) {
      opts.body = body;
      // Don't set Content-Type for FormData
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    // Stuck "typing..." forever is worse than an error: surface timeouts
    // so the UI can show a retry message.
    if (e && e.name === "AbortError") throw new Error("Request timed out — please try again");
    throw e;
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    // Session expired/invalid: drop token and go to login — but ONLY when a
    // token was actually sent. Anonymous users on public pages (e.g. pending
    // subscribers uploading a receipt) must never be yanked to /login.
    if (token) {
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("zeus_auth"); } catch {}
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }
    // FastAPI errors come as {detail} — surface the friendly Arabic message,
    // never a bare "403".
    let detail = data.detail;
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join("، ");
    const err = new Error(detail || data.error || data.message || `Request failed ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

// Helper to build entity API matching api.entities.X
function createEntity(entityName) {
  return {
    // api.entities.X.filter(filter, sort, limit) -> supports both signatures
    filter: async (filter = {}, sort, limit) => {
      // Supports filter({}, "-created_date", 50)
      // and filter({ filter: {}, sort, limit })
      let body = {};
      if (filter && typeof filter === "object" && !Array.isArray(filter)) {
        // Check if caller passed (filterObj, sortStr, limitNum)
        if (typeof sort === "string" || typeof limit === "number") {
          body = { filter, sort, limit };
        } else {
          body = filter;
          // If filter contains sort/limit keys, keep them
          if (filter.sort || filter.limit) {
            body = filter;
          } else if (Object.keys(filter).length === 0 || filter.filter !== undefined) {
            body = filter;
          } else {
            // Plain filter object without wrapper
            body = { filter };
            // If filter has $ne etc., keep as is
            if (filter.status !== undefined || filter.community_id !== undefined || filter.roadmap_id !== undefined) {
              body = { filter };
            }
          }
        }
      } else {
        body = { filter: {} };
      }
      // Normalize: if body has no filter key but is plain object with field filters, wrap it
      if (body.filter === undefined && body.sort === undefined && body.limit === undefined && !body.community_id && !body.type) {
        // Check if body is already a wrapped filter
        const hasEntityField = Object.keys(body).some(k => ["status", "type", "community_id", "roadmap_id", "node_id", "goal"].includes(k));
        if (hasEntityField) {
          body = { filter: body };
        }
      }
      if (sort && !body.sort) body.sort = sort;
      if (limit && !body.limit) body.limit = limit;
      const result = await request(`/api/entities/${entityName}/filter`, { method: "POST", body });
      return Array.isArray(result) ? result : [];
    },
    get: async (id) => request(`/api/entities/${entityName}/${id}`),
    create: async (data) => request(`/api/entities/${entityName}`, { method: "POST", body: data }),
    update: async (id, data) => request(`/api/entities/${entityName}/${id}`, { method: "PUT", body: data }),
    bulkCreate: async (items) => request(`/api/entities/${entityName}/bulkCreate`, { method: "POST", body: items }),
    updateMany: async (filter, update) => {
      // Supports updateMany({status:"active"}, {$set:{status:"archived"}})
      let body = {};
      if (filter && update) {
        body = { filter, update };
      } else if (filter && filter.filter) {
        body = filter;
      } else {
        body = { filter, update };
      }
      return request(`/api/entities/${entityName}/updateMany`, { method: "POST", body });
    },
    bulkUpdate: async (items) => request(`/api/entities/${entityName}/bulkUpdate`, { method: "POST", body: items }),
    delete: async (id) => request(`/api/entities/${entityName}/${id}`, { method: "DELETE" }),
    deleteMany: async (filter) => request(`/api/entities/${entityName}/deleteMany`, { method: "POST", body: filter }),
    // Polling-based subscribe for live lists
    subscribe: (callback) => {
      // Simple polling every 5s for CommunityMessage; return unsubscribe
      let stopped = false;
      let timer = null;
      const poll = async () => {
        if (stopped) return;
        try {
          const data = await request(`/api/entities/${entityName}/filter`, { method: "POST", body: { filter: {}, sort: "-created_date", limit: 50 } });
          callback({ data, type: "poll" });
        } catch {}
        if (!stopped) timer = setTimeout(poll, 5000);
      };
      // Don't auto-poll for non-message entities to save requests
      if (entityName === "CommunityMessage") {
        poll();
      }
      return () => { stopped = true; if (timer) clearTimeout(timer); };
    },
    // For list() convenience
    list: async (params = {}) => {
      const qs = new URLSearchParams();
      if (params.sort) qs.set("sort", params.sort);
      if (params.limit) qs.set("limit", params.limit);
      const url = `/api/entities/${entityName}` + (qs.toString() ? `?${qs}` : "");
      return request(url);
    },
  };
}

export const api = {
  entities: {
    LearningProfile: createEntity("LearningProfile"),
    Roadmap: createEntity("Roadmap"),
    Task: createEntity("Task"),
    Lesson: createEntity("Lesson"),
    LessonProgress: createEntity("LessonProgress"),
    Conversation: createEntity("Conversation"),
    Project: createEntity("Project"),
    CV: createEntity("CV"),
    Notification: createEntity("Notification"),
    Community: createEntity("Community"),
    CommunityMessage: createEntity("CommunityMessage"),
  },
  functions: {
    invoke: async (name, payload = {}, { timeoutMs = 150000 } = {}) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const result = await request(`/api/functions/${name}`, { method: "POST", body: payload, signal: ctrl.signal });
        // Our API returns directly; wrap for compatibility with `res.data || res`
        if (result && typeof result === "object" && !Array.isArray(result) && result.data !== undefined) {
          return result;
        }
        return { data: result };
      } finally {
        clearTimeout(timer);
      }
    },
    getLessonChat: (lessonId) => request(`/api/functions/lessonChat/${lessonId}`),
  },
  admin: {
    get: (path) => request(`/api/admin${path}`),
    post: (path, body = {}) => request(`/api/admin${path}`, { method: "POST", body }),
    put: (path, body = {}) => request(`/api/admin${path}`, { method: "PUT", body }),
    del: (path) => request(`/api/admin${path}`, { method: "DELETE" }),
  },
  support: {
    submit: (data) => {
      const form = new FormData();
      form.append("email", data.email);
      form.append("phone", data.phone);
      form.append("problem", data.problem);
      (data.images || []).forEach((image) => form.append("images", image));
      return request("/api/support/requests", { method: "POST", body: form, isFormData: true });
    },
    socialLinks: () => request("/api/support/social-links"),
  },
  subscriptions: {
    getPlans: () => request("/api/subscriptions/plans"),
    submitPayment: (data) => request("/api/subscriptions/submit", { method: "POST", body: data }),
    getMyStatus: () => request("/api/subscriptions/my-status"),
    // Public receipt upload (works for pending users with no token).
    uploadReceipt: async ({ file }) => {
      const fd = new FormData();
      fd.append("file", file);
      return request("/api/subscriptions/upload-receipt", { method: "POST", body: fd, isFormData: true });
    },
  },
  integrations: {
    Core: {
      UploadPublicFile: async ({ file }) => {
        const fd = new FormData();
        fd.append("file", file);
        const result = await request(`/api/upload`, { method: "POST", body: fd, isFormData: true });
        return result;
      },
      UploadFile: async ({ file }) => {
        const fd = new FormData();
        fd.append("file", file);
        return request(`/api/upload`, { method: "POST", body: fd, isFormData: true });
      },
    },
  },
  auth: {
    _saveSession: (data) => {
      if (data && data.access_token) {
        try {
          localStorage.setItem(TOKEN_KEY, data.access_token);
          localStorage.setItem("zeus_auth", "true");
        } catch {}
      }
      return data;
    },
    me: async () => {
      if (!getToken()) throw { status: 401, message: "Not authenticated" };
      return request(`/api/auth/me`);
    },
    logout: async (href) => {
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("zeus_auth"); } catch {}
      window.location.href = "/login";
    },
    redirectToLogin: (returnTo) => {
      window.location.href = "/login";
    },
    isAuthenticated: async () => !!getToken(),
    loginViaEmailPassword: async (email, password) => {
      const data = await request(`/api/auth/login`, { method: "POST", body: { email, password } });
      api.auth._saveSession(data);
      return data;
    },
    loginWithProvider: async (provider, returnTo = "/onboarding") => {
      if (provider !== "google") throw new Error("Only Google login is supported");
      const qs = new URLSearchParams({ returnTo: returnTo || "/onboarding" });
      const res = await request(`/api/auth/google/login?${qs.toString()}`);
      const url = res.auth_url || res.data?.auth_url;
      if (!url) throw new Error("Google login failed to start — try again");
      window.location.href = url;
    },
    handleGoogleCallback: () => {
      try {
        const q = new URLSearchParams(window.location.search);
        const token = q.get("token");
        const to = q.get("to") || "/onboarding";
        const err = q.get("google_error");
        if (err) throw new Error(`Google login failed (${err})`);
        if (!token) throw new Error("Missing login token from Google");
        api.auth.setToken(token);
        try { localStorage.setItem("zeus_auth", "true"); } catch {}
        window.location.href = to.startsWith("/") ? to : "/onboarding";
      } catch (e) {
        window.location.href = `/login?google_error=${encodeURIComponent(e.message)}`;
      }
    },
    register: async ({ email, password }) => {
      const data = await request(`/api/auth/register`, { method: "POST", body: { email, password } });
      api.auth._saveSession(data);
      return data;
    },
    verifyOtp: async () => { throw new Error("OTP is disabled"); },
    setToken: (token) => { try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch {} },
    resendOtp: async () => { throw new Error("OTP is disabled"); },
    resetPasswordRequest: async () => { throw new Error("Password reset is not available yet"); },
    resetPassword: async () => { throw new Error("Password reset is not available yet"); },
  },
};

export default api;
