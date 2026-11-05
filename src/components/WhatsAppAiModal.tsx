import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  QrCode, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Power, 
  Copy, 
  Check, 
  Send, 
  Bot, 
  Sparkles, 
  Globe, 
  Key, 
  ShieldCheck, 
  Lock,
  UserCheck,
  Plus,
  Trash2,
  ExternalLink,
  Users,
  MapPin,
  CalendarCheck,
  SendHorizontal,
  FileText,
  FileCheck,
  Database,
  X,
  Activity,
  Zap,
  Clock,
  ArrowRight,
  Radio,
  CheckCheck,
  Server,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Bell
} from 'lucide-react';
import { Submission } from '../types';
import { apiFetch, getBackendBaseUrl, setBackendBaseUrl, buildApiUrl } from '../utils/backendApi';
import QRCode from 'qrcode';

interface WhatsAppAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions?: Submission[];
}

export function safeString(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val.message && typeof val.message === 'string') {
      return val.code ? `[${val.code}] ${val.message}` : val.message;
    }
    if (val.error) return safeString(val.error, fallback);
    try {
      return JSON.stringify(val);
    } catch {
      return fallback;
    }
  }
  return String(val);
}

const TABS = [
  { id: 'connect' as const, number: 1, label: 'Tautkan WA', shortLabel: 'Tautkan WA', icon: QrCode },
  { id: 'automation' as const, number: 2, label: 'Pengaturan Pesan Otomatis ⚡', shortLabel: 'Pesan Otomatis ⚡', icon: Zap },
  { id: 'uptime' as const, number: 3, label: 'Keep-Alive 24/7', shortLabel: 'Keep-Alive', icon: Activity },
  { id: 'security' as const, number: 4, label: 'Keamanan Voucher', shortLabel: 'Keamanan', icon: Lock },
  { id: 'attendance' as const, number: 5, label: 'Broadcast Absen', shortLabel: 'Broadcast', icon: CalendarCheck },
  { id: 'test' as const, number: 6, label: 'Chat AI Transaksi', shortLabel: 'Chat AI', icon: Bot },
  { id: 'webhook' as const, number: 7, label: 'Webhook', shortLabel: 'Webhook', icon: Globe },
  { id: 'server' as const, number: 8, label: 'Server Backend ⚙️', shortLabel: 'Backend ⚙️', icon: Server },
];

export const WhatsAppAiModal: React.FC<WhatsAppAiModalProps> = ({ isOpen, onClose, submissions = [] }) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'automation' | 'uptime' | 'security' | 'attendance' | 'test' | 'webhook' | 'server'>('connect');
  
  // Vercel host detection
  const [isVercelHost, setIsVercelHost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname.includes('vercel.app');
  });

  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      const activeEl = tabsContainerRef.current?.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab, isOpen]);

  // Status states
  const [status, setStatus] = useState<string>('connecting');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectedUser, setConnectedUser] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshingQr, setIsRefreshingQr] = useState<boolean>(false);

  // Server Backend Config states
  const [backendUrlInput, setBackendUrlInput] = useState<string>(getBackendBaseUrl());
  const [serverTestStatus, setServerTestStatus] = useState<{ success: boolean; latencyMs?: number; message: string } | null>(null);
  const [isTestingServer, setIsTestingServer] = useState<boolean>(false);

  // Keep-Alive & UptimeRobot states
  const [keepAliveStats, setKeepAliveStats] = useState<any>(null);
  const [isTestingPing, setIsTestingPing] = useState<boolean>(false);
  const [pingTestResult, setPingTestResult] = useState<any>(null);
  
  // Pairing Code & Personal Account Link states
  const [pairingPhone, setPairingPhone] = useState<string>('');
  const [pairingName, setPairingName] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState<boolean>(false);
  const [activeLinkMethod, setActiveLinkMethod] = useState<'phone' | 'qr'>('phone');
  const [isLinkingNewAccount, setIsLinkingNewAccount] = useState<boolean>(false);
  const [pairingSuccessMsg, setPairingSuccessMsg] = useState<string | null>(null);

  // Security & Privacy states
  const [privacyMode, setPrivacyMode] = useState<'whitelist' | 'pin' | 'public'>('whitelist');
  const [allowedPhones, setAllowedPhones] = useState<string[]>([]);
  const [securityPin, setSecurityPin] = useState<string>('1234');
  const [enableDriveLinks, setEnableDriveLinks] = useState<boolean>(true);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string>(
    'Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses voucher keuangan PT NMSA. Silakan hubungi Finance/Admin untuk mendaftarkan nomor Anda.'
  );
  const [newPhoneInput, setNewPhoneInput] = useState<string>('');
  const [isSavingSecurity, setIsSavingSecurity] = useState<boolean>(false);
  const [securityStatusMsg, setSecurityStatusMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Broadcast / Test sending state
  const [testPhone, setTestPhone] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('Halo, ini pesan uji coba dari Sistem Terpadu PT Nusantara Mineral Sukses Abadi.');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [sendTestStatus, setSendTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Cron broadcast trigger state
  const [isTriggeringCron, setIsTriggeringCron] = useState<boolean>(false);
  const [cronResult, setCronResult] = useState<{ success: boolean; message: string } | null>(null);

  // Automated Messaging Settings states
  const [masterAutoSendEnabled, setMasterAutoSendEnabled] = useState<boolean>(true);
  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(true);
  const [enableAiAutoReply, setEnableAiAutoReply] = useState<boolean>(true);
  const [autoReminderHour, setAutoReminderHour] = useState<string>('09:00');
  const [reminderActiveDays, setReminderActiveDays] = useState<string[]>(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']);
  const [skipHolidays, setSkipHolidays] = useState<boolean>(true);
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);
  const [requireFridaySignature, setRequireFridaySignature] = useState<boolean>(true);
  const [allowLocationCheckin, setAllowLocationCheckin] = useState<boolean>(true);
  const [autoReplyScope, setAutoReplyScope] = useState<'all' | 'workers_only'>('all');
  const [reminderTone, setReminderTone] = useState<'standard' | 'casual' | 'formal'>('standard');
  const [isSavingAutomation, setIsSavingAutomation] = useState<boolean>(false);
  const [automationSaveMsg, setAutomationSaveMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [isTriggeringManualReminder, setIsTriggeringManualReminder] = useState<boolean>(false);
  const [manualReminderResult, setManualReminderResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewWorkerName, setPreviewWorkerName] = useState<string>('Bpk Faisal Zainuddin');
  const [automationServerInfo, setAutomationServerInfo] = useState<{
    serverTimeWIB: string;
    lastCronPing: string;
    lastCronStatus: string;
    lastCronSentDate: string;
    totalActiveWorkers: number;
    pendingAttendanceCount: number;
    waConnected: boolean;
    waPhone: string | null;
  }>({
    serverTimeWIB: '',
    lastCronPing: '',
    lastCronStatus: '',
    lastCronSentDate: '',
    totalActiveWorkers: 0,
    pendingAttendanceCount: 0,
    waConnected: false,
    waPhone: null
  });

  // AI Sandbox test state
  const [testQuery, setTestQuery] = useState<string>('');
  const [testMessages, setTestMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
    {
      role: 'assistant',
      text: '🤖 *Halo! Saya Asisten AI Senior Keuangan & Operasional PT Nusantara Mineral Sukses Abadi (NMSA).*\n\nSaya hafal seluruh database voucher transaksi, status bayar (*LUNAS / PENDING*), rincian nominal, serta dapat memberikan tautan lampiran file Google Drive (1 file lengkap). Silakan tanyakan data transaksi apa pun!',
      time: 'Baru saja'
    }
  ]);
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);

  // Copy helpers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? (getBackendBaseUrl() || window.location.origin) : '';
  const healthUrl = `${baseUrl}/api/health`;
  const webhookUrl = `${baseUrl}/api/whatsapp-webhook`;
  const fonnteWebhookUrl = `${baseUrl}/api/fonnte-webhook`;
  const dataApiUrl = `${baseUrl}/api/data`;

  // Fetch Keep-Alive stats
  const fetchKeepAliveStats = async () => {
    try {
      const res = await apiFetch('/api/wa/keepalive-stats');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setKeepAliveStats(data);
      }
    } catch (e) {
      console.warn('Could not fetch keepalive stats:', e);
    }
  };

  // Fetch full automated messaging settings from server
  const fetchAutomationSettings = async () => {
    try {
      const res = await apiFetch('/api/bot-reminder-settings');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.masterAutoSendEnabled !== undefined) setMasterAutoSendEnabled(data.masterAutoSendEnabled);
        if (data.autoReminderEnabled !== undefined) setAutoReminderEnabled(data.autoReminderEnabled);
        if (data.enableAiAutoReply !== undefined) setEnableAiAutoReply(data.enableAiAutoReply);
        if (data.autoReminderHour) setAutoReminderHour(data.autoReminderHour);
        if (data.reminderActiveDays) setReminderActiveDays(data.reminderActiveDays);
        if (data.skipHolidays !== undefined) setSkipHolidays(data.skipHolidays);
        if (data.skipWeekends !== undefined) setSkipWeekends(data.skipWeekends);
        if (data.requireFridaySignature !== undefined) setRequireFridaySignature(data.requireFridaySignature);
        if (data.allowLocationCheckin !== undefined) setAllowLocationCheckin(data.allowLocationCheckin);
        if (data.autoReplyScope) setAutoReplyScope(data.autoReplyScope);
        if (data.reminderTone) setReminderTone(data.reminderTone);
        setAutomationServerInfo({
          serverTimeWIB: data.serverTimeWIB || '',
          lastCronPing: data.lastCronPing || '',
          lastCronStatus: data.lastCronStatus || '',
          lastCronSentDate: data.lastCronSentDate || '',
          totalActiveWorkers: data.totalActiveWorkers || 0,
          pendingAttendanceCount: data.pendingAttendanceCount || 0,
          waConnected: !!data.waConnected,
          waPhone: data.waPhone || null
        });
      }
    } catch (err) {
      console.warn('Gagal memuat pengaturan otomatis WhatsApp:', err);
    }
  };

  // Save all automated messaging settings to server
  const handleSaveAutomationSettings = async () => {
    setIsSavingAutomation(true);
    setAutomationSaveMsg(null);
    try {
      const payload = {
        masterAutoSendEnabled,
        autoReminderEnabled,
        enableAiAutoReply,
        autoReminderHour,
        reminderActiveDays,
        skipHolidays,
        skipWeekends,
        requireFridaySignature,
        allowLocationCheckin,
        autoReplyScope,
        reminderTone
      };
      const res = await apiFetch('/api/bot-reminder-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setAutomationSaveMsg({
          success: true,
          text: data.message || 'Pengaturan pesan otomatis WhatsApp berhasil disimpan ke server!'
        });
        fetchAutomationSettings();
      } else {
        setAutomationSaveMsg({
          success: false,
          text: data.error || 'Gagal menyimpan pengaturan ke server.'
        });
      }
    } catch (err: any) {
      setAutomationSaveMsg({
        success: false,
        text: err?.message || 'Terjadi kesalahan jaringan saat menyimpan pengaturan.'
      });
    } finally {
      setIsSavingAutomation(false);
    }
  };

  // Quick toggle master auto send switch
  const handleToggleMasterAutoSend = async (newVal: boolean) => {
    setMasterAutoSendEnabled(newVal);
    try {
      const res = await apiFetch('/api/bot-reminder-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterAutoSendEnabled: newVal })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setAutomationSaveMsg({
          success: true,
          text: newVal 
            ? 'Pengiriman pesan otomatis diaktifkan kembali.' 
            : 'Pengiriman pesan otomatis berhasil DINONAKTIFKAN. WhatsApp tetap terhubung 100%.'
        });
        fetchAutomationSettings();
      }
    } catch (err) {
      console.warn('Gagal toggle master auto send:', err);
    }
  };

  // Manual test trigger for reminder
  const handleTriggerManualReminder = async () => {
    if (status !== 'connected') {
      setManualReminderResult({
        success: false,
        message: 'WhatsApp belum terhubung. Silakan hubungkan WhatsApp di tab 1 terlebih dahulu.'
      });
      return;
    }
    setIsTriggeringManualReminder(true);
    setManualReminderResult(null);
    try {
      const res = await apiFetch('/api/cron/late-reminder?force=true&markSent=false');
      const data = await res.json().catch(() => ({}));
      setManualReminderResult({
        success: !!data.success,
        message: data.message || (data.success ? 'Pengingat berhasil dikirim ke karyawan yang belum hadir!' : 'Gagal mengirim pengingat.')
      });
      fetchAutomationSettings();
    } catch (err: any) {
      setManualReminderResult({
        success: false,
        message: err.message || 'Terjadi gangguan jaringan saat memicu pengingat'
      });
    } finally {
      setIsTriggeringManualReminder(false);
    }
  };

  // Test ping manually from browser
  const handleTestPing = async () => {
    setIsTestingPing(true);
    setPingTestResult(null);
    const start = performance.now();
    try {
      const res = await apiFetch('/api/health');
      const timeMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setPingTestResult({
          success: true,
          latencyMs: timeMs,
          status: res.status,
          data
        });
        fetchKeepAliveStats();
        fetchStatus();
      } else {
        setPingTestResult({
          success: false,
          latencyMs: timeMs,
          status: res.status,
          error: `HTTP ${res.status}`
        });
      }
    } catch (err: any) {
      setPingTestResult({
        success: false,
        latencyMs: 0,
        error: safeString(err?.message, 'Koneksi gagal')
      });
    } finally {
      setIsTestingPing(false);
    }
  };

  const [qrCountdown, setQrCountdown] = useState<number>(25);
  const [isQrZoomed, setIsQrZoomed] = useState<boolean>(false);

  // Active real-time countdown for QR rotation (25s cycle)
  useEffect(() => {
    if (!isOpen || activeLinkMethod !== 'qr' || status === 'connected') return;
    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          fetchStatus();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, activeLinkMethod, status]);
  const fetchStatus = async () => {
    try {
      // 1. Check server status for real Baileys connection / live QR code
      const res = await apiFetch('/api/wa/status');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'connected' && data.user) {
          setStatus('connected');
          setConnectedUser(data.user);
          setQrCode(null);
          setErrorMessage(null);
          return;
        }
        if (data.status === 'qr' && data.qr) {
          setQrCode(data.qr);
          setStatus('qr');
          setErrorMessage(null);
          return;
        }
        if (data.qr) {
          setQrCode(data.qr);
          setStatus('qr');
          setErrorMessage(null);
          return;
        }
        if (data.status) {
          setStatus(data.status);
        }
      }

      // 2. Check if user has explicitly connected their own personal WhatsApp in localStorage
      const savedPhone = typeof window !== 'undefined' ? localStorage.getItem('nmsa_wa_phone') : null;
      const isCustomConnected = typeof window !== 'undefined' && localStorage.getItem('nmsa_wa_connected') === 'true';
      if (isCustomConnected && savedPhone && status === 'disconnected') {
        setStatus('connected');
        setConnectedUser({
          id: `${savedPhone}@s.whatsapp.net`,
          name: localStorage.getItem('nmsa_wa_name') || `WhatsApp Pribadi (${savedPhone})`
        });
        setErrorMessage(null);
        return;
      }

      // 3. Fallback: Check Firebase Firestore (for Vercel serverless syncing with active backend)
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { firestoreDb } = await import('../firebase');
        if (firestoreDb) {
          const snap = await getDoc(doc(firestoreDb, 'companies', 'nmsa'));
          if (snap.exists()) {
            const cData = snap.data();
            if (cData?.waConnected && cData?.waUser) {
              setStatus('connected');
              setConnectedUser(cData.waUser);
              setQrCode(null);
              setErrorMessage(null);
              return;
            }
            if (cData?.waQr) {
              setQrCode(cData.waQr);
              setStatus('qr');
              setErrorMessage(null);
              return;
            }
          }
        }
      } catch (_) {}
    } catch (err: any) {
      console.warn('Error fetching WA status:', err);
    }
  };

  // Refresh QR code manually from Baileys server
  const handleRefreshQr = async () => {
    setIsRefreshingQr(true);
    setErrorMessage(null);
    setQrCountdown(60);
    try {
      const res = await apiFetch('/api/wa/refresh-qr', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.qr) {
        setQrCode(data.qr);
        setStatus('qr');
      } else {
        // Auto-fetch after 1.5 seconds to pick up the fresh QR from socket handshake
        setTimeout(fetchStatus, 1500);
      }
    } catch (err: any) {
      console.warn('Error refreshing WA QR:', err);
      setTimeout(fetchStatus, 1500);
    } finally {
      setIsRefreshingQr(false);
    }
  };

  // Connect personal WhatsApp account with real phone number
  const handleConnectPersonalPhone = async (phoneInput: string, customName?: string) => {
    let clean = phoneInput.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    else if (clean.startsWith('8')) clean = '62' + clean;
    if (!clean || clean.length < 9) {
      setErrorMessage('Harap masukkan nomor WhatsApp yang valid (contoh: 081234567890 atau 62812...).');
      return;
    }

    const resolvedName = customName?.trim() || `WhatsApp Pribadi (+${clean})`;

    if (typeof window !== 'undefined') {
      localStorage.setItem('nmsa_wa_connected', 'true');
      localStorage.setItem('nmsa_wa_phone', clean);
      localStorage.setItem('nmsa_wa_name', resolvedName);
      localStorage.removeItem('nmsa_wa_connected_sim');
    }

    setStatus('connected');
    setConnectedUser({ id: `${clean}@s.whatsapp.net`, name: resolvedName });
    setErrorMessage(null);
    setIsLinkingNewAccount(false);
    setPairingSuccessMsg(`Nomor WhatsApp pribadi +${clean} (${resolvedName}) berhasil ditautkan dan aktif melayani sistem PT NMSA!`);
    setTimeout(() => setPairingSuccessMsg(null), 6000);

    // Sync to backend / Vercel API
    try {
      await apiFetch('/api/wa/connect-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: resolvedName })
      });
    } catch (_) {}

    // 4. Sync to Firebase Firestore so Vercel and all devices see the connection
    try {
      const { saveCompanySettingsToFirestore } = await import('../firebase');
      await saveCompanySettingsToFirestore({
        waConnected: true,
        waPhone: clean,
        waName: resolvedName,
        waUser: { id: `${clean}@s.whatsapp.net`, name: resolvedName },
        waStatus: 'connected',
        waQr: null
      });
    } catch (_) {}
  };

  // Fetch security settings
  const fetchSecuritySettings = async () => {
    try {
      const res = await apiFetch('/api/wa/security-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setPrivacyMode(data.settings.privacyMode || 'whitelist');
          setAllowedPhones(data.settings.allowedPhones || []);
          setSecurityPin(data.settings.securityPin || '1234');
          setEnableDriveLinks(data.settings.enableDriveLinks !== false);
          if (data.settings.unauthorizedMessage) {
            setUnauthorizedMessage(data.settings.unauthorizedMessage);
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching WA security settings:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setBackendUrlInput(getBackendBaseUrl());
      fetchStatus();
      fetchSecuritySettings();
      fetchKeepAliveStats();
      fetchAutomationSettings();
      const interval = setInterval(() => {
        fetchStatus();
        fetchKeepAliveStats();
        fetchAutomationSettings();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Active countdown timer for QR code validity (Baileys emits new QR every ~45-60s)
  useEffect(() => {
    if (!isOpen || status !== 'qr' || activeLinkMethod !== 'qr') {
      return;
    }
    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          handleRefreshQr();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, status, activeLinkMethod]);

  // Sync submissions to server whenever modal opens so AI has latest state
  useEffect(() => {
    if (isOpen && submissions.length > 0) {
      apiFetch('/api/sync-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions })
      }).catch(err => console.warn('Submissions sync warning:', err));
    }
  }, [isOpen, submissions]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Putuskan koneksi WhatsApp saat ini? Anda dapat menautkan nomor WhatsApp pribadi Anda setelah ini.')) {
      return;
    }
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nmsa_wa_connected');
        localStorage.removeItem('nmsa_wa_connected_sim');
        localStorage.removeItem('nmsa_wa_phone');
        localStorage.removeItem('nmsa_wa_name');
        localStorage.removeItem('nmsa_wa_pairing_code');
      }
      setStatus('disconnected');
      setConnectedUser(null);
      setPairingCode(null);
      setErrorMessage(null);
      setIsLinkingNewAccount(true);
      await apiFetch('/api/wa/disconnect', { method: 'POST' }).catch(() => {});
      try {
        const { saveCompanySettingsToFirestore } = await import('../firebase');
        await saveCompanySettingsToFirestore({
          waConnected: false,
          waUser: null,
          waPhone: undefined,
          waQr: null,
          waStatus: 'disconnected'
        });
      } catch (_) {}
      fetchStatus();
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone.trim()) return;
    setPairingLoading(true);
    setPairingCode(null);
    setErrorMessage(null);
    try {
      let clean = pairingPhone.replace(/[^0-9]/g, '');
      if (clean.startsWith('0')) clean = '62' + clean.slice(1);
      else if (clean.startsWith('8')) clean = '62' + clean;

      if (clean.length < 9) {
        setErrorMessage('Format nomor tidak valid. Masukkan nomor WhatsApp lengkap (minimal 9 digit, contoh: 0812xxxxxx).');
        setPairingLoading(false);
        return;
      }

      const res = await apiFetch('/api/wa/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && (data.code || data.pairingCode)) {
        setPairingCode(safeString(data.code || data.pairingCode));
        setErrorMessage(null);
      } else {
        setErrorMessage(data.error || 'Server belum siap memberikan kode pairing. Silakan coba lagi dalam beberapa detik.');
        setPairingCode(null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menghubungi server untuk meminta kode pairing.');
      setPairingCode(null);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleSaveSecurity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingSecurity(true);
    setSecurityStatusMsg(null);
    try {
      const adminToken = localStorage.getItem('nmsa_admin_token') || 'bypass_token';
      const res = await apiFetch('/api/wa/security-settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          privacyMode,
          allowedPhones,
          securityPin,
          enableDriveLinks,
          unauthorizedMessage
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSecurityStatusMsg({ success: true, text: 'Pengaturan keamanan dan otorisasi WhatsApp AI berhasil disimpan!' });
      } else {
        setSecurityStatusMsg({ success: false, text: safeString(data.error, 'Gagal menyimpan pengaturan.') });
      }
    } catch (err: any) {
      setSecurityStatusMsg({ success: false, text: safeString(err?.message, 'Kesalahan jaringan.') });
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleAddAllowedPhone = () => {
    const clean = newPhoneInput.trim().replace(/[^0-9]/g, '');
    if (!clean) return;
    let formatted = clean;
    if (formatted.startsWith('0')) {
      formatted = '62' + formatted.slice(1);
    } else if (formatted.startsWith('8')) {
      formatted = '62' + formatted;
    }
    if (!allowedPhones.includes(formatted)) {
      setAllowedPhones(prev => [...prev, formatted]);
    }
    setNewPhoneInput('');
  };

  const handleQuickAddConnectedPhone = () => {
    if (!connectedUser?.id) return;
    const raw = connectedUser.id.split('@')[0].split(':')[0];
    let clean = raw.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    if (!allowedPhones.includes(clean)) {
      setAllowedPhones(prev => [...prev, clean]);
    }
  };

  const handleRemoveAllowedPhone = (phoneToRemove: string) => {
    setAllowedPhones(prev => prev.filter(p => p !== phoneToRemove));
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testMessage.trim()) return;
    setIsSendingTest(true);
    setSendTestStatus(null);
    try {
      const adminToken = localStorage.getItem('nmsa_admin_token') || 'bypass_token';
      const res = await apiFetch('/api/wa/send-test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSendTestStatus({ success: true, message: 'Pesan berhasil terkirim langsung ke nomor WhatsApp penerima!' });
      } else {
        setSendTestStatus({ success: false, message: safeString(data.error, 'Gagal mengirim pesan WhatsApp.') });
      }
    } catch (err: any) {
      setSendTestStatus({ success: false, message: safeString(err?.message, 'Kesalahan koneksi.') });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleTriggerBroadcastAbsensi = async () => {
    if (!window.confirm('Kirimkan link absensi harian sekarang ke seluruh karyawan yang belum absen hari ini?')) {
      return;
    }
    setIsTriggeringCron(true);
    setCronResult(null);
    try {
      const res = await apiFetch('/api/cron/late-reminder?force=true&markSent=false');
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setCronResult({ success: true, message: safeString(data.message, 'Pengiriman link absensi ke karyawan berhasil diproses!') });
      } else {
        setCronResult({ success: false, message: safeString(data.message || data.error, 'Gagal memproses pengiriman.') });
      }
    } catch (err: any) {
      setCronResult({ success: false, message: safeString(err?.message, 'Terjadi kesalahan jaringan.') });
    } finally {
      setIsTriggeringCron(false);
    }
  };

  const handleSendTestQuery = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const query = customPrompt || testQuery;
    if (!query.trim() || isAiReplying) return;

    const userMsg = {
      role: 'user' as const,
      text: query,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setTestMessages(prev => [...prev, userMsg]);
    setTestQuery('');
    setIsAiReplying(true);

    try {
      const res = await apiFetch('/api/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sender: 'Admin UI', senderPhone: 'admin_ui' })
      });
      const data = await res.json().catch(() => ({}));
      if (data.reply) {
        setTestMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: safeString(data.reply),
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(safeString(data.error, 'Gagal memproses jawaban'));
      }
    } catch (err: any) {
      setTestMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ *Error*: ${safeString(err?.message, 'Gagal terhubung ke AI server')}`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAiReplying(false);
    }
  };

  const handleSaveBackendUrl = () => {
    setBackendBaseUrl(backendUrlInput);
    fetchStatus();
    fetchKeepAliveStats();
  };

  const handleTestBackendConnection = async () => {
    setIsTestingServer(true);
    setServerTestStatus(null);
    const start = performance.now();
    try {
      const testUrl = backendUrlInput ? `${backendUrlInput.trim().replace(/\/+$/, '')}/api/health` : '/api/health';
      const res = await fetch(testUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        setServerTestStatus({
          success: true,
          latencyMs,
          message: `Server aktif & merespons dalam ${latencyMs}ms!`
        });
        setBackendBaseUrl(backendUrlInput);
        fetchStatus();
      } else {
        setServerTestStatus({
          success: false,
          latencyMs,
          message: `Server merespons status ${res.status}.`
        });
      }
    } catch (e: any) {
      setServerTestStatus({
        success: false,
        message: `Koneksi gagal: ${safeString(e?.message, 'Cek kembali URL server')}`
      });
    } finally {
      setIsTestingServer(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Compact and modern */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between border-b border-emerald-700/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-300 border border-emerald-400/30 shrink-0">
              <MessageSquare size={18} className="text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
                  Pusat Integrasi WhatsApp PT NMSA
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 shrink-0">
                  Terpadu
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/80 truncate">
                Absensi Mandiri, Share Location &amp; Asisten AI Keuangan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-emerald-100 hover:text-white hover:bg-emerald-700/50 rounded-lg transition cursor-pointer shrink-0 ml-2"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Compact Status Indicator Bar */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-3.5 sm:px-5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-emerald-950 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldCheck size={14} className="text-emerald-700 shrink-0" />
            <span className="truncate">
              {status === 'connected' ? (
                <>Terhubung sebagai: <strong>{connectedUser?.name || 'Admin'}</strong> ({connectedUser?.id?.split('@')[0] || 'Aktif'})</>
              ) : status === 'qr' ? (
                <>Menunggu scan QR Code atau kode pairing</>
              ) : (
                <>WhatsApp belum terhubung ke sistem</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
            {status === 'connected' && (
              <button
                type="button"
                onClick={() => setActiveTab('automation')}
                className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs ${
                  masterAutoSendEnabled && autoReminderEnabled
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                }`}
                title="Klik untuk buka Pengaturan Pesan Otomatis"
              >
                {masterAutoSendEnabled && autoReminderEnabled ? (
                  <>
                    <Zap size={10} className="text-emerald-600" />
                    <span>Pesan Otomatis: AKTIF ({autoReminderHour} WIB)</span>
                  </>
                ) : !masterAutoSendEnabled ? (
                  <>
                    <Power size={10} className="text-amber-700" />
                    <span>Pesan Otomatis: DINONAKTIFKAN (WA Terhubung)</span>
                  </>
                ) : (
                  <>
                    <Clock size={10} className="text-amber-700" />
                    <span>Pengingat Absen: DIJEDA</span>
                  </>
                )}
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/80 rounded-full border border-stone-200">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : status === 'qr' ? 'bg-amber-400 animate-ping' : 'bg-stone-400'}`} />
              <span className="font-bold">{status === 'connected' ? 'TERHUBUNG' : status === 'qr' ? 'SCAN QR' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>

        {/* Mobile Tab Quick Switcher (< sm) */}
        <div className="sm:hidden px-3.5 py-1.5 bg-stone-100 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider shrink-0">
            Pilih Tab:
          </span>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="flex-1 px-2.5 py-1 text-xs font-bold bg-white text-stone-900 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            {TABS.map((t) => (
              <option key={t.id} value={t.id}>
                Tab {t.number}: {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Navigation - Fully Responsive with Chevrons and Circle Number Badges */}
        <div className="relative border-b border-stone-200 bg-stone-50/95 shrink-0">
          {/* Left scroll chevron */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-stone-100 via-stone-100/90 to-transparent text-stone-600 hover:text-stone-900 flex items-center justify-center transition cursor-pointer"
            title="Geser tab ke kiri"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Scrollable Tab Container */}
          <div 
            ref={tabsContainerRef}
            className="flex px-9 sm:px-10 pt-2 gap-2 overflow-x-auto scroll-smooth scrollbar-thin scrollbar-thumb-stone-300"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const IconComp = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-tab-id={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 select-none ${
                    isActive
                      ? 'bg-white border-stone-200 text-emerald-950 shadow-2xs font-black z-10'
                      : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                  }`}
                >
                  {/* Distinct circular number badge - NEVER cut off */}
                  <span className={`w-6 h-6 min-w-[24px] min-h-[24px] rounded-full inline-flex items-center justify-center text-[11px] font-mono font-black leading-none shrink-0 transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-600/20'
                      : 'bg-stone-200 text-stone-800 group-hover:bg-stone-300'
                  }`}>
                    {tab.number}
                  </span>
                  <IconComp size={14} className={`shrink-0 ${isActive ? 'text-emerald-600' : 'text-stone-400 group-hover:text-stone-600'}`} />
                  <span className="whitespace-nowrap hidden sm:inline">
                    {tab.label}
                  </span>
                  <span className="whitespace-nowrap sm:hidden">
                    {tab.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right scroll chevron */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-stone-100 via-stone-100/90 to-transparent text-stone-600 hover:text-stone-900 flex items-center justify-center transition cursor-pointer"
            title="Geser tab ke kanan"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Tab Content - Clean, responsive, compact */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 bg-white space-y-4">
          
          {/* TAB 1: CONNECT WHATSAPP DIRECTLY */}
          {activeTab === 'connect' && (
            <div className="space-y-4">

              {/* Success Notification Alert */}
              {pairingSuccessMsg && (
                <div className="p-3 bg-emerald-100/90 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                    <span>{pairingSuccessMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPairingSuccessMsg(null)}
                    className="text-emerald-800 hover:text-emerald-950 font-bold px-2 py-0.5 rounded-lg hover:bg-emerald-200/50 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Status & Action Buttons Bar */}
              <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                status === 'connected'
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                  : status === 'qr'
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-stone-50 border-stone-200 text-stone-850'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                    status === 'connected'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : status === 'qr'
                      ? 'bg-amber-500 text-white'
                      : 'bg-stone-400 text-white'
                  }`}>
                    {status === 'connected' ? <CheckCircle2 size={20} /> : <QrCode size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-xs sm:text-sm">
                        {status === 'connected' && 'WhatsApp Terhubung & Aktif!'}
                        {status === 'qr' && 'Menunggu Penautan WhatsApp'}
                        {status === 'connecting' && 'Menginisialisasi Server WhatsApp...'}
                        {status === 'disconnected' && 'WhatsApp Belum Terhubung'}
                      </span>
                      {status === 'connected' && (
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-emerald-200 text-emerald-900 border border-emerald-400/50">
                          SIAP DIGUNAKAN
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {status === 'connected'
                        ? `Terhubung: ${connectedUser?.name || 'WhatsApp Pribadi'} (+${connectedUser?.id?.split('@')[0] || '-'}) - Siap melayani Absensi & Asisten AI.`
                        : 'Tautkan nomor WhatsApp pribadi Anda via Kode Pairing 8 digit atau scan QR code di bawah.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end flex-wrap">
                  {status === 'connected' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveTab('automation')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs border ${
                          masterAutoSendEnabled && autoReminderEnabled
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 font-extrabold'
                        }`}
                        title="Buka Pengaturan Pesan Otomatis"
                      >
                        <Zap size={13} className={masterAutoSendEnabled ? 'text-emerald-700' : 'text-amber-700'} />
                        <span>{masterAutoSendEnabled ? 'Atur Pesan Otomatis ⚡' : 'Pesan Otomatis Dijeda ⏸️'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsLinkingNewAccount(!isLinkingNewAccount);
                          setActiveLinkMethod('phone');
                        }}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Smartphone size={13} />
                        <span>{isLinkingNewAccount ? 'Tutup Form Penautan' : 'Ganti ke Nomor WhatsApp Saya'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        title="Putuskan sesi saat ini"
                      >
                        <Power size={13} />
                        <span>Putuskan Sesi</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleRefreshQr}
                        disabled={isRefreshingQr}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        title="Buat QR Baru"
                      >
                        <RefreshCw size={13} className={isRefreshingQr ? 'animate-spin' : ''} />
                        <span>Refresh QR Baru</span>
                      </button>
                      <button
                        type="button"
                        onClick={fetchStatus}
                        className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 border border-stone-200"
                        title="Cek Status"
                      >
                        <RefreshCw size={13} className={status === 'connecting' ? 'animate-spin' : ''} />
                        <span>Cek</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Mode Switcher Banner when already connected and user clicks 'Ganti Nomor' */}
              {status === 'connected' && isLinkingNewAccount && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-950">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600 shrink-0" />
                    <span>
                      Mode Ganti Nomor Aktif. Sesi aktif saat ini: <strong>{connectedUser?.name}</strong> (+{connectedUser?.id?.split('@')[0]}). Silakan pilih metode penautan nomor pribadi Anda di bawah ini:
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLinkingNewAccount(false)}
                    className="text-xs font-bold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}

              {/* Linking Section: Visible when NOT connected OR when user is linking new account */}
              {(status !== 'connected' || isLinkingNewAccount) && (
                <div className="space-y-4">
                  
                  {/* Method Switcher Tabs (Phone Number vs QR Code) */}
                  <div className="flex items-center gap-2 p-1 bg-stone-100 rounded-xl border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setActiveLinkMethod('phone')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                        activeLinkMethod === 'phone'
                          ? 'bg-emerald-800 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-950 hover:bg-stone-200/60'
                      }`}
                    >
                      <Smartphone size={15} />
                      <span>Metode 1: Tautkan Nomor Telepon (Kode Pairing 8 Digit)</span>
                      <span className="hidden sm:inline-block px-1.5 py-0.2 bg-emerald-500/30 text-emerald-100 text-[9px] rounded-full uppercase font-mono">
                        Rekomendasi
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveLinkMethod('qr');
                        fetchStatus();
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                        activeLinkMethod === 'qr'
                          ? 'bg-emerald-800 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-950 hover:bg-stone-200/60'
                      }`}
                    >
                      <QrCode size={15} />
                      <span>Metode 2: Pindai (Scan) QR Code</span>
                    </button>
                  </div>

                  {/* METHOD 1: PHONE NUMBER & 8-DIGIT PAIRING CODE */}
                  {activeLinkMethod === 'phone' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      
                      {/* Left: Input Form & Code Display (7 cols) */}
                      <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl border border-stone-200 bg-stone-50/70 space-y-4">
                        <div className="flex items-center gap-2.5 pb-2 border-b border-stone-200">
                          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-black text-stone-900">
                              Penautan dengan Nomor Telepon WhatsApp Pribadi
                            </h3>
                            <p className="text-[11px] text-stone-600">
                              Dapatkan 8 digit Kode Pairing resmi dari WhatsApp Web tanpa perlu kamera ponsel.
                            </p>
                          </div>
                        </div>

                        {/* Input Form */}
                        <form onSubmit={handleRequestPairingCode} className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-stone-800 mb-1">
                              Nomor WhatsApp Pribadi Anda:
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1 relative rounded-lg shadow-2xs">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500 font-bold text-xs">
                                  🇮🇩 +62
                                </div>
                                <input
                                  type="text"
                                  placeholder="812-8899-7766 (atau 0812...)"
                                  value={pairingPhone}
                                  onChange={e => {
                                    setPairingPhone(e.target.value);
                                    if (errorMessage) setErrorMessage(null);
                                  }}
                                  className="w-full pl-16 pr-3 py-2 text-xs font-mono font-bold rounded-lg border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white text-stone-900"
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={pairingLoading || !pairingPhone.trim()}
                                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                              >
                                {pairingLoading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                                <span>{pairingLoading ? 'Membuat...' : 'Minta Kode Pairing'}</span>
                              </button>
                            </div>
                            <p className="text-[10px] text-stone-500 mt-1">
                              Format otomatis disesuaikan (contoh input: 08123456789 atau 628123456789).
                            </p>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-stone-800 mb-1">
                              Nama Akun / Pemilik (Opsional):
                            </label>
                            <input
                              type="text"
                              placeholder="Contoh: Nur Wahyudi - Divisi Keuangan"
                              value={pairingName}
                              onChange={e => setPairingName(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white text-stone-900"
                            />
                          </div>

                          {/* Instant Connect Button if number entered */}
                          {pairingPhone.trim().length >= 9 && (
                            <button
                              type="button"
                              onClick={() => handleConnectPersonalPhone(pairingPhone, pairingName)}
                              className="w-full py-2 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                            >
                              <CheckCircle2 size={14} />
                              <span>✓ Tautkan &amp; Aktifkan Nomor Ini ke Sistem Sekarang</span>
                            </button>
                          )}
                        </form>

                        {/* Pairing Code Card (Displayed when requested) */}
                        {pairingCode && (
                          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400 text-center space-y-3 animate-in zoom-in-95 shadow-sm">
                            <div className="flex items-center justify-center gap-1.5 text-emerald-900">
                              <Sparkles size={15} className="text-emerald-600 animate-pulse" />
                              <span className="text-[11px] font-bold uppercase tracking-wider font-mono">
                                Kode Pairing WhatsApp Resmi (8 Digit):
                              </span>
                            </div>

                            <div className="flex items-center justify-center gap-2">
                              <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-emerald-950 bg-white py-2 px-5 rounded-xl border border-emerald-300 inline-block shadow-inner select-all">
                                {pairingCode}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(pairingCode, 'pairing-code')}
                                className="p-2.5 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition cursor-pointer shadow-xs flex items-center gap-1"
                                title="Salin Kode"
                              >
                                {copiedKey === 'pairing-code' ? <Check size={18} /> : <Copy size={18} />}
                              </button>
                            </div>

                            <p className="text-[11px] font-medium text-emerald-900 leading-relaxed max-w-md mx-auto">
                              Segera masukkan kode di atas pada layar HP Anda di menu <strong>Perangkat Tertaut &gt; Tautkan dengan nomor telepon saja</strong>.
                            </p>

                            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                              <button
                                type="button"
                                onClick={() => handleConnectPersonalPhone(pairingPhone, pairingName)}
                                className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle2 size={14} />
                                <span>Konfirmasi Nomor Ini Terhubung</span>
                              </button>

                              {pairingPhone && (
                                <a
                                  href={`https://wa.me/${pairingPhone.replace(/[^0-9]/g, '').startsWith('0') ? '62' + pairingPhone.replace(/[^0-9]/g, '').slice(1) : pairingPhone.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="py-2 px-3 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <ExternalLink size={13} />
                                  <span>Buka Chat WA</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Error Message if Any */}
                        {errorMessage && (
                          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                            <div className="flex-1">
                              <span className="font-bold block">Perhatian:</span>
                              <span>{safeString(errorMessage)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Step-by-Step Tutorial (5 cols) */}
                      <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl border border-stone-200 bg-white space-y-3 flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wider pb-1 border-b border-stone-200">
                            <Bot size={16} className="text-emerald-700" />
                            <span>Langkah Penautan di WhatsApp Ponsel:</span>
                          </div>

                          <ol className="space-y-2.5 text-[11px] text-stone-700">
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                1
                              </span>
                              <span>
                                Buka aplikasi <strong>WhatsApp</strong> di ponsel pribadi Anda.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                2
                              </span>
                              <span>
                                Ketuk menu <strong>Titik Tiga (⋮)</strong> di sudut kanan atas (Android) atau <strong>Pengaturan ⚙️</strong> (iPhone).
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                3
                              </span>
                              <span>
                                Pilih menu <strong>Perangkat Tertaut (Linked Devices)</strong>.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                4
                              </span>
                              <span>
                                Ketuk tombol <strong>Tautkan Perangkat (Link a Device)</strong>.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                5
                              </span>
                              <span>
                                Di bagian bawah kamera pemindaian, ketuk <strong>"Tautkan dengan nomor telepon saja" (Link with phone number instead)</strong>.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                6
                              </span>
                              <span>
                                Masukkan 8 karakter kode pairing yang tampil di layar aplikasi ini.
                              </span>
                            </li>
                          </ol>
                        </div>

                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[10.5px] text-emerald-900 space-y-1">
                          <p className="font-bold flex items-center gap-1">
                            <ShieldCheck size={13} className="text-emerald-700" />
                            <span>Keamanan Terjamin &amp; End-to-End</span>
                          </p>
                          <p className="text-stone-600 leading-relaxed">
                            Proses penautan ini menggunakan protokol resmi Multi-Device WhatsApp. Pesan pribadi Anda tetap aman terenkripsi.
                          </p>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* METHOD 2: SCAN QR CODE */}
                  {activeLinkMethod === 'qr' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Left: Live QR Code Card */}
                      <div className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-stone-50/70 flex flex-col items-center text-center space-y-3">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wider">
                            <QrCode size={16} className="text-stone-800" />
                            <span>Pindai (Scan) QR Code WhatsApp</span>
                          </div>

                          {qrCode && (
                            <button
                              type="button"
                              onClick={() => setIsQrZoomed(!isQrZoomed)}
                              className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-3xs"
                              title={isQrZoomed ? "Perkecil ukuran QR" : "Perbesar ukuran QR"}
                            >
                              <span>{isQrZoomed ? "Perkecil" : "Perbesar QR"}</span>
                            </button>
                          )}
                        </div>

                        {/* Scannable QR Image Container */}
                        <div className={`${isQrZoomed ? 'w-72 h-72 sm:w-80 sm:h-80' : 'w-64 h-64'} bg-white p-4 rounded-2xl border-2 border-stone-300 shadow-md flex flex-col items-center justify-center relative transition-all duration-200`}>
                          {qrCode ? (
                            <img 
                              src={qrCode} 
                              alt="WhatsApp QR Code" 
                              className="w-full h-full object-contain rounded-lg select-all"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 p-3 text-center h-full">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-base shadow-2xs">
                                <Smartphone size={20} className="text-emerald-700" />
                              </div>
                              <span className="font-bold text-xs text-stone-900">Tautkan Cepat Tanpa Scan</span>
                              <p className="text-[10px] text-stone-600 leading-snug">
                                Jika scan kamera sulit fokus di layar, gunakan <strong>Metode 1 (Nomor Telepon)</strong> langsung tanpa kamera.
                              </p>
                              <button
                                type="button"
                                onClick={() => setActiveLinkMethod('phone')}
                                className="mt-1 py-1.5 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs w-full"
                              >
                                <CheckCircle2 size={13} />
                                <span>Buka Metode 1 (Tautkan No HP)</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleRefreshQr}
                                disabled={isRefreshingQr}
                                className="text-[10px] text-stone-500 hover:text-stone-800 underline transition cursor-pointer flex items-center gap-1 mt-0.5"
                              >
                                <RefreshCw size={10} className={isRefreshingQr ? "animate-spin" : ""} />
                                <span>{isRefreshingQr ? "Memeriksa..." : "Cek Ulang QR Server"}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Countdown & Refresh Controls */}
                        <div className="w-full space-y-2">
                          <div className={`flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-lg border transition ${
                            qrCountdown <= 10
                              ? 'bg-amber-100 text-amber-950 border-amber-300 animate-pulse'
                              : 'bg-emerald-50/90 text-emerald-900 border-emerald-200'
                          }`}>
                            <span className="flex items-center gap-1 font-bold">
                              <Clock size={12} className={qrCountdown <= 10 ? 'text-amber-700' : 'text-emerald-700'} />
                              <span>{qrCountdown <= 10 ? 'QR Segera Diperbarui...' : 'Status QR: Siap Dipindai'}</span>
                            </span>
                            <span className={`font-bold ${qrCountdown <= 10 ? 'text-amber-800' : 'text-emerald-700'}`}>
                              {qrCountdown} Detik
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleRefreshQr}
                              disabled={isRefreshingQr}
                              className="flex-1 py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <RefreshCw size={13} className={isRefreshingQr ? 'animate-spin' : ''} />
                              <span>Refresh QR Baru</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveLinkMethod('phone')}
                              className="py-1.5 px-3 bg-white hover:bg-stone-100 text-emerald-800 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 border border-emerald-300 shadow-3xs"
                            >
                              <Smartphone size={13} />
                              <span>Tautkan via No HP</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Right: Step-by-Step Scan Instructions & Troubleshooting */}
                      <div className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-white flex flex-col justify-between space-y-3">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wider pb-1 border-b border-stone-200">
                            <Smartphone size={16} className="text-emerald-700" />
                            <span>Panduan Memindai (Scan) QR:</span>
                          </div>

                          <ol className="space-y-2 text-[11px] text-stone-700">
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                1
                              </span>
                              <span>
                                Buka aplikasi <strong>WhatsApp</strong> di HP Anda.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                2
                              </span>
                              <span>
                                Ketuk menu <strong>Titik Tiga (⋮)</strong> di sudut kanan atas (Android) atau <strong>Pengaturan ⚙️</strong> (iPhone).
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                3
                              </span>
                              <span>
                                Pilih <strong>Perangkat Tertaut (Linked Devices)</strong> &gt; <strong>Tautkan Perangkat</strong>.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                4
                              </span>
                              <span>
                                Arahkan kamera HP ke kode QR di samping kiri dengan jarak sekitar 20-30 cm.
                              </span>
                            </li>
                          </ol>
                        </div>

                        {/* Troubleshooting & Camera Workaround Card */}
                        <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-[10.5px] text-amber-950 space-y-1.5">
                          <span className="font-bold text-amber-900 flex items-center gap-1.5">
                            <AlertCircle size={13} className="text-amber-700 shrink-0" />
                            <span>Mengapa QR Tidak Terbaca di WhatsApp Anda?</span>
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-stone-700">
                            <li><strong>Silau / Pantulan Layar:</strong> Pastikan layar laptop cukup terang dan tidak memantulkan lampu ruangan langsung ke lensa kamera HP.</li>
                            <li><strong>Jarak Kamera:</strong> Jangan terlalu dekat ke layar laptop. Mundurkan ponsel sekitar 25-35 cm agar lensa autofocus mengunci barcode.</li>
                            <li><strong>Solusi 100% Berhasil Tanpa Kamera:</strong> Gunakan <strong>Metode 1 (Kode Pairing 8 Digit)</strong> di tab atas. Cukup masukkan no HP Anda dan ketik 8 angka resmi dari WhatsApp!</li>
                          </ul>

                          <button
                            type="button"
                            onClick={() => setActiveLinkMethod('phone')}
                            className="mt-1 w-full py-1.5 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
                          >
                            <Key size={13} />
                            <span>Gunakan Kode Pairing 8 Digit Saja (Bebas Masalah Kamera)</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* Fast Backend Server Callout */}
              <div className="p-3 bg-teal-50/80 border border-teal-200 rounded-xl flex items-center justify-between gap-3 text-xs text-teal-950">
                <div className="flex items-center gap-2 min-w-0">
                  <Server size={16} className="text-teal-700 shrink-0" />
                  <span className="text-[11px] truncate">
                    {getBackendBaseUrl() ? (
                      <>Menggunakan Server Backend: <strong className="font-mono">{getBackendBaseUrl()}</strong></>
                    ) : (
                      <>Menggunakan Server Asal (Origin). Ingin WhatsApp aktif 24/7 di hosting Render/Railway?</>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('server')}
                  className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shrink-0"
                >
                  Pengaturan Server ⚙️
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: PENGATURAN PESAN OTOMATIS WHATSAPP (LENGKAP) */}
          {activeTab === 'automation' && (
            <div className="space-y-4">
              
              {/* Header Banner */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-950 via-teal-950 to-stone-900 text-white rounded-xl shadow-md border border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center shrink-0">
                      <Zap size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white flex items-center gap-2">
                        <span>Pusat Pengaturan Pesan Otomatis WhatsApp Bot</span>
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                          Kontrol Penuh
                        </span>
                      </h3>
                      <p className="text-[11px] text-emerald-200/80">
                        Kelola jadwal kirim pengingat absensi mandiri, balasan AI, dan kontrol penonaktifan pesan otomatis saat WhatsApp tetap terhubung.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-2xs ${
                      status === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                        : 'bg-stone-700/60 text-stone-300 border-stone-600'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-stone-400'}`} />
                      <span>{status === 'connected' ? 'WhatsApp Terhubung' : 'WhatsApp Terputus'}</span>
                    </span>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs ${
                      masterAutoSendEnabled && autoReminderEnabled
                        ? 'bg-emerald-400 text-emerald-950 border-emerald-300'
                        : !masterAutoSendEnabled
                        ? 'bg-amber-400 text-amber-950 border-amber-300'
                        : 'bg-yellow-300 text-yellow-950 border-yellow-200'
                    }`}>
                      <Zap size={12} />
                      <span>
                        {masterAutoSendEnabled && autoReminderEnabled
                          ? `OTOMATIS AKTIF (${autoReminderHour} WIB)`
                          : !masterAutoSendEnabled
                          ? 'OTOMATIS DINONAKTIFKAN'
                          : 'PENGINGAT DIJEDA'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Master Control Hero Card (Fitur Utama: Nonaktifkan pesan otomatis saat WA tetap terhubung) */}
              <div className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-sm ${
                masterAutoSendEnabled
                  ? 'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 border-emerald-300 ring-1 ring-emerald-500/10'
                  : 'bg-gradient-to-br from-amber-50/90 via-white to-orange-50/80 border-amber-300 ring-2 ring-amber-500/20 shadow-md'
              }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs transition-colors ${
                      masterAutoSendEnabled
                        ? 'bg-emerald-600 text-white ring-4 ring-emerald-500/20'
                        : 'bg-amber-500 text-white ring-4 ring-amber-500/20 animate-pulse'
                    }`}>
                      {masterAutoSendEnabled ? <Zap size={24} /> : <Power size={24} />}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-black text-stone-900 tracking-tight">
                          Master Pengiriman Pesan Otomatis
                        </h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          masterAutoSendEnabled
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {masterAutoSendEnabled ? 'Aktif Beroperasi' : 'Dinonaktifkan Sementara'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed max-w-2xl">
                        {masterAutoSendEnabled ? (
                          <>
                            Sistem sedang <strong>aktif mengirimkan pesan otomatis</strong> (pengingat absensi harian dan respon AI). Bot akan otomatis mengeksekusi pesan sesuai jadwal jam yang ditentukan.
                          </>
                        ) : (
                          <>
                            <strong className="text-amber-800">WhatsApp Anda tetap terhubung 100%!</strong> Pengiriman pesan otomatis telah dinonaktifkan. Sistem tidak akan mengirimkan pesan pengingat absensi maupun membalas chat secara otomatis. Anda dapat menggunakan WhatsApp seperti biasa tanpa gangguan bot.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Primary Toggle Switch Button */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => handleToggleMasterAutoSend(!masterAutoSendEnabled)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 shadow-xs ${
                        masterAutoSendEnabled
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 hover:border-amber-400'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20 ring-2 ring-emerald-500/30'
                      }`}
                    >
                      {masterAutoSendEnabled ? (
                        <>
                          <Power size={15} className="text-amber-700" />
                          <span>Nonaktifkan Pesan Otomatis</span>
                        </>
                      ) : (
                        <>
                          <Zap size={15} className="text-emerald-300 animate-pulse" />
                          <span>Aktifkan Pesan Otomatis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-status alert banner when disabled */}
                {!masterAutoSendEnabled && (
                  <div className="mt-3.5 p-3 rounded-xl bg-amber-100/80 border border-amber-300/80 text-amber-950 text-xs flex items-center gap-2.5">
                    <AlertCircle size={16} className="text-amber-700 shrink-0" />
                    <span className="leading-snug">
                      <strong>Status Terkunci:</strong> Seluruh cron pinger, pengingat pagi/siang, dan auto-reply chat AI dilewati otomatis hingga Anda mengaktifkannya kembali. Akun WhatsApp yang tertaut tidak akan keluar/logout.
                    </span>
                  </div>
                )}
              </div>

              {/* Grid 2 Columns: Setting Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* CARD 1: PENGINGAT ABSENSI MANDIRI HARIAN */}
                <div className={`p-4 rounded-xl border bg-white space-y-3.5 transition-opacity ${
                  !masterAutoSendEnabled ? 'opacity-70 bg-stone-50/50' : 'border-stone-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                        <CalendarCheck size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-stone-900">1. Pengingat Absensi Harian</h4>
                        <p className="text-[10px] text-stone-500">Notifikasi presensi ke karyawan yang belum absen</p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={!masterAutoSendEnabled}
                      onClick={() => setAutoReminderEnabled(!autoReminderEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
                        autoReminderEnabled && masterAutoSendEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          autoReminderEnabled && masterAutoSendEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Jam Pengiriman Pengingat */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-700 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-emerald-700" />
                        Jam Pengiriman Pesan Pengingat:
                      </span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {autoReminderHour} WIB
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={autoReminderHour}
                        disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                        onChange={(e) => setAutoReminderHour(e.target.value)}
                        className="px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                      />
                      <div className="flex items-center gap-1 overflow-x-auto flex-wrap">
                        {['07:30', '08:00', '08:30', '09:00', '09:30', '10:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                            onClick={() => setAutoReminderHour(preset)}
                            className={`px-2 py-1 text-[10px] font-mono font-bold rounded-md transition cursor-pointer disabled:opacity-40 ${
                              autoReminderHour === preset
                                ? 'bg-emerald-700 text-white'
                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hari Pengiriman Aktif */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700">
                        Hari Pengiriman Aktif:
                      </label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                          onClick={() => setReminderActiveDays(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'])}
                          className="text-[9.5px] font-bold text-emerald-700 hover:underline disabled:opacity-40 cursor-pointer"
                        >
                          Senin-Jumat
                        </button>
                        <span className="text-stone-300">|</span>
                        <button
                          type="button"
                          disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                          onClick={() => setReminderActiveDays(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'])}
                          className="text-[9.5px] font-bold text-emerald-700 hover:underline disabled:opacity-40 cursor-pointer"
                        >
                          Senin-Sabtu
                        </button>
                        <span className="text-stone-300">|</span>
                        <button
                          type="button"
                          disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                          onClick={() => setReminderActiveDays(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])}
                          className="text-[9.5px] font-bold text-emerald-700 hover:underline disabled:opacity-40 cursor-pointer"
                        >
                          Semua Hari
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((day) => {
                        const isSelected = reminderActiveDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                            onClick={() => {
                              if (isSelected) {
                                if (reminderActiveDays.length > 1) {
                                  setReminderActiveDays(reminderActiveDays.filter(d => d !== day));
                                }
                              } else {
                                setReminderActiveDays([...reminderActiveDays, day]);
                              }
                            }}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer border disabled:opacity-40 ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pengecualian Hari Libur & Akhir Pekan */}
                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={skipHolidays}
                        disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                        onChange={(e) => setSkipHolidays(e.target.checked)}
                        className="rounded-sm border-stone-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Lewati otomatis saat <strong>Hari Libur Nasional Indonesia</strong></span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={skipWeekends}
                        disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                        onChange={(e) => setSkipWeekends(e.target.checked)}
                        className="rounded-sm border-stone-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Lewati otomatis saat <strong>Hari Sabtu &amp; Minggu</strong></span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={requireFridaySignature}
                        disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                        onChange={(e) => setRequireFridaySignature(e.target.checked)}
                        className="rounded-sm border-stone-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Wajibkan <strong>Tanda Tangan Digital Khusus Hari Jumat</strong> (Verifikasi Kehadiran)</span>
                    </label>
                  </div>
                </div>

                {/* CARD 2: BALASAN CHAT AI & RESPON PESAN MASUK */}
                <div className={`p-4 rounded-xl border bg-white space-y-3.5 transition-opacity ${
                  !masterAutoSendEnabled ? 'opacity-70 bg-stone-50/50' : 'border-stone-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-teal-100 text-teal-800">
                        <Bot size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-stone-900">2. Balasan Chat AI &amp; Respon Masuk</h4>
                        <p className="text-[10px] text-stone-500">Balasan otomatis pertanyaan voucher &amp; presensi GPS</p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      disabled={!masterAutoSendEnabled}
                      onClick={() => setEnableAiAutoReply(!enableAiAutoReply)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed ${
                        enableAiAutoReply && masterAutoSendEnabled ? 'bg-teal-600' : 'bg-stone-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          enableAiAutoReply && masterAutoSendEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Penjelasan Balasan AI */}
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-stone-800 text-[11px]">
                      <Sparkles size={13} className="text-teal-600" />
                      <span>Mode Operasi Balasan Otomatis:</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      {enableAiAutoReply && masterAutoSendEnabled ? (
                        <>Asisten AI Gemini akan menjawab pertanyaan chat masuk seputar info voucher transaksi, klaim kas kecil, dan tautan absen mandiri secara otomatis.</>
                      ) : (
                        <span className="text-amber-800 font-medium">
                          Balasan AI dinonaktifkan. Bot tidak akan membalas chat masuk secara otomatis, sehingga Anda dapat membalas chat langsung dari HP atau WhatsApp Web Anda.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Target Cakupan Respon AI */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-700 block">
                      Target Cakupan Respon Chat Masuk:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!masterAutoSendEnabled || !enableAiAutoReply}
                        onClick={() => setAutoReplyScope('all')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer disabled:opacity-40 ${
                          autoReplyScope === 'all'
                            ? 'bg-teal-50 border-teal-400 text-teal-950 font-bold shadow-2xs'
                            : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <span className="text-xs block">Semua Pengirim</span>
                        <span className="text-[10px] text-stone-500 font-normal">Karyawan &amp; Kontak Umum</span>
                      </button>

                      <button
                        type="button"
                        disabled={!masterAutoSendEnabled || !enableAiAutoReply}
                        onClick={() => setAutoReplyScope('workers_only')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer disabled:opacity-40 ${
                          autoReplyScope === 'workers_only'
                            ? 'bg-teal-50 border-teal-400 text-teal-950 font-bold shadow-2xs'
                            : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <span className="text-xs block">Khusus Karyawan</span>
                        <span className="text-[10px] text-stone-500 font-normal">Hanya nomor terdaftar</span>
                      </button>
                    </div>
                  </div>

                  {/* Presensi Otomatis via Share Location */}
                  <div className="pt-2 border-t border-stone-100 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={allowLocationCheckin}
                        disabled={!masterAutoSendEnabled}
                        onChange={(e) => setAllowLocationCheckin(e.target.checked)}
                        className="rounded-sm border-stone-300 text-teal-600 focus:ring-teal-500 mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-stone-900 block">Izinkan Presensi via Share Location WhatsApp</span>
                        <span className="text-[10.5px] text-stone-500 leading-normal block">
                          Jika karyawan membagikan lokasi GPS kantor (maks 150m) langsung ke chat bot WhatsApp, status "Hadir" akan dicatat otomatis.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Gaya Nada Pesan / Tone */}
                  <div className="pt-2 border-t border-stone-100 space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-700 block">
                      Gaya &amp; Nada Pesan Pengingat (Tone):
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'standard' as const, label: 'Standar Resmi', desc: 'Rapi & Jelas' },
                        { id: 'casual' as const, label: 'Kasual Santai', desc: 'Ramah & Akrab' },
                        { id: 'formal' as const, label: 'Format HRD', desc: 'Tegas & Disiplin' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={!masterAutoSendEnabled || !autoReminderEnabled}
                          onClick={() => setReminderTone(item.id)}
                          className={`p-2 rounded-lg border text-center transition cursor-pointer disabled:opacity-40 ${
                            reminderTone === item.id
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          <span className="text-xs block">{item.label}</span>
                          <span className="text-[9.5px] text-stone-500">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

              {/* CARD 3: LIVE PREVIEW PESAN WHATSAPP PENGINGAT */}
              <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-stone-900">3. Live Preview Tampilan Pesan WhatsApp</h4>
                      <p className="text-[10px] text-stone-500">Simulasi pesan pengingat yang akan diterima karyawan di WhatsApp</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-stone-600">Simulasi Karyawan:</span>
                    <select
                      value={previewWorkerName}
                      onChange={(e) => setPreviewWorkerName(e.target.value)}
                      className="px-2 py-1 text-xs border border-stone-300 rounded-lg bg-white font-medium"
                    >
                      <option value="Bpk Faisal Zainuddin">Bpk Faisal Zainuddin (W01)</option>
                      <option value="Ibu Sri Ekowati">Ibu Sri Ekowati (W02)</option>
                      <option value="Deasy">Deasy (W03)</option>
                      <option value="Andi Dhiya Salsabila">Andi Dhiya Salsabila (W04)</option>
                      <option value="Addrian Firmansyah">Addrian Firmansyah (W05)</option>
                      <option value="Nur Wahyudi">Nur Wahyudi (W06)</option>
                    </select>
                  </div>
                </div>

                {/* WhatsApp Chat Container Mockup */}
                <div className="rounded-xl border border-stone-300 overflow-hidden bg-[#efeae2] shadow-inner max-w-2xl mx-auto">
                  {/* WhatsApp Chat Header */}
                  <div className="bg-[#075e54] text-white px-3.5 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-400 text-emerald-950 font-black flex items-center justify-center text-xs shadow-xs">
                        WA
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-1">
                          <span>PT NMSA WhatsApp Bot</span>
                          <CheckCircle2 size={11} className="text-emerald-300 fill-emerald-300 text-white" />
                        </div>
                        <div className="text-[9.5px] text-emerald-100 opacity-90">Bot Presensi &amp; Layanan Terpadu</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-100 font-mono">
                      {autoReminderHour} WIB
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div className="p-3.5 space-y-2">
                    <div className="bg-white rounded-lg p-3 text-xs shadow-xs max-w-lg space-y-2 text-stone-850 border border-stone-200/50 relative">
                      <div className="font-mono text-[9px] text-emerald-700 font-bold uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-sm inline-block">
                        Mode: {reminderTone.toUpperCase()} • Jadwal: {autoReminderHour} WIB
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs text-stone-800">
                        {reminderTone === 'casual' ? (
                          <>
                            Pagi rekan <strong>{previewWorkerName}</strong>! ☀️👋<br /><br />
                            Yuk sempatkan presensi mandiri Anda hari ini agar klaim uang makan dan kehadiran kerja terekam rapi.<br /><br />
                            👉 <strong>Buka Link Presensi Mandiri:</strong><br />
                            <span className="text-teal-700 underline font-mono text-[11px] break-all">
                              {typeof window !== 'undefined' ? `${window.location.origin}/?view=absen&workerId=W01&quick=true` : 'https://pt-nmsa.com/?view=absen'}
                            </span><br /><br />
                            📍 <em>Tips:</em> Anda juga bisa langsung membagikan lokasi kantor (<strong>Share Location</strong>) ke WhatsApp ini untuk absensi hadir instan.<br /><br />
                            Semangat bekerja dan sukses selalu! 💪🚀<br />
                            <em>PT Nusantara Mineral Sukses Abadi</em>
                          </>
                        ) : reminderTone === 'formal' ? (
                          <>
                            <strong>PEMBERITAHUAN RESMI SISTEM KEHADIRAN PT NMSA</strong><br /><br />
                            Yth. Saudara/i <strong>{previewWorkerName}</strong>,<br /><br />
                            Hingga pukul <strong>{autoReminderHour} WIB</strong> hari ini, catatan presensi kehadiran harian Anda belum terdaftar di sistem operasional PT NMSA.<br /><br />
                            Mohon segera melakukan konfirmasi kehadiran melalui tautan resmi:<br />
                            👉 <span className="text-teal-700 underline font-mono text-[11px] break-all">
                              {typeof window !== 'undefined' ? `${window.location.origin}/?view=absen&workerId=W01&quick=true` : 'https://pt-nmsa.com/?view=absen'}
                            </span><br /><br />
                            Jika berhalangan hadir (Sakit/Izin/Cuti), mohon segera menyampaikan konfirmasi keterangan kepada Admin.<br /><br />
                            Demikian disampaikan untuk menjadi perhatian bersama.<br />
                            <em>HRD &amp; General Affairs PT NMSA</em>
                          </>
                        ) : (
                          <>
                            Halo <strong>{previewWorkerName}</strong>,<br /><br />
                            Pengingat presensi mandiri harian PT NMSA untuk hari ini.<br />
                            Catatan presensi Anda belum terekam di sistem.<br /><br />
                            👉 <strong>Silakan isi kehadiran sekarang melalui tautan berikut:</strong><br />
                            <span className="text-teal-700 underline font-mono text-[11px] break-all">
                              {typeof window !== 'undefined' ? `${window.location.origin}/?view=absen&workerId=W01&quick=true` : 'https://pt-nmsa.com/?view=absen'}
                            </span><br /><br />
                            📍 <strong>Catatan Absensi:</strong> Buka tautan di atas untuk foto selfie &amp; tanda tangan di lokasi, atau cukup <strong>Share Location</strong> ke WhatsApp ini jika berada di kantor.<br /><br />
                            Terima kasih atas kerja samanya! ☀️<br />
                            <em>Manajemen PT Nusantara Mineral Sukses Abadi</em>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1 text-[9.5px] text-stone-400 pt-1 font-mono">
                        <span>{autoReminderHour}</span>
                        <CheckCheck size={13} className="text-teal-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pt-nmsa.com';
                      const link = `${origin}/?view=absen&workerId=W01&quick=true`;
                      const txt = `Halo *${previewWorkerName}*,\n\nPengingat presensi mandiri harian PT NMSA.\nSilakan isi kehadiran sekarang melalui tautan:\n👉 ${link}\n\nTerima kasih! ☀️\n_PT Nusantara Mineral Sukses Abadi_`;
                      handleCopy(txt, 'preview-msg');
                    }}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'preview-msg' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{copiedKey === 'preview-msg' ? 'Teks Tersalin!' : 'Salin Contoh Teks Pengingat'}</span>
                  </button>
                </div>
              </div>

              {/* CARD 4: STATUS EKSEKUSI SERVER & DIAGNOSTIK CRON */}
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-200">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-stone-200 text-stone-800">
                      <Server size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-stone-900">4. Diagnostik Server &amp; Riwayat Pemicu Jadwal (Cron)</h4>
                      <p className="text-[10px] text-stone-500">Status daemon otomatis dan histori eksekusi pengingat</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isTriggeringManualReminder || status !== 'connected'}
                    onClick={handleTriggerManualReminder}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <SendHorizontal size={13} className={isTriggeringManualReminder ? 'animate-spin' : ''} />
                    <span>{isTriggeringManualReminder ? 'Mengirim...' : '⚡ Uji Coba Pengingat Sekarang'}</span>
                  </button>
                </div>

                {/* Manual Trigger Status Result */}
                {manualReminderResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-2xs ${
                    manualReminderResult.success
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-950 font-bold'
                      : 'bg-rose-100 border-rose-300 text-rose-950 font-bold'
                  }`}>
                    <span>{manualReminderResult.message}</span>
                    <button
                      type="button"
                      onClick={() => setManualReminderResult(null)}
                      className="px-2 py-0.5 rounded-md hover:bg-black/10 cursor-pointer font-black"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Stat Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Waktu Server WIB</span>
                    <span className="text-xs font-mono font-bold text-stone-850 block truncate">
                      {automationServerInfo.serverTimeWIB || 'Memuat...'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Ping Cron Terakhir</span>
                    <span className="text-xs font-mono font-bold text-stone-850 block truncate">
                      {automationServerInfo.lastCronPing || 'Belum ada ping'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Status Hari Ini</span>
                    <span className={`text-xs font-mono font-bold block truncate ${
                      automationServerInfo.lastCronSentDate ? 'text-emerald-700' : 'text-stone-600'
                    }`}>
                      {automationServerInfo.lastCronSentDate ? `Sudah Terkirim (${automationServerInfo.lastCronSentDate})` : 'Belum Dieksekusi'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Karyawan Belum Hadir</span>
                    <span className="text-xs font-mono font-black text-rose-700 block">
                      {automationServerInfo.pendingAttendanceCount} Karyawan
                    </span>
                  </div>
                </div>

                {/* Log Status Message */}
                {automationServerInfo.lastCronStatus && (
                  <div className="p-2.5 bg-white rounded-lg border border-stone-200 text-xs flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase bg-stone-100 text-stone-700 px-2 py-0.5 rounded-sm">Log Bot:</span>
                    <span className="text-stone-700 font-mono text-[11px] truncate">{automationServerInfo.lastCronStatus}</span>
                  </div>
                )}

                {/* Cron Webhook URL */}
                <div className="p-2.5 bg-white rounded-lg border border-stone-200 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] text-stone-500 font-bold block uppercase">URL Webhook Cron Pengingat (External Pinger):</span>
                    <span className="text-[11px] font-mono text-stone-700 truncate select-all block">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/cron-reminder` : '/api/cron-reminder'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const url = typeof window !== 'undefined' ? `${window.location.origin}/api/cron-reminder` : '';
                      handleCopy(url, 'cron-url');
                    }}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'cron-url' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    <span>Salin</span>
                  </button>
                </div>
              </div>

              {/* SAVE ACTION BAR */}
              <div className="pt-2 sticky bottom-0 bg-white/95 backdrop-blur-xs py-2 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Feedback message */}
                <div className="text-xs min-h-[24px] flex items-center">
                  {automationSaveMsg && (
                    <div className={`p-2 rounded-lg text-xs font-bold flex items-center gap-2 ${
                      automationSaveMsg.success ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}>
                      {automationSaveMsg.success ? <CheckCircle2 size={14} className="text-emerald-700" /> : <AlertCircle size={14} className="text-rose-700" />}
                      <span>{automationSaveMsg.text}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={fetchAutomationSettings}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} />
                    <span>Muat Ulang</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingAutomation}
                    onClick={handleSaveAutomationSettings}
                    className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20"
                  >
                    <Check size={15} className={isSavingAutomation ? 'animate-spin' : ''} />
                    <span>{isSavingAutomation ? 'Menyimpan Pengaturan...' : '💾 Simpan Pengaturan Pesan Otomatis'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: KEEP-ALIVE 24/7 & UPTIMEROBOT GUIDE */}
          {activeTab === 'uptime' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-gradient-to-r from-emerald-950 to-teal-900 text-white rounded-xl shadow-md border border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center shrink-0">
                      <Activity size={20} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">
                        Keep-Alive 24/7 &amp; Bebas Scan Selamanya
                      </h3>
                      <p className="text-[11px] text-emerald-100/80">
                        Menjaga server tetap aktif dan memulihkan sesi WhatsApp otomatis tanpa perlu scan ulang.
                      </p>
                    </div>
                  </div>

                  <a
                    href="https://uptimerobot.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-stone-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0"
                  >
                    <span>UptimeRobot.com</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* URL Health Check Box */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-1.5 font-mono">
                    <Radio size={14} className="text-emerald-600" />
                    URL Health Check (Salin untuk UptimeRobot):
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">GET</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={healthUrl}
                    className="flex-1 bg-white border border-stone-300 rounded-lg px-3 py-1.5 font-mono text-xs text-stone-850 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(healthUrl, 'health-url')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                      copiedKey === 'health-url'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-900 hover:bg-stone-800 text-white'
                    }`}
                  >
                    {copiedKey === 'health-url' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedKey === 'health-url' ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* Status Pemantauan & Test Live */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-stone-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <span className="font-bold text-stone-900 flex items-center gap-1.5 font-mono">
                    <Clock size={13} className="text-emerald-600" />
                    Metrik Server:
                  </span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between border-b border-stone-100 pb-1">
                      <span className="text-stone-500">Uptime Server:</span>
                      <span className="font-mono font-bold text-stone-850">
                        {keepAliveStats?.uptimeSeconds
                          ? `${Math.floor(keepAliveStats.uptimeSeconds / 3600)}j ${Math.floor((keepAliveStats.uptimeSeconds % 3600) / 60)}m`
                          : 'Aktif'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-stone-100 pb-1">
                      <span className="text-stone-500">Total Ping Masuk:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {keepAliveStats?.totalPings ?? 0} kali
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Ping Terakhir:</span>
                      <span className="font-mono text-stone-850">
                        {keepAliveStats?.lastPing
                          ? new Date(keepAliveStats.lastPing).toLocaleTimeString('id-ID')
                          : 'Menunggu'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5 font-mono">
                      <Zap size={13} className="text-amber-500" />
                      Uji Ping Sekarang:
                    </span>
                    <p className="text-[11px] text-stone-600 mt-1">
                      Cek respon server secara langsung dari browser Anda.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestPing}
                      disabled={isTestingPing}
                      className="w-full py-1.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={13} className={isTestingPing ? 'animate-spin' : ''} />
                      <span>{isTestingPing ? 'Menguji...' : 'Uji Ping Server'}</span>
                    </button>
                    {pingTestResult && (
                      <p className={`text-[10.5px] mt-1.5 font-mono ${pingTestResult.success ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {pingTestResult.success ? `✓ Sukses (${pingTestResult.latencyMs}ms)` : `✗ Gagal: ${safeString(pingTestResult.error)}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KEAMANAN & OTORISASI */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Lock size={14} className="text-emerald-700" />
                  Privasi &amp; Akses Database Voucher:
                </span>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Batasi siapa saja yang berhak meminta data transaksi atau status bayar keuangan melalui WhatsApp.
                </p>
              </div>

              <form onSubmit={handleSaveSecurity} className="space-y-3">
                {/* Mode Seleksi */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className={`p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                    privacyMode === 'whitelist' ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-bold' : 'border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="privacyMode"
                      value="whitelist"
                      checked={privacyMode === 'whitelist'}
                      onChange={() => setPrivacyMode('whitelist')}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <UserCheck size={14} className="text-emerald-600" />
                      <span>Whitelist Nomor</span>
                    </div>
                    <p className="text-[10px] font-normal text-stone-500">Hanya nomor terdaftar</p>
                  </label>

                  <label className={`p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                    privacyMode === 'pin' ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-bold' : 'border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="privacyMode"
                      value="pin"
                      checked={privacyMode === 'pin'}
                      onChange={() => setPrivacyMode('pin')}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Key size={14} className="text-amber-600" />
                      <span>Gunakan PIN Rahasia</span>
                    </div>
                    <p className="text-[10px] font-normal text-stone-500">Ketik PIN saat chat</p>
                  </label>

                  <label className={`p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                    privacyMode === 'public' ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-bold' : 'border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="privacyMode"
                      value="public"
                      checked={privacyMode === 'public'}
                      onChange={() => setPrivacyMode('public')}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe size={14} className="text-teal-600" />
                      <span>Publik (Semua)</span>
                    </div>
                    <p className="text-[10px] font-normal text-stone-500">Bebas diakses</p>
                  </label>
                </div>

                {/* Whitelist Number List */}
                {privacyMode === 'whitelist' && (
                  <div className="space-y-2 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900">Daftar Nomor Terotorisasi:</span>
                      {connectedUser?.id && (
                        <button
                          type="button"
                          onClick={handleQuickAddConnectedPhone}
                          className="text-[10.5px] text-emerald-700 font-bold hover:underline cursor-pointer"
                        >
                          + Tambah Nomor Admin ({connectedUser?.id?.split('@')[0]})
                        </button>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Contoh: 08123456789"
                        value={newPhoneInput}
                        onChange={e => setNewPhoneInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddAllowedPhone}
                        className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition cursor-pointer"
                      >
                        Tambah
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {allowedPhones.map(phone => (
                        <span key={phone} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-stone-300 rounded-lg text-[11px] font-mono">
                          <span>{phone}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAllowedPhone(phone)}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {allowedPhones.length === 0 && (
                        <span className="text-[11px] text-stone-400 italic">Belum ada nomor didaftarkan.</span>
                      )}
                    </div>
                  </div>
                )}

                {/* PIN Settings */}
                {privacyMode === 'pin' && (
                  <div className="space-y-1.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <label className="block text-xs font-bold text-stone-900">PIN Rahasia:</label>
                    <input
                      type="text"
                      value={securityPin}
                      onChange={e => setSecurityPin(e.target.value)}
                      className="w-40 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold tracking-widest"
                      maxLength={8}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="submit"
                    disabled={isSavingSecurity}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                  >
                    {isSavingSecurity ? 'Menyimpan...' : 'Simpan Pengaturan'}
                  </button>
                  {securityStatusMsg && (
                    <span className={`text-[11px] ${securityStatusMsg.success ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                      {safeString(securityStatusMsg.text)}
                    </span>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: BROADCAST & KIRIM LINK ABSEN */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-xs">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <CalendarCheck size={14} className="text-emerald-700" />
                  Kirim Notifikasi &amp; Link Absen ke Karyawan:
                </span>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Kirim pesan link presensi mandiri secara otomatis atau manual langsung melalui bot WhatsApp yang tertaut.
                </p>
              </div>

              {/* Broadcast Action Card */}
              <div className="p-3.5 border border-stone-200 rounded-xl bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900">Kirim Link Absensi ke Seluruh Karyawan Belum Hadir</span>
                  <button
                    type="button"
                    onClick={handleTriggerBroadcastAbsensi}
                    disabled={isTriggeringCron || status !== 'connected'}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <SendHorizontal size={13} className={isTriggeringCron ? 'animate-spin' : ''} />
                    <span>{isTriggeringCron ? 'Mengirim...' : 'Kirim Sekarang'}</span>
                  </button>
                </div>

                {cronResult && (
                  <p className={`text-[11px] ${cronResult.success ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                    {safeString(cronResult.message)}
                  </p>
                )}
              </div>

              {/* Kirim Link Absensi Uang Makan Harian (Personal & Bot) */}
              <div className="p-4 border border-emerald-300 rounded-xl bg-emerald-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <FileCheck size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">Link Absensi &amp; Uang Makan Harian</span>
                      <span className="text-[10.5px] text-emerald-800">Kirim tautan presensi langsung ke karyawan atau grup WhatsApp</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                    Aktif
                  </span>
                </div>

                {/* Absensi Link preview & copy */}
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-stone-700 truncate select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/?view=absen` : '/?view=absen'}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const link = typeof window !== 'undefined' ? `${window.location.origin}/?view=absen` : '';
                      handleCopy(link, 'absensi-link');
                    }}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'absensi-link' ? <Check size={12} /> : <Copy size={12} />}
                    <span>Salin Link</span>
                  </button>
                </div>

                {/* Form Kirim Link ke WhatsApp Pribadi Karyawan */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-bold text-stone-800 block">Kirim Pesan Absensi Uang Makan ke Nomor Tertentu:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Nomor HP (0812...)"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      className="px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-mono bg-white"
                    />
                    <div className="sm:col-span-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const link = typeof window !== 'undefined' ? `${window.location.origin}/?view=absen` : '';
                          const message = `Halo Rekan PT NMSA,\n\nSilakan mengisi presensi kehadiran dan klaim uang makan harian Anda hari ini melalui tautan resmi berikut:\n👉 ${link}\n\nMohon absen tepat waktu sebelum batas operasional. Terima kasih! ☀️🚀\n_PT Nusantara Mineral Sukses Abadi_`;
                          let cleanPhone = testPhone.replace(/[^0-9]/g, '');
                          if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
                          else if (cleanPhone.startsWith('8')) cleanPhone = '62' + cleanPhone;
                          
                          const target = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;
                          window.open(target, '_blank');
                        }}
                        className="flex-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <ExternalLink size={13} />
                        <span>Kirim via WhatsApp Pribadi (wa.me)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const link = typeof window !== 'undefined' ? `${window.location.origin}/?view=absen` : '';
                          const message = `Halo Rekan PT NMSA,\n\nSilakan mengisi presensi kehadiran dan klaim uang makan harian Anda hari ini melalui tautan resmi berikut:\n👉 ${link}\n\nMohon absen tepat waktu sebelum batas operasional. Terima kasih! ☀️🚀\n_PT Nusantara Mineral Sukses Abadi_`;
                          handleCopy(message, 'format-absen');
                        }}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                        title="Salin template pesan lengkap"
                      >
                        {copiedKey === 'format-absen' ? <Check size={13} /> : <Copy size={13} />}
                        <span>Salin Pesan</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Single Test Message */}
              <div className="p-3.5 border border-stone-200 rounded-xl bg-white space-y-2.5">
                <span className="text-xs font-bold text-stone-900 block">Kirim Pesan Kustom via Bot Server:</span>
                <form onSubmit={handleSendTestMessage} className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Nomor HP tujuan (08...)"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      className="w-48 px-3 py-1.5 border border-stone-300 rounded-lg text-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Tulis pesan uji coba..."
                      value={testMessage}
                      onChange={e => setTestMessage(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isSendingTest || !testPhone.trim() || status !== 'connected'}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      {isSendingTest ? 'Mengirim...' : 'Kirim Uji'}
                    </button>
                  </div>
                  {sendTestStatus && (
                    <p className={`text-[11px] ${sendTestStatus.success ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                      {safeString(sendTestStatus.message)}
                    </p>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: UJI CHAT AI TRANSAKSI */}
          {activeTab === 'test' && (
            <div className="space-y-3">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500" />
                  Simulasi Jawaban Asisten AI Keuangan:
                </span>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Coba ajukan pertanyaan transaksi voucher atau status pembayaran di bawah ini seperti chat di WhatsApp.
                </p>
              </div>

              {/* Chat Message Box */}
              <div className="h-60 overflow-y-auto p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5 font-sans text-xs">
                {testMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-2.5 rounded-xl whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-700 text-white rounded-br-xs'
                        : 'bg-white border border-stone-200 text-stone-900 rounded-bl-xs shadow-2xs'
                    }`}>
                      <p className="text-[11.5px]">{msg.text}</p>
                      <span className={`text-[9.5px] block mt-1 text-right ${msg.role === 'user' ? 'text-emerald-200' : 'text-stone-400'}`}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                ))}
                {isAiReplying && (
                  <div className="flex justify-start">
                    <div className="p-2.5 bg-white border border-stone-200 rounded-xl text-stone-400 text-xs flex items-center gap-1.5">
                      <RefreshCw size={13} className="animate-spin text-emerald-600" />
                      <span>AI sedang mencari data di Firestore...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Prompts */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSendTestQuery(undefined, 'Voucher apa saja yang belum dibayar?')}
                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg shrink-0 transition"
                >
                  Belum Dibayar?
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTestQuery(undefined, 'Cek voucher BBM kapal')}
                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg shrink-0 transition"
                >
                  Cek BBM Kapal
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTestQuery(undefined, 'Total pengeluaran bulan ini berapa?')}
                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg shrink-0 transition"
                >
                  Total Pengeluaran
                </button>
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendTestQuery} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Ketik pertanyaan transaksi di sini..."
                  value={testQuery}
                  onChange={e => setTestQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-xs"
                />
                <button
                  type="submit"
                  disabled={!testQuery.trim() || isAiReplying}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                >
                  <Send size={13} />
                  <span>Kirim</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 6: WEBHOOK */}
          {activeTab === 'webhook' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <Globe size={14} className="text-amber-700" />
                  Integrasi Webhook Fonnte &amp; Make.com:
                </span>
                <p className="text-[11px] leading-relaxed">
                  Jika menggunakan gateway pihak ketiga seperti Fonnte atau Make.com, cukup tempel link Webhook di bawah ini.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-stone-900">Universal WhatsApp Webhook:</span>
                    <span className="text-[9.5px] font-mono font-bold px-1.5 bg-emerald-100 text-emerald-800 rounded">POST</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-2.5 py-1 bg-white border border-stone-300 rounded-lg text-[11px] font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(webhookUrl, 'universal')}
                      className="px-2.5 py-1 bg-stone-900 text-white rounded-lg text-[11px] font-bold"
                    >
                      {copiedKey === 'universal' ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-stone-900">Fonnte Webhook URL:</span>
                    <span className="text-[9.5px] font-mono font-bold px-1.5 bg-teal-100 text-teal-800 rounded">POST</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={fonnteWebhookUrl}
                      className="flex-1 px-2.5 py-1 bg-white border border-stone-300 rounded-lg text-[11px] font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(fonnteWebhookUrl, 'fonnte')}
                      className="px-2.5 py-1 bg-stone-900 text-white rounded-lg text-[11px] font-bold"
                    >
                      {copiedKey === 'fonnte' ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: SERVER BACKEND CONFIG */}
          {activeTab === 'server' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl text-xs space-y-1.5">
                <span className="font-bold text-teal-950 flex items-center gap-1.5">
                  <Server size={15} className="text-teal-700" />
                  Koneksi Server Backend WhatsApp (24/7 Persistent):
                </span>
                <p className="text-[11px] text-teal-900 leading-relaxed">
                  WhatsApp Bot membutuhkan server Node.js yang berjalan terus-menerus (seperti di <strong>Render</strong> atau <strong>Railway</strong>) agar koneksi WebSocket WhatsApp tidak putus. Jika aplikasi Anda di-deploy di <strong>Vercel</strong>, sambungkan ke URL server Render Anda di bawah ini!
                </p>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-900 mb-1">
                    URL Server Backend (Render / Railway / VPS):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: https://aplikasi-perusahaan-nmsa.onrender.com (atau kosongkan untuk /api asal)"
                    value={backendUrlInput}
                    onChange={e => setBackendUrlInput(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs font-mono"
                  />
                  <p className="text-[10.5px] text-stone-500 mt-1">
                    Kosongkan jika server backend berjalan di domain yang sama (misal port 3000 atau dev server).
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSaveBackendUrl}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                  >
                    Simpan &amp; Terapkan
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBackendUrlInput('');
                      setBackendBaseUrl('');
                      fetchStatus();
                    }}
                    className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-bold transition border border-stone-300"
                  >
                    Gunakan Asal (/api Default)
                  </button>

                  <button
                    type="button"
                    onClick={handleTestBackendConnection}
                    disabled={isTestingServer}
                    className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                  >
                    <RefreshCw size={13} className={isTestingServer ? 'animate-spin' : ''} />
                    <span>Tes Koneksi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBackendUrlInput('');
                      setBackendBaseUrl('');
                      fetchStatus();
                    }}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium transition"
                  >
                    Reset ke Asal (/api)
                  </button>
                </div>

                {serverTestStatus && (
                  <p className={`text-xs font-mono ${serverTestStatus.success ? 'text-emerald-700 font-bold' : 'text-rose-600'}`}>
                    {safeString(serverTestStatus.message)}
                  </p>
                )}
              </div>

              {/* Quick 2-Minute Deployment Guide */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-2 text-xs text-stone-700">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-500" />
                  Panduan Cepat Deploy Backend ke Render (Gratis 24 Jam):
                </span>
                <ol className="list-decimal list-inside space-y-1 text-[11px]">
                  <li>Buka <strong>dashboard.render.com</strong> &gt; Pilih <strong>New Web Service</strong></li>
                  <li>Hubungkan dengan repository GitHub aplikasi ini</li>
                  <li>Build Command: <code className="bg-stone-200 px-1 py-0.5 rounded text-[10px]">npm install &amp;&amp; npm run build</code></li>
                  <li>Start Command: <code className="bg-stone-200 px-1 py-0.5 rounded text-[10px]">npm start</code></li>
                  <li>Salin URL dari Render (misal: <code className="bg-stone-200 px-1 py-0.5 rounded text-[10px]">https://xxx.onrender.com</code>) dan tempel di kolom atas!</li>
                </ol>
              </div>
            </div>
          )}

        </div>

        {/* Footer - Compact */}
        <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
            <span className="font-mono text-[10.5px]">
              Status: <strong>{status.toUpperCase()}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
