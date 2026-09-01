import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { Submission } from '../types';

interface WhatsAppAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions?: Submission[];
}

export const WhatsAppAiModal: React.FC<WhatsAppAiModalProps> = ({ isOpen, onClose, submissions = [] }) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'security' | 'attendance' | 'test' | 'webhook'>('connect');
  
  // Status states
  const [status, setStatus] = useState<string>('connecting');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectedUser, setConnectedUser] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Pairing Code state
  const [pairingPhone, setPairingPhone] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState<boolean>(false);

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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${baseUrl}/api/whatsapp-webhook`;
  const fonnteWebhookUrl = `${baseUrl}/api/fonnte-webhook`;
  const dataApiUrl = `${baseUrl}/api/data`;

  // Fetch WhatsApp connection status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/wa/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status || 'disconnected');
        setQrCode(data.qr || null);
        setConnectedUser(data.user || null);
        setErrorMessage(data.error || null);
      }
    } catch (err) {
      console.warn('Error fetching WA status:', err);
    }
  };

  // Fetch security settings
  const fetchSecuritySettings = async () => {
    try {
      const res = await fetch('/api/wa/security-settings');
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
      fetchStatus();
      fetchSecuritySettings();
      const interval = setInterval(fetchStatus, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Sync submissions to server whenever modal opens so AI has latest state
  useEffect(() => {
    if (isOpen && submissions.length > 0) {
      fetch('/api/sync-submissions', {
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
    if (!window.confirm('Putuskan koneksi WhatsApp saat ini? Sesi akan dibersihkan untuk seluruh modul (Absensi & AI Bisnis).')) {
      return;
    }
    setIsLoading(true);
    try {
      await fetch('/api/wa/disconnect', { method: 'POST' });
      await fetchStatus();
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
      const res = await fetch('/api/wa/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pairingPhone.trim() })
      });
      const data = await res.json();
      if (res.ok && data.code) {
        setPairingCode(data.code);
      } else {
        setErrorMessage(data.error || 'Gagal meminta Kode Pairing.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi gangguan jaringan.');
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
      const res = await fetch('/api/wa/security-settings', {
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
      const data = await res.json();
      if (data.success) {
        setSecurityStatusMsg({ success: true, text: 'Pengaturan keamanan dan otorisasi WhatsApp AI berhasil disimpan!' });
      } else {
        setSecurityStatusMsg({ success: false, text: data.error || 'Gagal menyimpan pengaturan.' });
      }
    } catch (err: any) {
      setSecurityStatusMsg({ success: false, text: err.message || 'Kesalahan jaringan.' });
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
      const res = await fetch('/api/wa/send-test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setSendTestStatus({ success: true, message: 'Pesan berhasil terkirim langsung ke nomor WhatsApp penerima!' });
      } else {
        setSendTestStatus({ success: false, message: data.error || 'Gagal mengirim pesan WhatsApp.' });
      }
    } catch (err: any) {
      setSendTestStatus({ success: false, message: err.message || 'Kesalahan koneksi.' });
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
      const res = await fetch('/api/cron/late-reminder?force=true&markSent=false');
      const data = await res.json();
      if (data.success) {
        setCronResult({ success: true, message: data.message || 'Pengiriman link absensi ke karyawan berhasil diproses!' });
      } else {
        setCronResult({ success: false, message: data.message || data.error || 'Gagal memproses pengiriman.' });
      }
    } catch (err: any) {
      setCronResult({ success: false, message: err.message || 'Terjadi kesalahan jaringan.' });
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
      const res = await fetch('/api/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sender: 'Admin UI', senderPhone: 'admin_ui' })
      });
      const data = await res.json();
      if (data.reply) {
        setTestMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: data.reply,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(data.error || 'Gagal memproses');
      }
    } catch (err: any) {
      setTestMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ *Error*: ${err.message || 'Gagal terhubung ke AI server'}`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAiReplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between border-b border-emerald-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-2xl text-emerald-300 border border-emerald-400/30">
              <MessageSquare size={24} className="text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  Pusat Integrasi WhatsApp Terpadu PT NMSA
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                  1x Penautan untuk Semua
                </span>
              </div>
              <p className="text-xs text-emerald-100/80 font-mono">
                1x tautan mengaktifkan Pengiriman Link Absensi, Share Location, & AI Voucher Transaksi Otomatis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-emerald-100 hover:text-white hover:bg-emerald-700/50 rounded-xl transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Unified Service Notice Banner */}
        <div className="bg-emerald-50/90 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
            <span className="font-semibold">
              <strong>Satu Sesi Terpadu:</strong> Penautan WhatsApp di sini otomatis terhubung dengan menu <strong>Absensi Harian</strong>, <strong>Otorisasi Privasi Keuangan</strong>, dan <strong>AI Voucher Transaksi</strong>.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
            <span className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-xs animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-bold">{status === 'connected' ? 'TERHUBUNG (24/7)' : 'BELUM TERTAUT'}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-6 pt-2 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'connect'
                ? 'bg-white border-stone-200 text-emerald-800 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <QrCode size={15} className={activeTab === 'connect' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>1. Penautan WhatsApp (QR / Kode)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'security'
                ? 'bg-white border-stone-200 text-emerald-800 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Lock size={15} className={activeTab === 'security' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>2. Keamanan & Otorisasi Voucher</span>
            <span className="px-1.5 py-0.2 text-[9px] bg-rose-100 text-rose-800 font-bold rounded">Privasi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'attendance'
                ? 'bg-white border-stone-200 text-emerald-800 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <CalendarCheck size={15} className={activeTab === 'attendance' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>3. Kirim Link Absen & Broadcast</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'test'
                ? 'bg-white border-stone-200 text-emerald-800 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Bot size={15} className={activeTab === 'test' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>4. Uji Chat AI Transaksi & File</span>
            <Sparkles size={12} className="text-amber-500" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x shrink-0 ${
              activeTab === 'webhook'
                ? 'bg-white border-stone-200 text-emerald-800 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Globe size={15} className={activeTab === 'webhook' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>5. Webhook (Make.com / Fonnte)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
          
          {/* TAB 1: CONNECT WHATSAPP DIRECTLY */}
          {activeTab === 'connect' && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                status === 'connected'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : status === 'qr'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-stone-50 border-stone-200 text-stone-850'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                    status === 'connected'
                      ? 'bg-emerald-600 text-white'
                      : status === 'qr'
                      ? 'bg-amber-500 text-white'
                      : 'bg-stone-300 text-stone-700'
                  }`}>
                    {status === 'connected' ? <CheckCircle2 size={20} /> : <QrCode size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm">
                        {status === 'connected' && 'WhatsApp Terhubung & Aktif untuk Seluruh Sistem!'}
                        {status === 'qr' && 'Menunggu Pemindaian QR Code'}
                        {status === 'connecting' && 'Sedang Menginisialisasi Server...'}
                        {status === 'disconnected' && 'WhatsApp Belum Terhubung'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        status === 'connected' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs opacity-80 mt-0.5">
                      {status === 'connected'
                        ? `Terhubung sebagai: ${connectedUser?.name || 'Admin'} (${connectedUser?.id || 'Akun Aktif'}). Otomatis melayani Absensi & AI Bisnis.`
                        : 'Pindai QR code atau gunakan nomor telepon untuk menghubungkan WhatsApp ke seluruh sistem aplikasi.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status === 'connected' ? (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={isLoading}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Power size={14} />
                      <span>Putuskan Sesi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={fetchStatus}
                      className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw size={14} className={status === 'connecting' ? 'animate-spin' : ''} />
                      <span>Segarkan Status</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Automatic Workflow Explanation Guide */}
              <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-teal-950 font-extrabold text-xs uppercase tracking-wider">
                  <Sparkles size={16} className="text-teal-700" />
                  <span>Bagaimana Cara Kerja Otomatis Setelah Anda Scan QR Code?</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-teal-950">
                  <div className="bg-white p-3 rounded-xl border border-teal-100 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold inline-flex items-center justify-center text-[10px]">1</span>
                    <p className="font-bold text-stone-900">Langsung Aktif 24 Jam</p>
                    <p className="text-[11px] text-stone-600">
                      Setelah QR code di-scan, WhatsApp langsung otomatis standby menerima pertanyaan transaksi kapan saja tanpa perlu login manual lagi.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-teal-100 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold inline-flex items-center justify-center text-[10px]">2</span>
                    <p className="font-bold text-stone-900">Paham Rincian & Status Bayar</p>
                    <p className="text-[11px] text-stone-600">
                      AI hafal status voucher (<strong>SUDAH DIBAYAR</strong> atau <strong>BELUM DIBAYAR</strong>), nama penerima, tanggal, dan rincian biaya.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-teal-100 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold inline-flex items-center justify-center text-[10px]">3</span>
                    <p className="font-bold text-stone-900">Lampiran 1 File Google Drive</p>
                    <p className="text-[11px] text-stone-600">
                      Jika diminta berkas/file, AI langsung memberikan link dokumen lengkap dari Google Drive dalam pesan WhatsApp yang sama.
                    </p>
                  </div>
                </div>
              </div>

              {/* QR Code & Pairing Section */}
              {status !== 'connected' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Option A: Scan QR Code */}
                  <div className="p-5 rounded-2xl border border-stone-200 bg-stone-50/50 flex flex-col items-center text-center space-y-4">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-stone-900 uppercase tracking-wider">
                      <QrCode size={16} className="text-emerald-600" />
                      <span>Metode 1: Scan QR Code (Paling Cepat)</span>
                    </div>

                    <div className="w-56 h-56 bg-white p-3 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-center">
                      {qrCode ? (
                        <img 
                          src={qrCode} 
                          alt="WhatsApp Bot QR Code" 
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-stone-400 text-xs">
                          <RefreshCw size={24} className="animate-spin text-emerald-600" />
                          <span>Menyiapkan QR Code...</span>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-stone-600 space-y-1 text-left w-full bg-white p-3 rounded-xl border border-stone-200">
                      <p className="font-bold text-stone-900">Cara Scan:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                        <li>Buka aplikasi WhatsApp / WhatsApp Business di HP</li>
                        <li>Ketuk menu Titik Tiga (⋮) atau Pengaturan ⚙️</li>
                        <li>Pilih <strong>Perangkat Tertaut (Linked Devices)</strong></li>
                        <li>Ketuk <strong>Tautkan Perangkat</strong> & scan QR di atas</li>
                      </ol>
                    </div>
                  </div>

                  {/* Option B: Link with Phone Number (Pairing Code) */}
                  <div className="p-5 rounded-2xl border border-stone-200 bg-stone-50/50 flex flex-col space-y-4">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-stone-900 uppercase tracking-wider">
                      <Smartphone size={16} className="text-emerald-600" />
                      <span>Metode 2: Tautkan dengan Nomor HP (Pairing Code)</span>
                    </div>

                    <p className="text-xs text-stone-600">
                      Jika Anda membuka aplikasi ini dari HP yang sama dan tidak bisa scan QR, gunakan kode pairing 8 digit.
                    </p>

                    <form onSubmit={handleRequestPairingCode} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-mono font-bold text-stone-700 mb-1 uppercase">
                          Nomor WhatsApp Anda:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Contoh: 08123456789 atau 628123456789"
                            value={pairingPhone}
                            onChange={e => setPairingPhone(e.target.value)}
                            className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                          />
                          <button
                            type="submit"
                            disabled={pairingLoading || !pairingPhone.trim()}
                            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                          >
                            {pairingLoading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                            <span>Dapatkan Kode</span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {pairingCode && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2 animate-in zoom-in-95">
                        <span className="text-[11px] font-mono font-bold text-emerald-800 uppercase tracking-wider block">
                          Kode Pairing Anda:
                        </span>
                        <div className="text-2xl font-black font-mono tracking-widest text-emerald-950 bg-white py-2 px-4 rounded-lg border border-emerald-300 inline-block shadow-inner">
                          {pairingCode}
                        </div>
                        <p className="text-[11px] text-emerald-800">
                          Buka notifikasi WhatsApp di HP Anda atau pilih &quot;Tautkan dengan nomor telepon&quot; lalu masukkan kode 8 digit di atas.
                        </p>
                      </div>
                    )}

                    {errorMessage && (
                      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                        <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SECURITY & PRIVACY SETTINGS FOR VOUCHERS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Security Header Banner */}
              <div className="p-4 bg-stone-900 text-white rounded-2xl flex items-start justify-between gap-3 shadow-md">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white">
                      Pengaturan Keamanan & Privasi Data Voucher Keuangan
                    </h3>
                    <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                      Atur siapa saja yang berhak menanyakan rincian voucher transaksi, status pembayaran, kas kecil, dan tautan file Google Drive melalui WhatsApp agar data keuangan perusahaan tidak bocor ke sembarang orang.
                    </p>
                  </div>
                </div>
              </div>

              {securityStatusMsg && (
                <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
                  securityStatusMsg.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {securityStatusMsg.success ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-rose-600 shrink-0" />}
                  <span className="font-medium">{securityStatusMsg.text}</span>
                </div>
              )}

              {/* Mode Selection */}
              <div className="border border-stone-200 rounded-2xl p-5 bg-white space-y-4">
                <h4 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span>1. Pilih Mode Otorisasi Akses Voucher:</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Mode 1: Whitelist (Recommended) */}
                  <label className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    privacyMode === 'whitelist'
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="privacyMode"
                          value="whitelist"
                          checked={privacyMode === 'whitelist'}
                          onChange={() => setPrivacyMode('whitelist')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-extrabold text-xs text-stone-900">🛡️ Hanya Nomor Terdaftar</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-900 text-[9px] font-bold rounded">Direkomendasikan</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      Hanya nomor WhatsApp yang didaftarkan di bawah (Direksi, Finance, Manager) yang diizinkan melihat rincian voucher & file Google Drive.
                    </p>
                  </label>

                  {/* Mode 2: PIN Protection */}
                  <label className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    privacyMode === 'pin'
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="privacyMode"
                          value="pin"
                          checked={privacyMode === 'pin'}
                          onChange={() => setPrivacyMode('pin')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-extrabold text-xs text-stone-900">🔑 Proteksi PIN Keamanan</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-bold rounded">PIN Wajib</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      Penanya wajib menyertakan PIN keamanan (contoh: <code>#PIN1234</code>) di dalam pesan chat WhatsApp untuk membuka rincian voucher.
                    </p>
                  </label>

                  {/* Mode 3: Public (Open) */}
                  <label className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    privacyMode === 'public'
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="privacyMode"
                          value="public"
                          checked={privacyMode === 'public'}
                          onChange={() => setPrivacyMode('public')}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-extrabold text-xs text-stone-900">🌐 Terbuka (Publik)</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[9px] font-bold rounded">Tidak Aman</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      Siapa saja yang mengirim pesan chat ke nomor WhatsApp dapat menanyakan rincian data voucher dan keuangan perusahaan.
                    </p>
                  </label>
                </div>
              </div>

              {/* Whitelist Manager */}
              {privacyMode === 'whitelist' && (
                <div className="border border-stone-200 rounded-2xl p-5 bg-white space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                        <UserCheck size={16} className="text-emerald-600" />
                        <span>2. Daftar Nomor WhatsApp yang Diizinkan (Whitelist Otorisasi):</span>
                      </h4>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Karyawan dengan role Admin/Finance otomatis memiliki izin akses. Tambahkan nomor HP lain di bawah:
                      </p>
                    </div>

                    {connectedUser?.id && (
                      <button
                        type="button"
                        onClick={handleQuickAddConnectedPhone}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus size={13} />
                        <span>+ Tambah Nomor WA Terhubung</span>
                      </button>
                    )}
                  </div>

                  {/* Add Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Masukkan nomor HP (contoh: 08123456789 atau 628123456789)"
                      value={newPhoneInput}
                      onChange={e => setNewPhoneInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAllowedPhone(); } }}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddAllowedPhone}
                      disabled={!newPhoneInput.trim()}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                    >
                      <Plus size={14} />
                      <span>Tambah Nomor</span>
                    </button>
                  </div>

                  {/* Allowed Phones List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {allowedPhones.length === 0 ? (
                      <div className="p-4 rounded-xl bg-stone-50 border border-dashed border-stone-200 text-center text-xs text-stone-500">
                        Belum ada nomor khusus yang didaftarkan. Tambahkan nomor Direktur/Finance di atas.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {allowedPhones.map((phone, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                            <span className="font-mono font-bold text-stone-800 flex items-center gap-1.5">
                              <Smartphone size={13} className="text-emerald-600" />
                              +{phone}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAllowedPhone(phone)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Hapus nomor dari daftar otorisasi"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PIN Settings */}
              {privacyMode === 'pin' && (
                <div className="border border-stone-200 rounded-2xl p-5 bg-white space-y-3">
                  <h4 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                    <Key size={16} className="text-amber-600" />
                    <span>2. Konfigurasi PIN Otorisasi:</span>
                  </h4>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={securityPin}
                      onChange={e => setSecurityPin(e.target.value)}
                      placeholder="Contoh: 1234"
                      className="px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono font-bold tracking-widest text-center w-36"
                    />
                    <span className="text-xs text-stone-500">
                      Pengguna harus menyertakan <code>#PIN{securityPin || '1234'}</code> di akhir chat WhatsApp untuk mendapatkan jawaban voucher.
                    </span>
                  </div>
                </div>
              )}

              {/* File Attachment Toggle & Rejection Message */}
              <div className="border border-stone-200 rounded-2xl p-5 bg-white space-y-4">
                <h4 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <FileCheck size={16} className="text-teal-600" />
                  <span>3. Pengaturan Balasan & Lampiran Google Drive:</span>
                </h4>

                <label className="flex items-start gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDriveLinks}
                    onChange={e => setEnableDriveLinks(e.target.checked)}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 rounded"
                  />
                  <div>
                    <span className="font-bold text-xs text-stone-900 block">
                      Sertakan Tautan Dokumen Lengkap Google Drive (1 File Utuh)
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Jika aktif, AI akan langsung memberikan link download Google Drive pada setiap rincian voucher yang ditanyakan di WhatsApp.
                    </span>
                  </div>
                </label>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Pesan Penolakan Jika Nomor Tidak Terdaftar:
                  </label>
                  <textarea
                    rows={2}
                    value={unauthorizedMessage}
                    onChange={e => setUnauthorizedMessage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-sans"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveSecurity}
                  disabled={isSavingSecurity}
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  {isSavingSecurity ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>Simpan Pengaturan Keamanan</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE & BROADCAST TOOLS */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <CalendarCheck size={16} className="text-emerald-600" />
                    Pengiriman Link Absensi Harian ke Seluruh Karyawan
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Kirim link check-in presensi instan ke seluruh nomor WhatsApp karyawan aktif yang belum absen hari ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerBroadcastAbsensi}
                  disabled={isTriggeringCron || status !== 'connected'}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-3xs shrink-0"
                >
                  {isTriggeringCron ? <RefreshCw size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                  <span>Kirim Link Absensi Sekarang</span>
                </button>
              </div>

              {cronResult && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  cronResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {cronResult.success ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
                  <span>{cronResult.message}</span>
                </div>
              )}

              {/* Single Test Message Box */}
              <div className="border border-stone-200 rounded-2xl p-4 bg-white space-y-4">
                <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-teal-600" />
                  Tes Kirim Pesan WhatsApp ke Nomor Tertentu
                </h4>

                <form onSubmit={handleSendTestMessage} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono font-bold text-stone-700 mb-1 uppercase">
                        Nomor Penerima (WhatsApp):
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: 08123456789 atau 628123456789"
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono font-bold text-stone-700 mb-1 uppercase">
                        Isi Pesan:
                      </label>
                      <input
                        type="text"
                        placeholder="Ketik pesan..."
                        value={testMessage}
                        onChange={e => setTestMessage(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-sans"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-stone-500">
                      Pastikan nomor diawali kode 08xx atau 628xx.
                    </span>
                    <button
                      type="submit"
                      disabled={isSendingTest || !testPhone.trim() || status !== 'connected'}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                    >
                      {isSendingTest ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>Kirim Pesan Uji Coba</span>
                    </button>
                  </div>
                </form>

                {sendTestStatus && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    sendTestStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {sendTestStatus.success ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
                    <span>{sendTestStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: AI SANDBOX TEST (CHAT & GOOGLE DRIVE ATTACHMENTS) */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 text-xs text-stone-600 flex items-center justify-between">
                <div>
                  <p className="font-bold text-stone-900 flex items-center gap-1.5">
                    <Bot size={15} className="text-emerald-600" />
                    Simulasi Chat AI Keuangan & Voucher Transaksi
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Ketik pertanyaan di bawah ini untuk melihat bagaimana WhatsApp AI menjawab rincian voucher, status lunas, dan memberikan link Google Drive.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold rounded-lg border border-emerald-200">
                  {submissions.length} Dokumen Voucher Tersambung
                </span>
              </div>

              {/* Quick Sample Prompts */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold text-stone-500 self-center mr-1">Contoh Cepat:</span>
                {[
                  'Cek voucher HO-2024-001 apakah sudah lunas?',
                  'Ada data transaksi apa saja di bulan Mei?',
                  'Siapa saja karyawan yang sudah absen hari ini?',
                  'Rekap absensi & uang makan karyawan',
                  'Minta file lampiran pengajuan solar pak suryo',
                  'Berapa total voucher yang belum dibayar?'
                ].map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendTestQuery(undefined, prompt)}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-semibold rounded-lg transition cursor-pointer border border-stone-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Window */}
              <div className="bg-stone-900/5 rounded-2xl border border-stone-200 p-4 min-h-[300px] max-h-[380px] overflow-y-auto space-y-3 font-sans">
                {testMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-xs shadow-xs space-y-1 ${
                        msg.role === 'user'
                          ? 'bg-emerald-700 text-white rounded-tr-xs'
                          : 'bg-white text-stone-850 border border-stone-200 rounded-tl-xs'
                      }`}
                    >
                      <div className="whitespace-pre-line leading-relaxed">
                        {msg.text}
                      </div>
                      <div className={`text-[9px] font-mono text-right ${msg.role === 'user' ? 'text-emerald-200' : 'text-stone-400'}`}>
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}
                {isAiReplying && (
                  <div className="flex items-center gap-2 text-xs text-stone-500 p-2">
                    <RefreshCw size={14} className="animate-spin text-emerald-600" />
                    <span>AI sedang mencari transaksi di database & menyiapkan lampiran Google Drive...</span>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={e => handleSendTestQuery(e)} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ketik pertanyaan untuk AI seputar voucher transaksi, status bayar, atau minta file..."
                  value={testQuery}
                  onChange={e => setTestQuery(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-sans shadow-inner"
                />
                <button
                  type="submit"
                  disabled={isAiReplying || !testQuery.trim()}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                >
                  <Send size={14} />
                  <span>Kirim</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: WEBHOOK & MAKE.COM / FONNTE API */}
          {activeTab === 'webhook' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles size={15} className="text-amber-700" />
                  Solusi Bebas Ribet untuk Make.com & Fonnte:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Anda tidak perlu lagi pusing menyusun format JSON manual, API key Gemini, atau membagi-bagi string di Make.com. Cukup arahkan Webhook Fonnte atau Make.com ke URL Webhook di bawah ini. Server backend ini otomatis membaca seluruh basis data Firestore dan langsung mengembalikan balasan cerdas!
                </p>
              </div>

              {/* Webhook URLs */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono font-bold text-stone-700 uppercase tracking-wider">
                  Link Endpoint Webhook Resmi Aplikasi:
                </h4>

                {/* Main Universal Webhook */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <Globe size={14} className="text-emerald-600" />
                      Universal WhatsApp Webhook (Make.com / Webhook Langsung)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                      POST
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono text-stone-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(webhookUrl, 'universal')}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'universal' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === 'universal' ? 'Tersalin' : 'Salin URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Fonnte Direct Webhook */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-teal-600" />
                      Fonnte Webhook URL (Langsung Tempel di Dashboard Fonnte)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">
                      POST
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={fonnteWebhookUrl}
                      className="flex-1 px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono text-stone-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(fonnteWebhookUrl, 'fonnte')}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'fonnte' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === 'fonnte' ? 'Tersalin' : 'Salin URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Data API (Clean JSON) */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <Database size={14} className="text-amber-600" />
                      Data API (JSON Bersih Semua Voucher & Kas Kecil)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                      GET
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={dataApiUrl}
                      className="flex-1 px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono text-stone-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(dataApiUrl, 'data')}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'data' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === 'data' ? 'Tersalin' : 'Salin URL'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Simple Step by Step for Make.com / Fonnte */}
              <div className="border border-stone-200 rounded-2xl p-4 space-y-3 bg-white">
                <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Cara Pasang di Make.com / Fonnte:
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-stone-600">
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                    <p className="font-bold text-stone-900">Opsi 1: Tempel di Fonnte Langsung</p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px]">
                      <li>Buka dashboard <strong>Fonnte.com</strong> &gt; Menu <strong>Device</strong></li>
                      <li>Klik <strong>Edit</strong> pada nama device WhatsApp Anda</li>
                      <li>Di kolom <strong>Webhook URL</strong>, paste link Fonnte Webhook di atas</li>
                      <li>Klik <strong>Save/Update</strong>. Selesai! Pesan WA akan otomatis dibalas AI NMSA.</li>
                    </ol>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5">
                    <p className="font-bold text-stone-900">Opsi 2: Menggunakan Make.com</p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px]">
                      <li>Modul 1: <strong>Custom Webhook</strong> (menerima pesan WA)</li>
                      <li>Modul 2: <strong>HTTP Make a Request</strong> (POST ke URL Webhook di atas dengan body JSON: {`{"message": 1.pesan, "sender": 1.sender}`})</li>
                      <li>Modul 3: <strong>HTTP Fonnte Send</strong> (mengirim output variabel <code>reply</code> kembali ke WhatsApp)</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
            <span className="font-mono text-[11px]">
              Status Gateway: <strong>{status.toUpperCase()}</strong> (Aktif untuk Absensi + AI Bisnis)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-3xs"
          >
            Tutup Jendela
          </button>
        </div>
      </div>
    </div>
  );
};
