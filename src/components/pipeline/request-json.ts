export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Client-side JSON request that surfaces the server's error message instead of a generic failure. */
export async function requestJson<T>(url: string, init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, message, typeof payload.code === "string" ? payload.code : undefined);
  }
  return payload as T;
}
