const DEFAULT_RETRY_COUNT = Number(process.env.RETRY_COUNT || 3);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff.
 * @param {Function} fn - async function to execute
 * @param {Object} options
 * @param {number} options.retries - max retry attempts (default 3)
 * @param {number} options.baseDelayMs - base delay in ms (default 1000)
 * @param {Function} [options.shouldRetry] - predicate (error) => bool, defaults to retry on network/5xx errors
 * @param {string} [options.label] - label for logging
 */
export async function retry(fn, options = {}) {
  const {
    retries = DEFAULT_RETRY_COUNT,
    baseDelayMs = DEFAULT_RETRY_DELAY_MS,
    shouldRetry = defaultShouldRetry,
    label = 'operation',
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[RETRY] ${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function defaultShouldRetry(error) {
  // Retry on network errors (no response) or 5xx server errors
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 && status < 600;
}

/**
 * Simple circuit breaker.
 * States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (probe) → CLOSED
 *
 * @param {Object} options
 * @param {number} options.failureThreshold - consecutive failures to open (default 5)
 * @param {number} options.resetTimeoutMs - time before half-open probe (default 60000)
 * @param {string} options.label - label for logging
 */
export function createCircuitBreaker(options = {}) {
  const {
    failureThreshold = Number(process.env.CB_FAILURE_THRESHOLD || 5),
    resetTimeoutMs = Number(process.env.CB_RESET_TIMEOUT_MS || 60000),
    label = 'circuit',
  } = options;

  let state = 'CLOSED';
  let failureCount = 0;
  let lastFailureTime = 0;

  function getState() {
    if (state === 'OPEN' && Date.now() - lastFailureTime >= resetTimeoutMs) {
      console.log(`[CIRCUIT] ${label}: OPEN -> HALF_OPEN (probe)`);
      state = 'HALF_OPEN';
    }
    return state;
  }

  function onSuccess() {
    if (state !== 'CLOSED') {
      console.log(`[CIRCUIT] ${label}: ${state} -> CLOSED (recovered)`);
    }
    state = 'CLOSED';
    failureCount = 0;
  }

  function onFailure() {
    failureCount++;
    lastFailureTime = Date.now();
    if (failureCount >= failureThreshold) {
      state = 'OPEN';
      console.warn(`[CIRCUIT] ${label}: CLOSED -> OPEN (${failureCount} consecutive failures, will retry after ${resetTimeoutMs}ms)`);
    }
  }

  return {
    get state() { return getState(); },
    get failureCount() { return failureCount; },

    /**
     * Execute fn through the circuit breaker.
     * Throws immediately if circuit is OPEN.
     */
    async execute(fn) {
      const currentState = getState();
      if (currentState === 'OPEN') {
        throw new Error(`[CIRCUIT] ${label}: circuit is OPEN, request blocked`);
      }
      try {
        const result = await fn();
        onSuccess();
        return result;
      } catch (error) {
        onFailure();
        throw error;
      }
    },

    /** Manually reset the circuit to CLOSED. */
    reset() {
      state = 'CLOSED';
      failureCount = 0;
      console.log(`[CIRCUIT] ${label}: manually reset to CLOSED`);
    },
  };
}
