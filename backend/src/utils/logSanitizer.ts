/**
 * Log sanitization utility to prevent sensitive credentials, tokens,
 * and API keys from leaking into stdout / server logs.
 */

const SENSITIVE_PATTERNS = [
  // OpenAI API Key
  { pattern: /sk-[A-Za-z0-9_\-]{20,}/g, replacement: '[REDACTED_OPENAI_KEY]' },
  // GitHub Tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { pattern: /gh[pousr][_-][A-Za-z0-9_]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  // AWS Access Key ID
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  // Bearer tokens in Authorization header
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // Password / Secret in json or query strings
  { pattern: /(password|secret|token|apiKey|api_key)=([^&\s]+)/gi, replacement: '$1=[REDACTED]' },
  { pattern: /"(password|secret|token|apiKey|api_key)"\s*:\s*"[^"]+"/gi, replacement: '"$1":"[REDACTED]"' },
];

export function sanitizeLogMessage(message: string): string {
  if (!message || typeof message !== 'string') return message;

  let sanitized = message;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

export function createSanitizedMorganFormat() {
  return (tokens: any, req: any, res: any) => {
    // Redact sensitive headers
    const sanitizedUrl = sanitizeLogMessage(tokens.url(req, res) || '');
    const status = tokens.status(req, res);
    const method = tokens.method(req, res);
    const responseTime = tokens['response-time'](req, res);

    const logLine = `${method} ${sanitizedUrl} ${status} - ${responseTime} ms`;
    return sanitizeLogMessage(logLine);
  };
}
