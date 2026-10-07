import { afterEach, expect, it, vi } from "vitest";
import { ApiError, retry } from "./api";
afterEach(() => vi.useRealTimers());
it("respecte Retry-After avec une attente dans le navigateur", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const operation = () => {
    calls++;
    return calls === 1
      ? Promise.reject(new ApiError(503, 120))
      : Promise.resolve(4);
  };
  const result = retry(operation, () => {});
  await vi.advanceTimersByTimeAsync(119999);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe(4);
  expect(calls).toBe(2);
});
it("limite les retries et applique le backoff", async () => {
  vi.useFakeTimers();
  const operation = vi.fn(() => Promise.reject(new ApiError(503)));
  const result = retry(operation, () => {}).catch((e) => e);
  await vi.runAllTimersAsync();
  expect(await result).toBeInstanceOf(ApiError);
  expect(operation).toHaveBeenCalledTimes(4);
});
it("ne réessaie pas une erreur non temporaire", async () => {
  const operation = vi.fn(() => Promise.reject(new ApiError(404)));
  await expect(retry(operation, () => {})).rejects.toBeInstanceOf(ApiError);
  expect(operation).toHaveBeenCalledTimes(1);
});
it("annuler interrompt une attente Retry-After", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const result = retry(
    () => Promise.reject(new ApiError(429, 300)),
    () => {},
    controller.signal,
  ).catch((e) => e);
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect((await result).name).toBe("AbortError");
});
