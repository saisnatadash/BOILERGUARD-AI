/** Thin API client. Adds the bearer token, normalises errors, and never hides server messages. */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "boilerguard.token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d?.msg ?? JSON.stringify(d)).join("; ");
  }
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors: { field: string; message: string }[] }).errors;
    return errors.map((e) => `${e.field || "input"}: ${e.message}`).join("; ");
  }
  return fallback;
}

async function request(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, `Cannot reach the BOILERGUARD API at ${API_BASE}. Check that the backend is running.`);
  }
  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    throw new ApiError(response.status, messageFrom(parsed, text || response.statusText));
  }
  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await request(path)).json() as Promise<T>;
}

export async function apiSend<T>(method: "POST" | "PATCH" | "DELETE", path: string, json?: unknown): Promise<T> {
  const response = await request(path, { method, json });
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return (await request(path, { method: "POST", body: form })).json() as Promise<T>;
}

/** Fetches a protected binary resource (images, PDFs, CSV) and returns an object URL for display or download. */
export async function apiBlobUrl(path: string): Promise<string> {
  const blob = await (await request(path)).blob();
  return URL.createObjectURL(blob);
}

export async function downloadProtected(path: string, filename: string): Promise<void> {
  const url = await apiBlobUrl(path);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
