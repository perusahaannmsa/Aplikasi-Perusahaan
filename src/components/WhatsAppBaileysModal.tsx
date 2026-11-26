import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  LogOut,
  MessageSquare,
  QrCode,
  RefreshCw,
  Send,
  Server,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';
import {
  BaileysAutomationSettings,
  fetchBaileysSettings,
  saveBaileysSettings,
  triggerBaileysReminder,
  useWhatsAppBaileys,
} from '../utils/whatsappBaileys';
import {
  buildApiUrl,
  getBackendBaseUrl,
  setBackendBaseUrl,
  validateBackendUrlInput,
} from '../utils/backendApi';

interface WhatsAppBaileysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalTab = 'link' | 'send' | 'schedule';

const ALL_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const WhatsAppBaileysModal: React.FC<WhatsAppBaileysModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('link');
  const { state, refreshQr, requestPairingCode, disconnect, sendMessage, refreshStatus } =
    useWhatsAppBaileys({
      enabled: isOpen,
      activeUi: isOpen,
    });

  // QR & Pairing UI states
  const [isRefreshingQr, setIsRefreshingQr] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Send & Broadcast UI states
  const [targetPhone, setTargetPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [triggeringReminder, setTriggeringReminder] = useState(false);
  const [reminderFeedback, setReminderFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Schedule Settings UI states
  const [settings, setSettings] = useState<BaileysAutomationSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);
  const [copiedCronUrl, setCopiedCronUrl] = useState(false);

  // External Node.js server URL config states (needed when frontend is hosted on Vercel)
  const [backendUrlInput, setBackendUrlInput] = useState(() => getBackendBaseUrl());
  const [savedBackendUrl, setSavedBackendUrl] = useState(() => getBackendBaseUrl());
  const [showBackendConfig, setShowBackendConfig] = useState(false);
  const [backendUrlError, setBackendUrlError] = useState<string | null>(null);
  const [savingBackendUrl, setSavingBackendUrl] = useState(false);

  // Live 1s ticker for QR expiry countdown
  useEffect(() => {
    if (!isOpen || !state.qrExpiresAt) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen, state.qrExpiresAt]);

  // Load automation settings when modal opens or schedule tab activates
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'schedule' || !settings) {
      let cancelled = false;
      setLoadingSettings(true);
      fetchBaileysSettings()
        .then((res) => {
          if (!cancelled && res) setSettings(res);
        })
        .finally(() => {
          if (!cancelled) setLoadingSettings(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, activeTab]);

  // Lock Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const qrSecondsLeft = useMemo(() => {
    if (!state.qrExpiresAt) return null;
    const skew = state.serverNow ? state.serverNow - Date.now() : 0;
    const remainingMs = state.qrExpiresAt - (nowMs + skew);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }, [state.qrExpiresAt, state.serverNow, nowMs]);

  if (!isOpen || typeof document === 'undefined') return null;

  const connectedPhone = state.user?.id
    ? state.user.id.split(':')[0].split('@')[0]
    : null;

  const handleRefreshQr = async () => {
    setIsRefreshingQr(true);
    setPairingError(null);
    try {
      await refreshQr();
    } finally {
      setIsRefreshingQr(false);
    }
  };

  const handleRequestPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);
    setPairingLoading(true);
    try {
      const res = await requestPairingCode(pairingPhone);
      if (!res.success && res.error) {
        setPairingError(res.error);
      }
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setPairingError(null);
    try {
      await disconnect();
      await refreshStatus();
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleCopyPairingCode = () => {
    if (!state.pairingCode) return;
    navigator.clipboard.writeText(state.pairingCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPhone.trim() || !messageText.trim()) {
      setSendFeedback({ ok: false, text: 'Nomor tujuan dan isi pesan wajib diisi.' });
      return;
    }
    setSendingMsg(true);
    setSendFeedback(null);
    try {
      const res = await sendMessage(targetPhone.trim(), messageText.trim());
      if (res.success) {
        setSendFeedback({ ok: true, text: 'Pesan berhasil dikirim melalui sesi WhatsApp Baileys.' });
        setMessageText('');
      } else {
        setSendFeedback({ ok: false, text: res.error || 'Gagal mengirim pesan.' });
      }
    } finally {
      setSendingMsg(false);
    }
  };

  const handleTriggerBroadcast = async () => {
    setTriggeringReminder(true);
    setReminderFeedback(null);
    try {
      const res = await triggerBaileysReminder(true);
      setReminderFeedback({
        ok: Boolean(res.success),
        text: res.message || res.error || 'Broadcast selesai diproses.',
      });
      await refreshStatus();
    } finally {
      setTriggeringReminder(false);
    }
  };

  const handleToggleDay = (day: string) => {
    if (!settings) return;
    const exists = settings.reminderActiveDays.includes(day);
    const nextDays = exists
      ? settings.reminderActiveDays.filter((d) => d !== day)
      : [...settings.reminderActiveDays, day];
    setSettings({ ...settings, reminderActiveDays: nextDays });
  };

  const handleSaveSchedule = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      const res = await saveBaileysSettings({
        masterAutoSendEnabled: settings.masterAutoSendEnabled,
        autoReminderEnabled: settings.autoReminderEnabled,
        autoReminderHour: settings.autoReminderHour,
        reminderActiveDays: settings.reminderActiveDays,
        skipHolidays: settings.skipHolidays,
        skipWeekends: settings.skipWeekends,
        requireFridaySignature: settings.requireFridaySignature,
        allowLocationCheckin: settings.allowLocationCheckin,
      });
      setSettingsFeedback(
        res.success
          ? res.message || 'Pengaturan jadwal Baileys tersimpan.'
          : res.error || 'Gagal menyimpan pengaturan.'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveBackendUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBackendUrlError(null);
    const check = validateBackendUrlInput(backendUrlInput);
    if (!check.valid) {
      setBackendUrlError(check.error || 'URL server tidak valid.');
      return;
    }
    setSavingBackendUrl(true);
    try {
      setBackendBaseUrl(check.normalized);
      setSavedBackendUrl(check.normalized);
      setBackendUrlInput(check.normalized);
      setPairingError(null);
      if (check.normalized) {
        await refreshQr();
        setShowBackendConfig(false);
      } else {
        await refreshStatus();
      }
    } finally {
      setSavingBackendUrl(false);
    }
  };

  const handleResetBackendUrl = async () => {
    setBackendBaseUrl('');
    const fallback = getBackendBaseUrl();
    setSavedBackendUrl(fallback);
    setBackendUrlInput(fallback);
    setBackendUrlError(null);
    await refreshStatus();
  };

  const cronEndpointUrl = savedBackendUrl
    ? buildApiUrl('/api/baileys/cron-reminder')
    : `${window.location.origin}/api/baileys/cron-reminder`;

  const statusMeta = state.isConnected
    ? { label: 'Terhubung', dot: 'bg-emerald-500', text: 'text-emerald-700' }
    : state.isPairingInProgress
    ? { label: 'Menyambungkan Sesi', dot: 'bg-amber-500', text: 'text-amber-700' }
    : state.status === 'qr'
    ? { label: 'Siap Dipindai', dot: 'bg-amber-500', text: 'text-amber-700' }
    : state.status === 'connecting'
    ? { label: 'Menghubungkan', dot: 'bg-stone-400', text: 'text-stone-600' }
    : { label: 'Terputus', dot: 'bg-rose-500', text: 'text-rose-700' };

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-5 bg-stone-950/60 backdrop-blur-xs print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="baileys-modal-title"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 bg-stone-900 text-white border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="baileys-modal-title"
                className="text-sm sm:text-base font-bold text-white tracking-tight truncate"
              >
                Modul WhatsApp Baileys
              </h2>
              <p className="text-xs text-stone-300 truncate">
                Koneksi Multi-Device Resmi, Pengingat Absensi &amp; Kirim Pesan Langsung
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-stone-200">
              <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
              <span>{statusMeta.label}</span>
              {connectedPhone && (
                <>
                  <span aria-hidden="true" className="text-stone-500">
                    /
                  </span>
                  <span className="font-mono tabular-nums text-emerald-300">{connectedPhone}</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              aria-label="Tutup modul WhatsApp Baileys"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 sm:px-6 py-2.5 bg-stone-50 border-b border-stone-200 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              activeTab === 'link'
                ? 'bg-white text-stone-900 border border-stone-200 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>Tautkan Perangkat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              activeTab === 'send'
                ? 'bg-white text-stone-900 border border-stone-200 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <Send className="w-4 h-4 text-emerald-600" />
            <span>Kirim Pesan &amp; Broadcast</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-white text-stone-900 border border-stone-200 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Jadwal Otomatis</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-white">
          {/* Live Status Summary Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  state.isConnected
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-stone-100 text-stone-600 border border-stone-200'
                }`}
              >
                {state.isConnected ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Smartphone className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-sm font-bold text-stone-900">
                  {state.isConnected
                    ? state.user?.name || 'WhatsApp Baileys Aktif'
                    : 'WhatsApp Baileys Belum Terhubung'}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mt-0.5">
                  <span className={`font-semibold ${statusMeta.text}`}>{statusMeta.label}</span>
                  {connectedPhone && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-stone-700">
                        +{connectedPhone}
                      </span>
                    </>
                  )}
                  {state.todayDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {state.absentWorkersCount} belum absen hari ini
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRefreshQr}
                disabled={isRefreshingQr || state.isConnected}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingQr ? 'animate-spin' : ''}`} />
                <span>Segarkan QR</span>
              </button>

              {(state.isConnected || state.hasCredentials || state.error) && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition cursor-pointer whitespace-nowrap"
                >
                  {isDisconnecting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>{state.isConnected ? 'Putuskan Sesi' : 'Reset Sesi'}</span>
                </button>
              )}
            </div>
          </div>

          {(state.error || pairingError) && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-3">
              <span>{pairingError || state.error}</span>
              <button
                type="button"
                onClick={() => setPairingError(null)}
                className="text-rose-600 hover:text-rose-900 font-semibold shrink-0 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* TAB 1: LINKING (SIDE BY SIDE QR & PAIRING CODE) */}
          {activeTab === 'link' && (
            <>
              {state.isConnected ? (
                <div className="p-6 rounded-xl border border-emerald-200 bg-emerald-50/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1.5 text-center sm:text-left">
                    <h3 className="text-base font-bold text-stone-900">
                      Sesi WhatsApp Baileys Siap Digunakan
                    </h3>
                    <p className="text-xs text-stone-600 max-w-xl leading-relaxed">
                      Satu sesi Baileys aktif melayani pengingat absensi otomatis, pengiriman pesan
                      langsung ke karyawan, serta pembacaan balasan absen lokasi GPS secara
                      real-time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('send')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Send className="w-4 h-4" />
                    <span>Buka Menu Kirim Pesan</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                  {/* Card 1: Scan QR Code */}
                  <div className="rounded-xl border border-stone-200 p-5 flex flex-col justify-between space-y-4 bg-stone-50/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                          <QrCode className="w-4 h-4 text-emerald-600" />
                          <span>1. Scan QR Code Baileys</span>
                        </h3>
                        <p className="text-xs text-stone-500 mt-1">
                          Pindai langsung dari aplikasi WhatsApp di ponsel Anda.
                        </p>
                      </div>
                      {qrSecondsLeft !== null && state.qr && (
                        <span className="font-mono tabular-nums text-xs font-semibold text-stone-600 shrink-0">
                          {qrSecondsLeft}d
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col items-center justify-center py-4 px-4 min-h-[240px] bg-white rounded-xl border border-stone-200">
                      {state.isPairingInProgress ? (
                        <div className="text-center space-y-2.5">
                          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                          <p className="text-xs font-semibold text-stone-800">
                            Menyelesaikan otentikasi perangkat...
                          </p>
                          <p className="text-xs text-stone-500">
                            Tunggu sebentar hingga sesi WhatsApp tersambung penuh.
                          </p>
                        </div>
                      ) : state.qr ? (
                        <img
                          src={state.qr}
                          alt="WhatsApp Baileys QR Code"
                          style={{ imageRendering: 'pixelated' }}
                          className="w-52 h-52 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : state.isVercelServerless ? (
                        <div className="text-center space-y-3 max-w-xs">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                            <Server className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-stone-900">
                              QR Code Butuh Server Node.js (server.ts)
                            </p>
                            <p className="text-xs text-stone-500 leading-relaxed">
                              Domain Vercel bersifat serverless sehingga tidak bisa membuka WebSocket WhatsApp. Akses aplikasi langsung dari server Node.js atau hubungkan URL server Anda di bawah.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowBackendConfig(true)}
                            className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
                          >
                            Atur URL Server Node.js
                          </button>
                        </div>
                      ) : state.status === 'connecting' || isRefreshingQr ? (
                        <div className="text-center space-y-3">
                          <RefreshCw className="w-8 h-8 text-stone-400 animate-spin mx-auto" />
                          <p className="text-xs font-medium text-stone-600">
                            Menyiapkan QR Code dari modul Baileys...
                          </p>
                          <button
                            type="button"
                            onClick={handleRefreshQr}
                            disabled={isRefreshingQr}
                            className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
                          >
                            Muat QR Sekarang
                          </button>
                        </div>
                      ) : (
                        <div className="text-center space-y-3">
                          <QrCode className="w-8 h-8 text-stone-400 mx-auto" />
                          <p className="text-xs font-medium text-stone-600">
                            QR Code belum dimuat. Klik tombol di bawah untuk membuat QR baru.
                          </p>
                          <button
                            type="button"
                            onClick={handleRefreshQr}
                            disabled={isRefreshingQr}
                            className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
                          >
                            Muat QR Sekarang
                          </button>
                        </div>
                      )}
                    </div>

                    <ol className="text-xs text-stone-600 space-y-1 list-decimal pl-4 leading-relaxed">
                      <li>Buka WhatsApp di HP dan ketuk menu Perangkat Tertaut.</li>
                      <li>Ketuk Tautkan Perangkat lalu arahkan kamera ke QR di atas.</li>
                    </ol>
                  </div>

                  {/* Card 2: 8-Digit Pairing Code */}
                  <div className="rounded-xl border border-stone-200 p-5 flex flex-col justify-between space-y-4 bg-stone-50/40">
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-emerald-600" />
                        <span>2. Kode Pairing 8-Digit</span>
                      </h3>
                      <p className="text-xs text-stone-500 mt-1">
                        Alternatif tanpa kamera menggunakan nomor WhatsApp aktif Anda.
                      </p>
                    </div>

                    <form onSubmit={handleRequestPairing} className="space-y-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="baileys-pairing-phone"
                          className="text-xs font-semibold text-stone-700 block"
                        >
                          Nomor WhatsApp
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="baileys-pairing-phone"
                            type="tel"
                            placeholder="Contoh: 081234567890"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            className="flex-1 bg-white text-stone-900 text-xs font-mono px-3 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          />
                          <button
                            type="submit"
                            disabled={pairingLoading || !pairingPhone.trim()}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                          >
                            {pairingLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                            <span>Minta Kode</span>
                          </button>
                        </div>
                      </div>

                      {state.pairingCode ? (
                        <div className="p-4 rounded-xl bg-white border border-emerald-200 text-center space-y-2">
                          <span className="text-xs font-semibold text-emerald-800 block">
                            Masukkan Kode Ini di WhatsApp HP Anda
                          </span>
                          <div className="text-2xl font-bold font-mono tracking-[0.22em] text-stone-950 select-all py-1">
                            {state.pairingCode}
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyPairingCode}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                          >
                            {copiedCode ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Kode Disalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Salin Kode Pairing</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-white border border-dashed border-stone-200 text-xs text-stone-500 text-center">
                          Kode 8 karakter akan muncul di sini setelah nomor dikirim.
                        </div>
                      )}
                    </form>

                    <ol className="text-xs text-stone-600 space-y-1 list-decimal pl-4 leading-relaxed">
                      <li>Pilih Tautkan Perangkat pada aplikasi WhatsApp di HP.</li>
                      <li>Pilih Tautkan dengan nomor telepon saja di bagian bawah layar.</li>
                      <li>Ketik 8 karakter kode pairing yang tampil di atas.</li>
                    </ol>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: SEND & BROADCAST */}
          {activeTab === 'send' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Direct Message Form */}
              <form
                onSubmit={handleSendDirectMessage}
                className="rounded-xl border border-stone-200 p-5 space-y-4 bg-stone-50/40"
              >
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Kirim Pesan Langsung</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Kirim pesan teks langsung melalui koneksi Baileys yang aktif.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">
                    Nomor WhatsApp Tujuan
                  </label>
                  <input
                    type="tel"
                    placeholder="081234567890"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    disabled={!state.isConnected}
                    className="w-full bg-white text-stone-900 text-xs font-mono px-3 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-stone-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">Isi Pesan</label>
                  <textarea
                    rows={4}
                    placeholder="Tulis pesan untuk karyawan atau penerima..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    disabled={!state.isConnected}
                    className="w-full bg-white text-stone-900 text-xs px-3 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-stone-100 resize-y"
                  />
                </div>

                {sendFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium border ${
                      sendFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {sendFeedback.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!state.isConnected || sendingMsg}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {sendingMsg ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{sendingMsg ? 'Mengirim Pesan...' : 'Kirim via Baileys'}</span>
                </button>
              </form>

              {/* Daily Attendance Reminder Trigger */}
              <div className="rounded-xl border border-stone-200 p-5 space-y-4 bg-stone-50/40">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Pengingat Absensi Harian Otomatis
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Kirim tautan absen mandiri sekaligus ke seluruh karyawan aktif yang belum
                    check-in hari ini.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">Belum absen hari ini</span>
                    <span className="font-mono tabular-nums font-bold text-stone-900">
                      {state.absentWorkersCount} karyawan
                    </span>
                  </div>
                  {state.absentWorkersNames.length > 0 ? (
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {state.absentWorkersNames.slice(0, 8).join(', ')}
                      {state.absentWorkersNames.length > 8
                        ? `, dan ${state.absentWorkersNames.length - 8} lainnya`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-700 font-medium">
                      Semua karyawan aktif sudah melakukan absensi hari ini.
                    </p>
                  )}
                </div>

                {reminderFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium border ${
                      reminderFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {reminderFeedback.text}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTriggerBroadcast}
                  disabled={!state.isConnected || triggeringReminder}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {triggeringReminder ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  <span>
                    {triggeringReminder
                      ? 'Mengirim Pengingat...'
                      : 'Kirim Pengingat Absen Hari Ini'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SCHEDULE AUTOMATION */}
          {activeTab === 'schedule' && (
            <div className="space-y-5">
              {loadingSettings && !settings ? (
                <div className="py-12 flex items-center justify-center gap-2 text-xs text-stone-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memuat pengaturan jadwal Baileys...</span>
                </div>
              ) : settings ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50 transition">
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          Saklar Utama Otomatisasi
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Aktifkan pengiriman pengingat absen terjadwal di latar belakang.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.masterAutoSendEnabled}
                        onChange={(e) =>
                          setSettings({ ...settings, masterAutoSendEnabled: e.target.checked })
                        }
                        className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-50 transition">
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          Pengingat Absen Harian
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Kirim tautan absen otomatis kepada karyawan yang belum hadir.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.autoReminderEnabled}
                        onChange={(e) =>
                          setSettings({ ...settings, autoReminderEnabled: e.target.checked })
                        }
                        className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer"
                      />
                    </label>

                    <div className="p-4 rounded-xl border border-stone-200 space-y-2">
                      <label className="text-xs font-bold text-stone-900 block">
                        Jam Pengiriman Otomatis (WIB)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={settings.autoReminderHour}
                          onChange={(e) =>
                            setSettings({ ...settings, autoReminderHour: e.target.value })
                          }
                          className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums font-bold text-stone-900"
                        />
                        {['07:30', '08:00', '08:30', '09:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSettings({ ...settings, autoReminderHour: preset })}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums font-semibold border transition cursor-pointer ${
                              settings.autoReminderHour === preset
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-stone-200 space-y-2">
                      <span className="text-xs font-bold text-stone-900 block">
                        Hari Aktif Pengingat
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_DAYS.map((day) => {
                          const active = settings.reminderActiveDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => handleToggleDay(day)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                active
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { key: 'skipHolidays' as const, label: 'Lewati Libur Nasional' },
                      { key: 'skipWeekends' as const, label: 'Lewati Akhir Pekan' },
                      { key: 'requireFridaySignature' as const, label: 'Wajib TTD Hari Jumat' },
                      { key: 'allowLocationCheckin' as const, label: 'Absen Share Location WA' },
                    ].map((opt) => (
                      <label
                        key={opt.key}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border border-stone-200 text-xs font-medium text-stone-800 cursor-pointer hover:bg-stone-50"
                      >
                        <span>{opt.label}</span>
                        <input
                          type="checkbox"
                          checked={settings[opt.key]}
                          onChange={(e) =>
                            setSettings({ ...settings, [opt.key]: e.target.checked })
                          }
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>

                  {/* Cron endpoint & status readout */}
                  <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                      <span>
                        Status Terakhir:{' '}
                        <strong className="text-stone-900">
                          {settings.lastCronStatus || 'Menunggu jadwal berjalan'}
                        </strong>
                      </span>
                      <span className="font-mono tabular-nums text-stone-500">
                        {settings.lastCronSentDate
                          ? `Terkirim: ${settings.lastCronSentDate}`
                          : 'Belum dikirim hari ini'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={cronEndpointUrl}
                        className="flex-1 bg-white text-xs font-mono text-stone-700 px-3 py-2 border border-stone-200 rounded-lg select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(cronEndpointUrl);
                          setCopiedCronUrl(true);
                          setTimeout(() => setCopiedCronUrl(false), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {copiedCronUrl ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedCronUrl ? 'Disalin' : 'Salin URL Cron'}</span>
                      </button>
                    </div>
                  </div>

                  {settingsFeedback && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                      {settingsFeedback}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveSchedule}
                      disabled={savingSettings}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {savingSettings && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{savingSettings ? 'Menyimpan...' : 'Simpan Jadwal Baileys'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800">
                  Pengaturan jadwal server Baileys tidak dapat dimuat saat ini.
                </div>
              )}
            </div>
          )}
          {(showBackendConfig || state.isVercelServerless) && activeTab === 'link' && !state.isConnected && (
            <form
              onSubmit={handleSaveBackendUrl}
              className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Koneksi Server Node.js (server.ts) untuk Vercel / PWA</span>
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Masukkan URL server Node.js persisten (Render / Railway / VPS) yang menjalankan aplikasi ini agar QR Code Baileys langsung tampil di Vercel.
                  </p>
                </div>
                {showBackendConfig && !state.isVercelServerless && (
                  <button
                    type="button"
                    onClick={() => setShowBackendConfig(false)}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-900 cursor-pointer shrink-0"
                  >
                    Tutup
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={backendUrlInput}
                  onChange={(e) => {
                    setBackendUrlInput(e.target.value);
                    setBackendUrlError(null);
                  }}
                  placeholder="https://nama-server-anda.onrender.com"
                  className="flex-1 bg-white text-stone-900 text-xs font-mono px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={savingBackendUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    {savingBackendUrl && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Simpan &amp; Muat QR</span>
                  </button>
                  {savedBackendUrl && (
                    <button
                      type="button"
                      onClick={handleResetBackendUrl}
                      className="px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {backendUrlError && (
                <p className="text-xs font-medium text-rose-700">{backendUrlError}</p>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
            <span>
              @whiskeysockets/baileys ·{' '}
              {savedBackendUrl ? `Server: ${savedBackendUrl}` : 'Endpoint /api/baileys'}
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveTab('link');
                setShowBackendConfig((v) => !v);
              }}
              className="text-stone-700 hover:text-stone-950 font-semibold underline underline-offset-2 cursor-pointer"
            >
              {showBackendConfig ? 'Sembunyikan URL Server' : 'Atur URL Server'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
