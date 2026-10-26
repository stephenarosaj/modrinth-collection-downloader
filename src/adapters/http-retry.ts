/** Default fetch implementation delegating to global fetch, injectable for testing. */
export function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

/** Constructs an AbortError preserving any cancellation reason from the provided AbortSignal. */
export function createAbortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }
  if (
    typeof reason === 'object' &&
    reason !== null &&
    'message' in reason &&
    typeof (reason as { message: unknown }).message === 'string'
  ) {
    const err = new Error((reason as { message: string }).message);
    err.name =
      'name' in reason && typeof (reason as { name: unknown }).name === 'string'
        ? (reason as { name: string }).name
        : 'AbortError';
    return err;
  }
  const message =
    typeof reason === 'string' && reason.length > 0 ? reason : 'The operation was aborted.';
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/** Throws an AbortError if the provided signal is in the aborted state. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

/** Determines whether an error or signal represents an aborted operation. */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return (
    error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))
  );
}

/** Promise-based sleep timer that resolves after delay or rejects immediately on AbortSignal cancellation. */
export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError(signal));
    };

    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.max(0, ms),
    );

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Returns true for transient HTTP status codes eligible for retry (429 and 5xx). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Calculates retry delay in milliseconds from Retry-After or X-Ratelimit-Reset headers,
 * falling back to exponential backoff based on attempt number and base delay.
 */
export function parseRetryDelayMs(
  headers: Headers,
  attempt: number,
  baseDelayMs: number,
  nowMs: () => number = Date.now,
): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    const trimmed = retryAfter.trim();
    if (trimmed.length > 0) {
      const seconds = Number(trimmed);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.ceil(seconds * 1000);
      }
      const dateMs = Date.parse(trimmed);
      if (!Number.isNaN(dateMs)) {
        return Math.max(0, dateMs - nowMs());
      }
    }
  }

  const rateLimitReset = headers.get('x-ratelimit-reset');
  if (rateLimitReset !== null) {
    const trimmed = rateLimitReset.trim();
    if (trimmed.length > 0) {
      const seconds = Number(trimmed);
      if (Number.isFinite(seconds) && seconds > 0) {
        // Modrinth's X-Ratelimit-Reset is seconds remaining until window reset.
        return Math.ceil(seconds * 1000);
      }
    }
  }

  return baseDelayMs * Math.pow(2, attempt);
}
