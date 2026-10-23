/** Read-only task observation may retry; uploads and creation must never be replayed. */
export function abortTaskObservation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Task observation stopped", "AbortError");
}

export async function waitForTaskPoll(ms: number, signal?: AbortSignal): Promise<void> {
  abortTaskObservation(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", cancel); resolve(); };
    const timer = setTimeout(finish, Math.max(0, ms));
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(new DOMException("Task observation stopped", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export const transientTaskStatus = (status: number): boolean => [408, 429, 500, 502, 503, 504].includes(status);
