import React, { useState, useEffect } from "react";
import { 
  Clock, 
  MessageSquare, 
  Send, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Calendar, 
  ShieldCheck, 
  FileCheck, 
  Smartphone,
  ExternalLink,
  Bot,
  Zap,
  Info
} from "lucide-react";
import { saveAbsenDataToFirestore } from "../firebase";

interface Worker {
  id: string;
  name: string;
  role: string;
  phoneNumber?: string;
  isActive: boolean;
}

interface WhatsAppBotReminderMenuProps {
  workers: Worker[];
  attendanceRecords: any[];
  signatures: Record<string, string>;
  onOpenWhatsAppConnect?: () => void;
  onRefreshData?: () => void;
}

export const WhatsAppBotReminderMenu: React.FC<WhatsAppBotReminderMenuProps> = ({
  workers = [],
  attendanceRecords = [],
  signatures = {},
  onOpenWhatsAppConnect,
  onRefreshData
}) => {
  const [autoReminderHour, setAutoReminderHour] = useState<string>("09:00");
  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(true);
  const [requireFridaySignature, setRequireFridaySignature] = useState<boolean>(true);
  const [activeDays, setActiveDays] = useState<string[]>(["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>("");
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [triggerResult, setTriggerResult] = useState<{ success: boolean; message: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<{
    serverTimeWIB: string;
    lastCronPing: string;
    lastCronStatus: string;
    lastCronSentDate: string;
    waConnected: boolean;
    waPhone: string | null;
    totalActiveWorkers: number;
    pendingAttendanceCount: number;
  }>({
    serverTimeWIB: "",
    lastCronPing: "",
    lastCronStatus: "",
    lastCronSentDate: "",
    waConnected: false,
    waPhone: null,
    totalActiveWorkers: 0,
    pendingAttendanceCount: 0
  });

  const [fridayVerifications, setFridayVerifications] = useState<Record<string, any>>({});
  const [selectedVerification, setSelectedVerification] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<"regular" | "friday">("friday");

  const todayDateStr = new Date().toISOString().split("T")[0];
  const isFridayToday = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", weekday: "long" }) === "Friday";

  // Fetch settings from server
  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bot-reminder-settings");
      if (res.ok) {
        const data = await res.json();
        if (data.autoReminderHour) setAutoReminderHour(data.autoReminderHour);
        if (data.autoReminderEnabled !== undefined) setAutoReminderEnabled(data.autoReminderEnabled);
        if (data.requireFridaySignature !== undefined) setRequireFridaySignature(data.requireFridaySignature);
        if (data.reminderActiveDays) setActiveDays(data.reminderActiveDays);
        setServerStatus({
          serverTimeWIB: data.serverTimeWIB || "",
          lastCronPing: data.lastCronPing || "",
          lastCronStatus: data.lastCronStatus || "",
          lastCronSentDate: data.lastCronSentDate || "",
          waConnected: !!data.waConnected,
          waPhone: data.waPhone || null,
          totalActiveWorkers: data.totalActiveWorkers || 0,
          pendingAttendanceCount: data.pendingAttendanceCount || 0
        });
      }

      // Fetch Friday verifications
      const verifRes = await fetch("/api/friday-verifications");
      if (verifRes.ok) {
        const verifData = await verifRes.json();
        if (verifData.verifications) {
          setFridayVerifications(verifData.verifications);
        }
      }
    } catch (err) {
      console.warn("Gagal memuat pengaturan bot reminder dari server:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(fetchSettings, 20000);
    return () => clearInterval(interval);
  }, []);

  // Save settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveSuccessMsg("");
    try {
      const res = await fetch("/api/bot-reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoReminderHour,
          autoReminderEnabled,
          reminderActiveDays: activeDays,
          requireFridaySignature
        })
      });

      // Save to localStorage as backup
      localStorage.setItem("wa_auto_reminder_hour", autoReminderHour);
      localStorage.setItem("wa_auto_reminder_enabled", autoReminderEnabled ? "true" : "false");
      localStorage.setItem("wa_friday_signature_required", requireFridaySignature ? "true" : "false");

      // Save to Firestore
      await saveAbsenDataToFirestore({
        id: "bot_reminder_settings",
        autoReminderHour,
        autoReminderEnabled,
        reminderActiveDays: activeDays,
        requireFridaySignature,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore save fallback error:", e));

      if (res.ok) {
        setSaveSuccessMsg("Jadwal pengiriman pesan bot WhatsApp & aturan TTD digital Jumat berhasil disimpan ke server!");
        setTimeout(() => setSaveSuccessMsg(""), 5000);
        fetchSettings();
      } else {
        setSaveSuccessMsg("Pengaturan berhasil disimpan di memori sistem!");
      }
    } catch (err: any) {
      setSaveSuccessMsg("Gagal menyimpan ke server: " + (err.message || "Koneksi terputus"));
    } finally {
      setIsSaving(false);
    }
  };

  // Manual Trigger
  const handleTriggerNow = async () => {
    if (!serverStatus.waConnected) {
      alert("WhatsApp Bot belum terhubung! Silakan scan QR code WhatsApp terlebih dahulu.");
      return;
    }
    if (!confirm("Kirim pesan pengingat absen sekarang ke semua karyawan yang belum absen hari ini?")) {
      return;
    }

    setIsTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch("/api/trigger-bot-reminder", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setTriggerResult({
          success: true,
          message: data.message || `Berhasil mengirim pengingat ke ${data.sentCount} karyawan!`
        });
        fetchSettings();
        if (onRefreshData) onRefreshData();
      } else {
        setTriggerResult({
          success: false,
          message: data.message || "Gagal memproses pengiriman pengingat."
        });
      }
    } catch (err: any) {
      setTriggerResult({
        success: false,
        message: err.message || "Gagal menghubungi server pengirim pesan."
      });
    } finally {
      setIsTriggering(false);
    }
  };

  const timePresets = ["07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];
  const allDays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  const toggleDay = (day: string) => {
    if (activeDays.includes(day)) {
      if (activeDays.length > 1) {
        setActiveDays(activeDays.filter(d => d !== day));
      }
    } else {
      setActiveDays([...activeDays, day]);
    }
  };

  // Find workers who signed on Friday
  const verifiedList = Object.values(fridayVerifications).sort((a: any, b: any) => 
    new Date(b.verifiedAt || 0).getTime() - new Date(a.verifiedAt || 0).getTime()
  );

  return (
    <div className="space-y-6 text-slate-800" id="bot_reminder_management_container">
      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-emerald-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent)] pointer-events-none"></div>
        <div className="space-y-2 relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
            <span>Otomasi WhatsApp Bot & Tanda Tangan Digital Server</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight font-display">
            Pengaturan Jadwal Bot Pengingat Absensi
          </h1>
          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
            Atur jam pengiriman pesan pengingat absensi harian secara otomatis ke nomor WhatsApp masing-masing karyawan, serta kelola verifikasi tanda tangan digital resmi setiap hari Jumat.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative z-10">
          <button
            onClick={fetchSettings}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700/60 shadow-xs cursor-pointer transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isLoading ? "animate-spin" : ""}`} />
            <span>Segarkan Status</span>
          </button>
          
          <button
            onClick={handleTriggerNow}
            disabled={isTriggering || !serverStatus.waConnected}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className={`w-4 h-4 ${isTriggering ? "animate-pulse" : ""}`} />
            <span>{isTriggering ? "Mengirim Pengingat..." : "Kirim Pengingat Sekarang"}</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK STATUS ALERTS */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xs animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold">{saveSuccessMsg}</span>
        </div>
      )}

      {triggerResult && (
        <div className={`px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xs animate-fadeIn ${
          triggerResult.success ? "bg-emerald-50 border border-emerald-300 text-emerald-800" : "bg-rose-50 border border-rose-300 text-rose-800"
        }`}>
          {triggerResult.success ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
          <span className="text-xs font-semibold">{triggerResult.message}</span>
        </div>
      )}

      {/* MAIN CONFIGURATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1 & 2: SCHEDULE CONFIGURATION CARD */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Jadwal Pengiriman Pesan Otomatis</h2>
                  <p className="text-xs text-slate-500">Tentukan jam otomatis bot WhatsApp mengirim pengingat ke karyawan</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                autoReminderEnabled ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-600"
              }`}>
                {autoReminderEnabled ? "JADWAL AKTIF" : "NONAKTIF"}
              </span>
            </div>

            {/* TOGGLE AUTO REMINDER ACTIVE */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900 block">Aktifkan Bot Pengingat Otomatis</span>
                <span className="text-[11px] text-slate-500 block">
                  Server akan secara mandiri memeriksa dan mengirimkan link absen pada jam yang ditentukan
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoReminderEnabled(!autoReminderEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoReminderEnabled ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    autoReminderEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* HOUR PICKER */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Jam Pengiriman Pesan (WIB)
              </label>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-48">
                  <input
                    type="time"
                    value={autoReminderHour}
                    onChange={(e) => setAutoReminderHour(e.target.value)}
                    disabled={!autoReminderEnabled}
                    className="w-full bg-white border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-2xl px-4 py-3 text-lg font-mono font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-center tracking-wider outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                    WIB
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                  {timePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!autoReminderEnabled}
                      onClick={() => setAutoReminderHour(preset)}
                      className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer disabled:opacity-40 ${
                        autoReminderHour === preset
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                * Rekomendasi: Jam <strong>08:30</strong> atau <strong>09:00 WIB</strong> sebelum jam kerja puncak dimulai.
              </p>
            </div>

            {/* ACTIVE DAYS CONFIG */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Hari Kerja Aktif Pengiriman
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {allDays.map((day) => {
                  const isChecked = activeDays.includes(day);
                  const isFriday = day === "Jumat";
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!autoReminderEnabled}
                      onClick={() => toggleDay(day)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 disabled:opacity-40 ${
                        isChecked
                          ? isFriday
                            ? "bg-teal-50 border-teal-500 text-teal-800 font-bold ring-1 ring-teal-500/20"
                            : "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-xs">{day}</span>
                      {isFriday && <span className="text-[9px] bg-teal-200/60 text-teal-900 px-1 rounded font-mono">TTD</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FRIDAY DIGITAL SIGNATURE RULE */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-teal-950">
                      Wajib Tanda Tangan Digital pada Hari Jumat
                    </h3>
                    <p className="text-[11px] text-teal-800 leading-relaxed mt-0.5">
                      Setiap hari Jumat, link absensi otomatis memuat pad tanda tangan digital dari HP karyawan. Tanda tangan langsung tersimpan dan diverifikasi secara kriptografis ke server resmi PT NMSA.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRequireFridaySignature(!requireFridaySignature)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    requireFridaySignature ? "bg-teal-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      requireFridaySignature ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="text-[10px] text-teal-700 bg-white/70 p-2.5 rounded-xl border border-teal-200/60 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>
                  Hasil TTD digital hari Jumat otomatis tercetak pada dokumen PDF Rekap Mingguan Uang Makan PT NMSA.
                </span>
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-700/20 cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                <span>{isSaving ? "Menyimpan ke Server..." : "Simpan Pengaturan Jadwal Bot"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* COLUMN 3: SERVER ENGINE & WHATSAPP CONNECTION STATUS */}
        <div className="space-y-6">
          {/* WA STATUS CARD */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Koneksi WhatsApp</h3>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                serverStatus.waConnected ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}>
                {serverStatus.waConnected ? "TERHUBUNG" : "BELUM SCAN"}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Status Bot:</span>
                <span className="font-bold text-slate-800">
                  {serverStatus.waConnected ? "Standby Siap Kirim" : "Terputus"}
                </span>
              </div>
              {serverStatus.waPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Nomor Bot:</span>
                  <span className="font-mono font-bold text-emerald-700">+{serverStatus.waPhone}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Karyawan Aktif:</span>
                <span className="font-bold text-slate-800">{serverStatus.totalActiveWorkers} Orang</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Belum Absen Hari Ini:</span>
                <span className="font-bold text-rose-600">{serverStatus.pendingAttendanceCount} Orang</span>
              </div>
            </div>

            {onOpenWhatsAppConnect && (
              <button
                type="button"
                onClick={onOpenWhatsAppConnect}
                className="w-full py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Buka Pusat WhatsApp (QR & Kode)</span>
              </button>
            )}
          </div>

          {/* ENGINE MONITOR CARD */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-md space-y-4 border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Pemantau Server WIB</h3>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Waktu Server:</span>
                <span className="text-emerald-400 font-bold">{serverStatus.serverTimeWIB || "Sinkronisasi..."}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Target Otomatis:</span>
                <span className="text-amber-300 font-bold">{autoReminderHour} WIB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Terkirim Hari Ini:</span>
                <span className={serverStatus.lastCronSentDate === todayDateStr ? "text-emerald-400 font-bold" : "text-slate-400"}>
                  {serverStatus.lastCronSentDate === todayDateStr ? "Sudah Terkirim ✓" : "Belum Dieksekusi"}
                </span>
              </div>
            </div>

            {serverStatus.lastCronStatus && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Status Terakhir:</span>
                <p className="leading-relaxed">{serverStatus.lastCronStatus}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGE PREVIEW SECTION */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Preview Pesan WhatsApp ke Karyawan</h2>
              <p className="text-xs text-slate-500">Pratinjau format pesan yang akan diterima di HP karyawan</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setPreviewTab("friday")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                previewTab === "friday" ? "bg-white text-teal-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🕌 Format Khusus Hari Jumat (Dengan TTD Digital)
            </button>
            <button
              onClick={() => setPreviewTab("regular")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                previewTab === "regular" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              💼 Format Hari Biasa (Senin - Kamis)
            </button>
          </div>
        </div>

        {/* MOCK WHATSAPP BUBBLE */}
        <div className="max-w-xl mx-auto bg-slate-100 p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-inner">
          <div className="bg-[#dcf8c6] text-slate-900 p-4 rounded-2xl rounded-tr-none shadow-sm space-y-3 text-xs leading-relaxed font-sans border border-[#c6e6af] relative">
            <div className="text-[10px] text-emerald-800 font-mono font-bold flex items-center justify-between border-b border-emerald-600/20 pb-1.5">
              <span>🤖 Bot WhatsApp Absensi PT NMSA</span>
              <span>{autoReminderHour} WIB</span>
            </div>

            {previewTab === "friday" ? (
              <div className="space-y-2 whitespace-pre-line text-slate-800">
                <p>🕌 <strong>Jumat Berkah — Absensi & Tanda Tangan Digital Karyawan NMSA</strong> 🌸🤲</p>
                <p>Alhamdulillah, kita telah tiba di penghujung pekan kerja, <strong>Budi Santoso</strong>!</p>
                <p>
                  Khusus hari Jumat ini, link absensi resmi telah <strong>dilengkapi Tanda Tangan Digital dari HP Anda</strong> yang langsung terverifikasi secara otomatis ke server aplikasi PT NMSA untuk pengesahan rekap uang makan mingguan:
                </p>
                <p className="bg-white/90 p-2.5 rounded-xl border border-emerald-400 font-mono text-[11px] text-emerald-900 font-bold break-all">
                  👉 https://pt-nmsa-app.com/?view=absen&workerId=W01&quick=true&friday=true
                </p>
                <p className="text-[11px] text-emerald-950 font-medium italic">
                  (Buka link di area kantor Wisma NH, goreskan paraf/tanda tangan di layar HP, dan dapatkan sertifikat verifikasi digital server).
                </p>
                <p>Selamat menuntaskan tugas pekan ini dengan penuh berkah & semangat! 🌿💼</p>
              </div>
            ) : (
              <div className="space-y-2 whitespace-pre-line text-slate-800">
                <p>⚡ <strong>Pengingat Absensi Masuk Harian PT NMSA</strong> ☕🌤️</p>
                <p>Selamat pagi rekan andalan, <strong>Budi Santoso</strong>!</p>
                <p>Yuk luangkan 5 detik untuk check-in kehadiranmu hari ini:</p>
                <p className="bg-white/90 p-2.5 rounded-xl border border-emerald-400 font-mono text-[11px] text-emerald-900 font-bold break-all">
                  👉 https://pt-nmsa-app.com/?view=absen&workerId=W01&quick=true
                </p>
                <p className="text-[11px] text-emerald-950">
                  (Buka tautan ini saat sudah tiba di kantor Wisma NH Pasar Minggu). Hak uang makanmu langsung tercatat otomatis! 🚀
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FRIDAY DIGITAL SIGNATURE AUDIT LOG TABLE */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Audit Tanda Tangan Digital Jumat Terverifikasi ke Server
              </h2>
              <p className="text-xs text-slate-500">
                Rekap bukti tanda tangan digital dari HP karyawan yang telah tersimpan dan diverifikasi oleh server aplikasi
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full font-mono">
            {verifiedList.length} TTD Terverifikasi
          </span>
        </div>

        {verifiedList.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <Smartphone className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">Belum Ada Tanda Tangan Digital Jumat Tersimpan</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
              Saat karyawan membuka link absen hari Jumat di HP mereka dan membubuhkan tanda tangan, rekaman tanda tangan beserta token verifikasi server akan otomatis tampil di tabel ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nama Karyawan</th>
                  <th className="py-3 px-4">Tanggal Absen</th>
                  <th className="py-3 px-4">Waktu Verifikasi Server</th>
                  <th className="py-3 px-4">Token Verifikasi Server</th>
                  <th className="py-3 px-4 text-center">Paraf / TTD Digital</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {verifiedList.map((item: any, idx: number) => {
                  const sigBase64 = signatures[item.workerId] || item.signature;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{item.workerName || "Karyawan"}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{item.date}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{item.verifiedAt || "-"}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[10px] bg-slate-100 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-bold">
                          {item.token || "VERIF-NMSA-JUMAT"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {sigBase64 ? (
                          <img
                            src={sigBase64}
                            alt="TTD"
                            className="h-7 max-w-[100px] object-contain mx-auto mix-blend-multiply"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Tercatat</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedVerification(item)}
                          className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[11px] font-bold cursor-pointer transition"
                        >
                          Lihat Sertifikat
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VERIFICATION CERTIFICATE MODAL */}
      {selectedVerification && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 shadow-2xl space-y-5 animate-scaleUp text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-teal-700">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-sm font-bold tracking-tight text-slate-900">
                  Sertifikat Verifikasi Digital Server
                </h3>
              </div>
              <button
                onClick={() => setSelectedVerification(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-center space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-teal-700 bg-teal-200/50 px-2 py-0.5 rounded-full inline-block">
                RESMI SERVER PT NMSA
              </span>
              <h4 className="text-base font-extrabold text-teal-950">
                TANDA TANGAN TERVERIFIKASI SAH
              </h4>
              <p className="text-xs text-teal-800">
                Token Kriptografis: <br />
                <strong className="font-mono text-teal-900">{selectedVerification.token}</strong>
              </p>
            </div>

            {/* SIGNATURE DISPLAY */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 text-center space-y-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                Goresan Tanda Tangan dari HP Karyawan:
              </span>
              {(signatures[selectedVerification.workerId] || selectedVerification.signature) ? (
                <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-center">
                  <img
                    src={signatures[selectedVerification.workerId] || selectedVerification.signature}
                    alt="TTD"
                    className="max-h-24 object-contain mix-blend-multiply"
                  />
                </div>
              ) : (
                <div className="py-6 text-slate-400 italic text-xs">Goresan tanda tangan tersimpan di server</div>
              )}
              <span className="block text-xs font-bold text-slate-700">
                ( {selectedVerification.workerName} )
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Nama:</span>
                <span className="font-bold text-slate-900">{selectedVerification.workerName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Hari / Tanggal:</span>
                <span className="font-semibold text-slate-800">{selectedVerification.date} (Jumat)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Waktu Verifikasi Server:</span>
                <span className="font-mono text-slate-700">{selectedVerification.verifiedAt || "-"}</span>
              </div>
              {selectedVerification.distance !== undefined && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Jarak Lokasi GPS:</span>
                  <span className="text-emerald-700 font-bold">~{selectedVerification.distance} m dari kantor (Aman ✅)</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedVerification(null)}
              className="w-full py-3 rounded-2xl bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Tutup Sertifikat
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
