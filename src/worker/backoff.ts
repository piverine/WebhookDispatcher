/**
 * Calculates exponential backoff with optional jitter.
 * 
 * Formula:
 * delay = baseMs * 2^(attempt - 1) + jitter
 * 
 * For baseMs = 2000:
 * attempt 1 -> 2000ms + jitter
 * attempt 2 -> 4000ms + jitter
 * attempt 3 -> 8000ms + jitter
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs = 2000,
  jitterMs = Math.floor(Math.random() * 250)
): number {
  const exponent = Math.max(0, attempt - 1);
  const exponentialDelay = baseMs * Math.pow(2, exponent);
  return exponentialDelay + jitterMs;
}

