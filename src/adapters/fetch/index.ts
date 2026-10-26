import type { FileFetcher, RequestOptions } from '../../ports';
import {
  createAbortError,
  defaultFetch,
  defaultSleep,
  isAbortError,
  isRetryableStatus,
  parseRetryDelayMs,
  throwIfAborted,
} from '../http-retry';

/** Configuration options for HttpFileFetcher. */
export interface FileFetcherOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Error thrown when a binary file fetch fails, preserving the target URL and HTTP status code if available. */
export class FileFetchError extends Error {
  public readonly url: string;
  public readonly status?: number;

  constructor(message: string, url: string, status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FileFetchError';
    this.url = url;
    this.status = status;
  }
}

/**
 * FileFetcher adapter that downloads binary files via HTTP.
 * Retries on 429 and 5xx responses with exponential backoff and respects AbortSignal cancellation.
 */
export class HttpFileFetcher implements FileFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(opts: FileFetcherOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
    this.maxRetries = Math.max(0, opts.maxRetries ?? 3);
    this.baseDelayMs = Math.max(0, opts.baseDelayMs ?? 500);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async fetchBinary(url: string, opts?: RequestOptions): Promise<Uint8Array> {
    const signal = opts?.signal;
    throwIfAborted(signal);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      throwIfAborted(signal);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          signal,
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          throwIfAborted(signal);
          return new Uint8Array(buffer);
        }
      } catch (error) {
        if (isAbortError(error, signal)) {
          throw createAbortError(signal);
        }
        if (attempt < this.maxRetries) {
          const delayMs = this.baseDelayMs * Math.pow(2, attempt);
          await this.sleep(delayMs, signal);
          continue;
        }
        throw new FileFetchError(
          `Failed to fetch binary from ${url} after ${attempt + 1} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`,
          url,
          undefined,
          { cause: error },
        );
      }

      const status = response.status;
      if (isRetryableStatus(status) && attempt < this.maxRetries) {
        const delayMs = parseRetryDelayMs(response.headers, attempt, this.baseDelayMs);
        await this.sleep(delayMs, signal);
        continue;
      }

      throw new FileFetchError(
        `HTTP ${status} (${response.statusText || 'Error'}) while fetching ${url}`,
        url,
        status,
      );
    }

    throw new FileFetchError(`Failed to fetch binary from ${url}`, url);
  }
}

/** Factory function creating a new HttpFileFetcher instance. */
export function createFileFetcher(opts?: FileFetcherOptions): FileFetcher {
  return new HttpFileFetcher(opts);
}
