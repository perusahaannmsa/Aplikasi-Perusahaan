/**
 * backendApi.ts - Utility helper for routing and executing API requests
 * Supports both same-origin /api calls and custom persistent Backend Server URLs
 * (e.g. Render, Railway, VPS) when frontend is deployed on serverless hosts like Vercel.
 */

const STORAGE_KEY = 'nmsa_backend_api_url';

export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }
  return '';
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/+$/, '');
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

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = buildApiUrl(endpoint);
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

  return fetch(url, {
    ...options,
    headers: mergedHeaders,
  });
}
