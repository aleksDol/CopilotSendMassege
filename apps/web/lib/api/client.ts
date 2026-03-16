import { ApiError } from "./errors";
import { clearStoredToken } from "@/lib/auth/token";

type RequestOptions = {
  token?: string | null;
  query?: Record<string, string | number | boolean | undefined | null>;
};

// В браузере по умолчанию ходим на /api текущего домена (через nginx),
// на сервере (SSR) оставляем возможность использовать полный URL из env.
const API_URL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    : process.env.NEXT_PUBLIC_API_URL ?? "/api";

const buildUrl = (path: string, query?: RequestOptions["query"]) => {
  const url = new URL(path, API_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      "content-type": "application/json",
      ...(options?.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    let details: unknown;

    try {
      const payload = (await response.json()) as {
        error?: { message?: string; code?: string; details?: unknown };
      };
      if (payload.error?.message) {
        message = payload.error.message;
      }
      code = payload.error?.code;
      details = payload.error?.details;
    } catch {
      // noop
    }

    if (response.status === 401) {
      clearStoredToken();
    }

    throw new ApiError(message, response.status, code, details);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options)
};
