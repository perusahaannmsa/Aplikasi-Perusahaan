/**
 * backendApi.ts - Utility helper for routing and executing API requests
 * Supports both same-origin /api calls and custom persistent Backend Server URLs
 * (e.g. Render, Railway, VPS) when frontend is deployed on serverless hosts like Vercel.
 */

const STORAGE_KEY = 'nmsa_backend_api_url';

function sanitizeBackendUrl(raw: string | undefined | null): string {
  if (!raw || !raw.trim()) return '';
  const clean = raw.trim().replace(/\/+$/, '');
  if (
    clean.includes('ais-dev-') ||
    clean.includes('.run.app') ||
    clean.includes('googleusercontent.com') ||
    clean.includes('aistudio')
  ) {
    return '';
  }
  return clean;
}

export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved.trim()) {
    const clean = sanitizeBackendUrl(saved);
    if (!clean) {
      console.info('[backendApi] Purging invalid AI Studio preview URL from localStorage:', saved);
      localStorage.removeItem(STORAGE_KEY);
    } else {
      return clean;
    }
  }
  const envBackend = sanitizeBackendUrl((import.meta as any).env?.VITE_BACKEND_URL);
  return envBackend;
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = sanitizeBackendUrl(url);
  if (!clean) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, clean);
  }
}

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = getBackendBaseUrl();
  if (base) {
    return `${base}${cleanEndpoint}`;
  }
  return cleanEndpoint;
}

function isStatefulBackendEndpoint(cleanEndpoint: string): boolean {
  return (
    cleanEndpoint.startsWith('/api/wa') ||
    cleanEndpoint.startsWith('/api/health') ||
    cleanEndpoint.startsWith('/api/bot-reminder-settings') ||
    cleanEndpoint.startsWith('/api/trigger-bot-reminder') ||
    cleanEndpoint.startsWith('/api/cron') ||
    cleanEndpoint.startsWith('/api/ai-query')
  );
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = getBackendBaseUrl();
  const url = base ? `${base}${cleanEndpoint}` : cleanEndpoint;
  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (options.body && typeof options.body === 'string' && !options.headers) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const mergedHeaders = {
    ...defaultHeaders,
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers: mergedHeaders,
    });
    return res;
  } catch (err: any) {
    // Only fall back to same-origin for non-WA endpoints.
    // For WhatsApp/Bot endpoints when a persistent backend URL IS configured, never silently mix
    // with the Vercel serverless stub (which would flash OFFLINE and wipe QR/pairing state).
    if (base && url !== cleanEndpoint && !isStatefulBackendEndpoint(cleanEndpoint)) {
      console.warn(`[backendApi] Failed to fetch from custom backend (${base}). Falling back to same-origin ${cleanEndpoint}...`, err);
      return fetch(cleanEndpoint, {
        ...options,
        headers: mergedHeaders,
      });
    }
    throw err;
  }
}
