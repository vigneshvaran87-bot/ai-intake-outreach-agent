export async function withRetry(fn, { attempts = 3, delayMs = 350, shouldRetry = () => true } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return { value: await fn(attempt), attempts: attempt }; }
    catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) break;
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}
