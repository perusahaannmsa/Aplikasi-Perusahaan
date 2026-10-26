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
    const clean = saved.trim().replace(/\/+$/, '');
    // Automatically purge internal AI Studio dev URLs or invalid preview URLs which block CORS
    if (
      clean.includes('ais-dev-') || 
      clean.includes('.run.app') || 
      clean.includes('googleusercontent.com') ||
      clean.includes('aistudio')
    ) {
      console.info('[backendApi] Purging invalid AI Studio preview URL from localStorage:', clean);
      localStorage.removeItem(STORAGE_KEY);
      return '';
    }
    return clean;
  }
  return '';
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/+$/, '');
  if (
    !clean || 
    clean.includes('ais-dev-') || 
    clean.includes('.run.app') || 
    clean.includes('googleusercontent.com')
  ) {
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
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = buildApiUrl(cleanEndpoint);
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
    // If request to custom external backend failed (CORS error, offline, or network failure),
    // and a custom base URL was used, gracefully fallback to same-origin /api
    const base = getBackendBaseUrl();
    if (base && url !== cleanEndpoint) {
      console.warn(`[backendApi] Failed to fetch from custom backend (${base}). Falling back to same-origin ${cleanEndpoint}...`, err);
      return fetch(cleanEndpoint, {
        ...options,
        headers: mergedHeaders,
      });
    }
    throw err;
  }
}
