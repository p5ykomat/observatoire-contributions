import i18n from "./i18n";
export class ApiError extends Error {
  constructor(
    public status: number,
    public retryAfter = 0,
    message = i18n.t("errors.network"),
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      retry_after?: number;
    };
    throw new ApiError(
      response.status,
      data.retry_after ?? 0,
      path === "dashboard"
        ? i18n.t(
            response.status === 404
              ? "dashboardNotFound"
              : "dashboardUnavailable",
          )
        : undefined,
    );
  }
  return response.json() as Promise<T>;
}
export async function retry<T>(
  operation: () => Promise<T>,
  onRetry: () => void,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        signal?.aborted ||
        attempt >= 3 ||
        (error instanceof ApiError &&
          ![429, 500, 502, 503, 504].includes(error.status))
      )
        throw error;
      onRetry();
      const delay = Math.max(
        error instanceof ApiError ? error.retryAfter * 1000 : 0,
        1000 * 2 ** attempt + Math.random() * 500,
      );
      await wait(delay, signal);
    }
  }
}
export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("", "AbortError"));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
