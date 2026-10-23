export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  return 'name' in err && (err as { name?: string }).name === 'AbortError';
}
