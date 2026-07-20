const SENSITIVE_QUERY_KEY = /(?:token|secret|password|passcode|signature|authorization|session|api[-_]?key)/i;

const cleanLogText = (value: string): string =>
  value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 2048);

export const redactUrlForLogs = (value: string): string => {
  try {
    const parsed = new URL(value, 'http://internal.invalid');
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    return cleanLogText(`${parsed.pathname}${parsed.search}`);
  } catch {
    const [path] = value.split('?');
    return cleanLogText(path || '/');
  }
};

export const safeDevelopmentError = (error: unknown): { name: string; message: string } => {
  if (!(error instanceof Error)) return { name: 'Error', message: 'Unknown error' };
  return {
    name: cleanLogText(error.name || 'Error'),
    message: cleanLogText(error.message || 'Unknown error'),
  };
};
