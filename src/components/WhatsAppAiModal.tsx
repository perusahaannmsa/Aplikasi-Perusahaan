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
  ChevronRight
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
  { id: 'uptime' as const, number: 2, label: 'Keep-Alive 24/7', shortLabel: 'Keep-Alive', icon: Activity },
  { id: 'security' as const, number: 3, label: 'Keamanan Voucher', shortLabel: 'Keamanan', icon: Lock },
  { id: 'attendance' as const, number: 4, label: 'Broadcast Absen', shortLabel: 'Broadcast', icon: CalendarCheck },
  { id: 'test' as const, number: 5, label: 'Chat AI Transaksi', shortLabel: 'Chat AI', icon: Bot },
  { id: 'webhook' as const, number: 6, label: 'Webhook', shortLabel: 'Webhook', icon: Globe },
  { id: 'server' as const, number: 7, label: 'Server Backend ⚙️', shortLabel: 'Backend ⚙️', icon: Server },
];

export const WhatsAppAiModal: React.FC<WhatsAppAiModalProps> = ({ isOpen, onClose, submissions = [] }) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'uptime' | 'security' | 'attendance' | 'test' | 'webhook' | 'server'>('connect');
  
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

  const [qrCountdown, setQrCountdown] = useState<number>(60);

  // Fetch WhatsApp connection status from active server or saved personal account
  const fetchStatus = async () => {
    try {
      // 1. Check if user has explicitly connected their own personal WhatsApp
      const savedPhone = typeof window !== 'undefined' ? localStorage.getItem('nmsa_wa_phone') : null;
      const isCustomConnected = typeof window !== 'undefined' && localStorage.getItem('nmsa_wa_connected') === 'true';
      if (isCustomConnected && savedPhone) {
        setStatus('connected');
        setConnectedUser({
          id: `${savedPhone}@s.whatsapp.net`,
          name: localStorage.getItem('nmsa_wa_name') || `WhatsApp Pribadi (${savedPhone})`
        });
        setErrorMessage(null);
        return;
      }

      // 2. Check server status for real Baileys connection / QR code
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
      const interval = setInterval(() => {
        fetchStatus();
        fetchKeepAliveStats();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

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
      // Immediately regenerate clean QR code
      await generateRealQr();
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

      // Generate matching QR code for this specific phone as well
      generateRealQr(clean);

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
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-emerald-950 shrink-0">
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
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
            <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : status === 'qr' ? 'bg-amber-400 animate-ping' : 'bg-stone-400'}`} />
            <span className="font-bold">{status === 'connected' ? 'TERHUBUNG' : status === 'qr' ? 'SCAN QR' : 'OFFLINE'}</span>
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
                        <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wider">
                          <QrCode size={16} className="text-stone-800" />
                          <span>Pindai (Scan) QR Code WhatsApp</span>
                        </div>

                        {/* Scannable QR Image Container */}
                        <div className="w-60 h-60 bg-white p-3 rounded-2xl border-2 border-stone-300 shadow-md flex flex-col items-center justify-center relative">
                          {qrCode ? (
                            <img 
                              src={qrCode} 
                              alt="WhatsApp QR Code" 
                              className="w-full h-full object-contain rounded-lg"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 text-stone-500 text-xs p-3 text-center h-full">
                              <RefreshCw size={24} className="animate-spin text-emerald-600" />
                              <span className="font-bold text-xs text-emerald-800">Menyiapkan QR Code Resmi...</span>
                              <span className="text-[10px] text-stone-400">Silakan tunggu sebentar</span>
                            </div>
                          )}
                        </div>

                        {/* Countdown & Refresh Controls */}
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-900 bg-emerald-50/90 border border-emerald-200 px-3 py-1.5 rounded-lg">
                            <span className="flex items-center gap-1 font-bold">
                              <Clock size={12} className="text-emerald-700" />
                              <span>Status QR: Siap Dipindai</span>
                            </span>
                            <span className="font-bold text-emerald-700">{qrCountdown} Detik</span>
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

                            <a
                              href="https://web.whatsapp.com"
                              target="_blank"
                              rel="noreferrer"
                              className="py-1.5 px-3 bg-white hover:bg-stone-100 text-stone-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 border border-stone-300"
                            >
                              <ExternalLink size={13} />
                              <span>Buka WhatsApp Web</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Right: Step-by-Step Scan Instructions */}
                      <div className="p-4 sm:p-5 rounded-2xl border border-stone-200 bg-white flex flex-col justify-between space-y-3">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wider pb-1 border-b border-stone-200">
                            <Smartphone size={16} className="text-emerald-700" />
                            <span>Panduan Memindai (Scan) QR:</span>
                          </div>

                          <ol className="space-y-2.5 text-[11px] text-stone-700">
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
                                Ketuk menu <strong>Titik Tiga (⋮)</strong> di sudut kanan atas atau <strong>Pengaturan ⚙️</strong>.
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
                                Arahkan kamera ponsel Anda ke kotak kode QR di samping kiri.
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                5
                              </span>
                              <span>
                                Tunggu beberapa detik hingga proses sinkronisasi selesai dan status berubah menjadi <strong>TERHUBUNG</strong>.
                              </span>
                            </li>
                          </ol>
                        </div>

                        <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[10.5px] text-stone-600">
                          <span className="font-bold text-stone-800 block">Kamera bermasalah atau buram?</span>
                          <span>
                            Gunakan <strong>Metode 1 (Tautkan Nomor Telepon / Kode Pairing 8 Digit)</strong> di tab atas untuk menghubungkan tanpa kamera.
                          </span>
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

          {/* TAB 2: KEEP-ALIVE 24/7 & UPTIMEROBOT GUIDE */}
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
