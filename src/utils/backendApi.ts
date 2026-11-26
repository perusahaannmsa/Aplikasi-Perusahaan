/**
 * backendApi.ts - Utility helper for routing and executing API requests
 * Supports both same-origin /api calls and custom persistent Backend Server URLs
 * (e.g. Render, Railway, VPS) when frontend is deployed on serverless hosts like Vercel.
 */

const STORAGE_KEY = 'nmsa_backend_api_url';
export const DEFAULT_VERCEL_BACKEND_URL = 'https://aplikasi-perusahaan.onrender.com';

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

export function isVercelHostname(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase().endsWith('.vercel.app');
}

export function validateBackendUrlInput(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      error: 'URL harus diawali https:// atau http:// (contoh: https://aplikasi-perusahaan.onrender.com).',
    };
  }
  const sanitized = sanitizeBackendUrl(trimmed);
  if (!sanitized) {
    return {
      valid: false,
      normalized: '',
      error:
        'URL preview AI Studio / Cloud Run tidak mendukung panggilan lintas-domain. Gunakan URL server Node.js publik seperti Render, Railway, Fly.io, atau VPS.',
    };
  }
  if (sanitized.includes('.vercel.app')) {
    return {
      valid: false,
      normalized: '',
      error:
        'Domain Vercel bersifat serverless dan tidak dapat dipakai sebagai backend Baileys. Gunakan URL server Node.js (server.ts).',
    };
  }
  return { valid: true, normalized: sanitized };
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
  if (envBackend) {
    return envBackend;
  }
  if (isVercelHostname()) {
    return DEFAULT_VERCEL_BACKEND_URL;
  }
  return '';
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
    cleanEndpoint.startsWith('/api/baileys') ||
    cleanEndpoint.startsWith('/api/health')
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
