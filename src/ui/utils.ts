export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  return 'name' in err && (err as { name?: string }).name === 'AbortError';
}

export function formatUserFacingError(
  err: unknown,
  fallback = 'An unexpected error occurred.',
): string {
  const rawMessage = (
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  ).trim();
  if (!rawMessage) {
    return fallback;
  }
  const isRateLimit = /\b429\b|rate[- ]limit|too many requests/i.test(rawMessage);
  const alreadyHasGuidance =
    /rate[- ]limit/i.test(rawMessage) && /\bretry\b/i.test(rawMessage);
  if (isRateLimit && !alreadyHasGuidance) {
    return `Modrinth API rate limit reached (${rawMessage}). Please wait a moment and retry.`;
  }

  const isNotFound = /\b404\b/i.test(rawMessage);
  const alreadyHasNotFoundGuidance = /^collection not found:/i.test(rawMessage);
  if (isNotFound && !alreadyHasNotFoundGuidance) {
    return `Requested Modrinth resource was not found (${rawMessage}). Verify the collection ID or URL is public and valid.`;
  }

  const isServerError =
    /\b50[0234]\b|bad gateway|service unavailable|gateway timeout|internal server error/i.test(
      rawMessage,
    );
  if (isServerError) {
    return `Modrinth server error (${rawMessage}). Please wait a moment and retry.`;
  }

  const isNetworkError =
    /failed to fetch|network\s*error|load failed|network request failed/i.test(rawMessage);
  if (isNetworkError) {
    return `Network connection error (${rawMessage}). Check your internet connection and retry.`;
  }

  return rawMessage;
}
