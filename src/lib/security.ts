const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeExternalUrl(
  value: string | null | undefined,
  options?: {
    allowDataImage?: boolean;
  }
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }

  if (options?.allowDataImage && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function sanitizeInternalRedirectPath(
  value: string | null | undefined,
  fallback = "/staff/dashboard"
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /[\r\n\\]/.test(trimmed)) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "https://scorecard.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
