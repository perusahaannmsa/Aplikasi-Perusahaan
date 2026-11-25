import { useState, useEffect, useCallback, useRef } from "react";

export type BaileysStatus = "disconnected" | "connecting" | "qr" | "connected";

export interface BaileysUser {
  id: string;
  name?: string;
}

export interface BaileysState {
  status: BaileysStatus;
  isConnected: boolean;
  qr: string | null;
  qrSeq: number;
  qrUpdatedAt: number | null;
  qrExpiresAt: number | null;
  qrTtlMs: number;
  serverNow: number;
  isPairingInProgress: boolean;
  pairingCode: string | null;
  pairingPhone: string | null;
  user: BaileysUser | null;
  error: string | null;
  hasCredentials: boolean;
  lateReminderPending: boolean;
  absentWorkersCount: number;
  absentWorkersNames: string[];
  todayDate: string;
}

export interface BaileysAutomationSettings {
  masterAutoSendEnabled: boolean;
  autoReminderEnabled: boolean;
  autoReminderHour: string;
  reminderActiveDays: string[];
  skipHolidays: boolean;
  skipWeekends: boolean;
  requireFridaySignature: boolean;
  allowLocationCheckin: boolean;
  lastCronPing: string;
  lastCronStatus: string;
  lastCronSentDate: string;
  serverTimeWIB: string;
  totalActiveWorkers: number;
  pendingAttendanceCount: number;
  waConnected: boolean;
  waPhone: string | null;
}

const BAILEYS_SYNC_EVENT = "nmsa-baileys-sync";

const DEFAULT_STATE: BaileysState = {
  status: "disconnected",
  isConnected: false,
  qr: null,
  qrSeq: 0,
  qrUpdatedAt: null,
  qrExpiresAt: null,
  qrTtlMs: 60000,
  serverNow: Date.now(),
  isPairingInProgress: false,
  pairingCode: null,
  pairingPhone: null,
  user: null,
  error: null,
  hasCredentials: false,
  lateReminderPending: false,
  absentWorkersCount: 0,
  absentWorkersNames: [],
  todayDate: "",
};

export function normalizeWhatsAppPhone(phone: string): string {
  let clean = String(phone || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("620")) clean = "62" + clean.slice(3);
  else if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  else if (clean.startsWith("8")) clean = "62" + clean;
  return clean;
}

export function buildWhatsAppShareUrl(
  message: string,
  phone?: string,
  mode: "web" | "desktop" = "web"
): string {
  const encodedMsg = encodeURIComponent(message);
  const cleanPhone = phone ? normalizeWhatsAppPhone(phone) : "";
  if (mode === "desktop") {
    return cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`
      : `whatsapp://send?text=${encodedMsg}`;
  }
  return cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
    : `https://api.whatsapp.com/send?text=${encodedMsg}`;
}

function broadcastStateUpdate(state: BaileysState) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<BaileysState>(BAILEYS_SYNC_EVENT, { detail: state }));
  }
}

export async function fetchBaileysStatus(activeUi = false): Promise<BaileysState> {
  const res = await fetch(`/api/baileys/status?${activeUi ? "activeUi=1" : "background=1"}`, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return {
    ...DEFAULT_STATE,
    ...data,
    status: (data.status as BaileysStatus) || "disconnected",
    isConnected: Boolean(data.isConnected || data.status === "connected"),
    qr: data.isPairingInProgress ? null : data.qr || null,
    user: data.user || null,
    error: data.error ? String(data.error) : null,
  };
}

export async function refreshBaileysQr(): Promise<BaileysState> {
  const res = await fetch("/api/baileys/refresh-qr", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  const next: BaileysState = {
    ...DEFAULT_STATE,
    ...data,
    status: (data.status as BaileysStatus) || "connecting",
    isConnected: Boolean(data.isConnected || data.status === "connected"),
    qr: data.qr || null,
    user: data.user || null,
    error: data.error ? String(data.error) : null,
  };
  broadcastStateUpdate(next);
  return next;
}

export async function requestBaileysPairingCode(
  phone: string
): Promise<{ success: boolean; code?: string; state?: BaileysState; error?: string }> {
  const clean = normalizeWhatsAppPhone(phone);
  if (clean.length < 9 || clean.length > 15) {
    return {
      success: false,
      error: "Format nomor tidak valid. Masukkan nomor WhatsApp lengkap (contoh: 0812xxxxxx).",
    };
  }
  const res = await fetch("/api/baileys/pairing-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: clean }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success && (data.code || data.pairingCode)) {
    const code = String(data.code || data.pairingCode);
    const next: BaileysState = {
      ...DEFAULT_STATE,
      ...data,
      pairingCode: code,
      pairingPhone: clean,
    };
    broadcastStateUpdate(next);
    return { success: true, code, state: next };
  }
  return {
    success: false,
    error: data.error ? String(data.error) : "Gagal membuat Kode Pairing Baileys.",
  };
}

export async function disconnectBaileys(): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/baileys/disconnect", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (data.success) {
    broadcastStateUpdate({ ...DEFAULT_STATE, status: "disconnected" });
  }
  return { success: Boolean(data.success), error: data.error };
}

export async function sendViaBaileys(
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/baileys/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    success: Boolean(res.ok && data.success),
    error: data.error ? String(data.error) : undefined,
  };
}

export async function fetchBaileysSettings(): Promise<BaileysAutomationSettings | null> {
  const res = await fetch("/api/baileys/settings", { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? (data as BaileysAutomationSettings) : null;
}

export async function saveBaileysSettings(
  payload: Partial<BaileysAutomationSettings>
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/baileys/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ success: false, error: "Gagal menyimpan pengaturan." }));
}

export async function triggerBaileysReminder(
  markSent = true
): Promise<{ success: boolean; message?: string; sentCount?: number; failedCount?: number; error?: string }> {
  const res = await fetch("/api/baileys/trigger-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markSent }),
  });
  return res.json().catch(() => ({ success: false, error: "Gagal memicu pengiriman pengingat." }));
}

export function useWhatsAppBaileys(options: { enabled?: boolean; activeUi?: boolean } = {}) {
  const { enabled = true, activeUi = false } = options;
  const [state, setState] = useState<BaileysState>(DEFAULT_STATE);
  const inFlightRef = useRef(false);
  const seqRef = useRef(0);
  const statusRef = useRef<BaileysStatus>("disconnected");

  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const refreshStatus = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const mySeq = ++seqRef.current;
    try {
      const next = await fetchBaileysStatus(activeUi);
      if (mySeq !== seqRef.current) return;
      setState(next);
    } catch {
      // keep previous state on transient network hiccup
    } finally {
      inFlightRef.current = false;
    }
  }, [activeUi]);

  useEffect(() => {
    const onSync = (e: Event) => {
      const custom = e as CustomEvent<BaileysState>;
      if (custom.detail) {
        seqRef.current += 1;
        setState(custom.detail);
      }
    };
    window.addEventListener(BAILEYS_SYNC_EVENT, onSync);
    return () => window.removeEventListener(BAILEYS_SYNC_EVENT, onSync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      await refreshStatus();
      if (!active) return;
      const delay = activeUi ? (statusRef.current === "connected" ? 6000 : 2000) : 25000;
      timer = setTimeout(loop, delay);
    };
    loop();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, activeUi, refreshStatus]);

  return {
    state,
    refreshStatus,
    refreshQr: async () => {
      seqRef.current += 1;
      const next = await refreshBaileysQr();
      setState(next);
      return next;
    },
    requestPairingCode: async (phone: string) => {
      seqRef.current += 1;
      const res = await requestBaileysPairingCode(phone);
      if (res.state) setState(res.state);
      return res;
    },
    disconnect: async () => {
      seqRef.current += 1;
      const res = await disconnectBaileys();
      if (res.success) setState({ ...DEFAULT_STATE, status: "disconnected" });
      return res;
    },
    sendMessage: sendViaBaileys,
  };
}
