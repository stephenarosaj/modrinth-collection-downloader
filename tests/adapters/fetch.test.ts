import { describe, expect, it, vi } from 'vitest';
import { createFileFetcher, FileFetchError, HttpFileFetcher } from '../../src/adapters/fetch';
import { parseRetryDelayMs } from '../../src/adapters/http-retry';

function makeBinaryResponse(
  bytes: number[],
  init: ResponseInit = { status: 200, statusText: 'OK' },
): Response {
  const uint8 = new Uint8Array(bytes);
  return new Response(uint8.buffer, init);
}

describe('HttpFileFetcher', () => {
  it('fetches binary content and returns a Uint8Array', async () => {
    const expected = [0x50, 0x4b, 0x03, 0x04, 0xca, 0xfe];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(makeBinaryResponse(expected));

    const fetcher = createFileFetcher({ fetchImpl: fetchMock });
    const url = 'https://cdn.modrinth.com/data/AANobbMI/versions/1/sodium.jar';

    const result = await fetcher.fetchBinary(url);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, {
      method: 'GET',
      signal: undefined,
    });
  });

  it('lazily delegates default fetchImpl to globalThis.fetch installed after construction', async () => {
    const fetcher = createFileFetcher();
    const expected = [0xde, 0xad, 0xbe, 0xef];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeBinaryResponse(expected));

    try {
      const url = 'https://cdn.modrinth.com/data/lazy/default-fetch.jar';
      const result = await fetcher.fetchBinary(url);

      expect(Array.from(result)).toEqual(expected);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(url, {
        method: 'GET',
        signal: undefined,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('retries on 429 honoring Retry-After header and succeeds on subsequent 200', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '3' },
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([1, 2, 3, 4]));

    const fetcher = new HttpFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 200,
      maxRetries: 3,
    });

    const data = await fetcher.fetchBinary('https://cdn.modrinth.com/data/test/mod.jar');

    expect(Array.from(data)).toEqual([1, 2, 3, 4]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([3000]);
  });

  it('honors Retry-After HTTP-date header when calculating retry delay', async () => {
    const fixedNow = Date.parse('2026-10-23T12:00:00Z');
    const retryAt = 'Fri, 23 Oct 2026 12:00:04 GMT';

    expect(parseRetryDelayMs(new Headers({ 'Retry-After': retryAt }), 0, 250, () => fixedNow)).toBe(
      4000,
    );

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const sleepCalls: number[] = [];
      const sleepMock = vi.fn(async (ms: number) => {
        sleepCalls.push(ms);
      });

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response('Rate limited', {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': retryAt },
          }),
        )
        .mockResolvedValueOnce(makeBinaryResponse([5, 6, 7]));

      const fetcher = createFileFetcher({
        fetchImpl: fetchMock,
        sleep: sleepMock,
        baseDelayMs: 250,
      });

      const data = await fetcher.fetchBinary('https://cdn.modrinth.com/data/test/http-date.jar');
      expect(Array.from(data)).toEqual([5, 6, 7]);
      expect(sleepCalls).toEqual([4000]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('retries on 429 honoring X-Ratelimit-Reset when Retry-After is absent', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'X-Ratelimit-Reset': '2' },
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([9, 8, 7]));

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 100,
    });

    const data = await fetcher.fetchBinary('https://cdn.modrinth.com/data/test/reset.jar');

    expect(Array.from(data)).toEqual([9, 8, 7]);
    expect(sleepCalls).toEqual([2000]);
  });

  it('falls back to exponential backoff on 503 when X-Ratelimit-Reset is 0 or headers are blank', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'X-Ratelimit-Reset': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Retry-After': '   ', 'X-Ratelimit-Reset': '   ' },
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([11, 22, 33]));

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 300,
      maxRetries: 3,
    });

    const data = await fetcher.fetchBinary('https://cdn.modrinth.com/data/test/zero-reset.jar');

    expect(Array.from(data)).toEqual([11, 22, 33]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([300, 600]);
  });

  it('clamps negative maxRetries and baseDelayMs to 0', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const noRetryFetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );

    const noRetryFetcher = createFileFetcher({
      fetchImpl: noRetryFetchMock,
      sleep: sleepMock,
      maxRetries: -2,
      baseDelayMs: -100,
    });

    await expect(
      noRetryFetcher.fetchBinary('https://cdn.modrinth.com/data/test/negative-retries.jar'),
    ).rejects.toBeInstanceOf(FileFetchError);
    expect(noRetryFetchMock).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);

    const negativeDelayFetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([42]));

    const clampedDelayFetcher = createFileFetcher({
      fetchImpl: negativeDelayFetchMock,
      sleep: sleepMock,
      maxRetries: 1,
      baseDelayMs: -500,
    });

    const result = await clampedDelayFetcher.fetchBinary(
      'https://cdn.modrinth.com/data/test/negative-delay.jar',
    );
    expect(Array.from(result)).toEqual([42]);
    expect(sleepCalls).toEqual([0]);
  });

  it('retries on 503 using exponential backoff and succeeds on subsequent 200', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      )
      .mockResolvedValueOnce(
        new Response('Bad Gateway', {
          status: 502,
          statusText: 'Bad Gateway',
        }),
      )
      .mockResolvedValueOnce(makeBinaryResponse([10, 20, 30]));

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 250,
      maxRetries: 3,
    });

    const data = await fetcher.fetchBinary('https://cdn.modrinth.com/data/test/backoff.jar');

    expect(Array.from(data)).toEqual([10, 20, 30]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([250, 500]);
  });

  it('throws FileFetchError immediately on non-retryable 404 without retrying', async () => {
    const sleepMock = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      maxRetries: 3,
    });
    const url = 'https://cdn.modrinth.com/data/missing/file.jar';

    await expect(fetcher.fetchBinary(url)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FileFetchError &&
        err.url === url &&
        err.status === 404 &&
        err.message.includes('404') &&
        err.message.includes(url),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('throws FileFetchError when retries are exhausted on repeated 500 responses', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 100,
      maxRetries: 2,
    });
    const url = 'https://cdn.modrinth.com/data/failing/mod.jar';

    await expect(fetcher.fetchBinary(url)).rejects.toSatisfy(
      (err: unknown) => err instanceof FileFetchError && err.url === url && err.status === 500,
    );
    // Initial attempt + 2 retries = 3 total attempts
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([100, 200]);
  });

  it('retries transient network errors and throws FileFetchError if exhausted', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 50,
      maxRetries: 2,
    });
    const url = 'https://cdn.modrinth.com/data/network/error.jar';

    await expect(fetcher.fetchBinary(url)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FileFetchError &&
        err.url === url &&
        err.status === undefined &&
        err.message.includes('Failed to fetch'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([50, 100]);
  });

  it('retries mid-body response.arrayBuffer() failures, wraps in FileFetchError on exhaustion, and normalizes mid-body abort', async () => {
    const sleepCalls: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const brokenBodyResponse = () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        arrayBuffer: () => Promise.reject(new TypeError('Body stream terminated early')),
      }) as unknown as Response;

    // 1. Retries mid-body error and succeeds on retry
    const retryFetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(brokenBodyResponse())
      .mockResolvedValueOnce(makeBinaryResponse([7, 8, 9]));

    const retryFetcher = createFileFetcher({
      fetchImpl: retryFetchMock,
      sleep: sleepMock,
      baseDelayMs: 40,
      maxRetries: 2,
    });

    const recovered = await retryFetcher.fetchBinary(
      'https://cdn.modrinth.com/data/body/recover.jar',
    );
    expect(Array.from(recovered)).toEqual([7, 8, 9]);
    expect(retryFetchMock).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([40]);

    // 2. Exhausts retries and wraps in FileFetchError
    sleepCalls.length = 0;
    const exhaustedFetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => brokenBodyResponse());
    const exhaustedFetcher = createFileFetcher({
      fetchImpl: exhaustedFetchMock,
      sleep: sleepMock,
      baseDelayMs: 40,
      maxRetries: 1,
    });
    const exhaustedUrl = 'https://cdn.modrinth.com/data/body/exhausted.jar';

    await expect(exhaustedFetcher.fetchBinary(exhaustedUrl)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FileFetchError &&
        err.url === exhaustedUrl &&
        err.message.includes('Body stream terminated early'),
    );
    expect(exhaustedFetchMock).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([40]);

    // 3. Normalizes mid-body abort to AbortError without retrying
    sleepCalls.length = 0;
    const abortController = new AbortController();
    const abortMidBodyFetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        arrayBuffer: async () => {
          abortController.abort(new DOMException('Aborted mid-stream', 'AbortError'));
          throw new TypeError('Stream read aborted');
        },
      } as unknown as Response;
    });

    const abortFetcher = createFileFetcher({
      fetchImpl: abortMidBodyFetchMock,
      sleep: sleepMock,
      maxRetries: 3,
    });

    await expect(
      abortFetcher.fetchBinary('https://cdn.modrinth.com/data/body/abort.jar', {
        signal: abortController.signal,
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof Error && err.name === 'AbortError');
    expect(abortMidBodyFetchMock).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);
  });

  it('rejects immediately without calling fetch when AbortSignal is pre-aborted', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const fetcher = createFileFetcher({ fetchImpl: fetchMock });

    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled by user', 'AbortError'));

    await expect(
      fetcher.fetchBinary('https://cdn.modrinth.com/data/abort/mod.jar', {
        signal: controller.signal,
      }),
    ).rejects.toThrow('Cancelled by user');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels during mid-backoff sleep when AbortSignal fires', async () => {
    const controller = new AbortController();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      const response = new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      return Promise.resolve(response).finally(() => {
        queueMicrotask(() => {
          controller.abort();
        });
      });
    });

    const fetcher = createFileFetcher({
      fetchImpl: fetchMock,
      baseDelayMs: 5000,
      maxRetries: 3,
    });

    const promise = fetcher.fetchBinary('https://cdn.modrinth.com/data/abort-backoff/mod.jar', {
      signal: controller.signal,
    });

    await expect(promise).rejects.toThrow(/aborted/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
