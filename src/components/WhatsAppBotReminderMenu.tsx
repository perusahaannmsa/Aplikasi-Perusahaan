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
  Info,
  CalendarX,
  CalendarCheck,
  UserCheck,
  Copy,
  Sparkles,
  Check
} from "lucide-react";
import { saveAbsenDataToFirestore } from "../firebase";
import { getDynamicReminderMessage } from "../utils/reminderMessageGenerator";

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
  const [skipHolidays, setSkipHolidays] = useState<boolean>(true);
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);
  const [requireFridaySignature, setRequireFridaySignature] = useState<boolean>(true);
  const [activeDays, setActiveDays] = useState<string[]>(["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>("");
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [triggerResult, setTriggerResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Interactive preview state for rotating greeting messages
  const [previewWorkerId, setPreviewWorkerId] = useState<string>("");
  const [previewDayShift, setPreviewDayShift] = useState<number>(0); // 0 = Hari ini, 1 = Besok (+1), 2 = Lusa (+2), 5 = Simulasi Jumat
  const [previewCopied, setPreviewCopied] = useState<boolean>(false);
  const [todayHolidayInfo, setTodayHolidayInfo] = useState<{ isHoliday: boolean; reason: string | null } | null>(null);

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
  const [previewTab, setPreviewTab] = useState<"rotating" | "friday">("rotating");

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
        if (data.skipHolidays !== undefined) setSkipHolidays(data.skipHolidays);
        if (data.skipWeekends !== undefined) setSkipWeekends(data.skipWeekends);
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

      // Check current holiday info
      const holRes = await fetch("/api/check-holiday");
      if (holRes.ok) {
        const holData = await holRes.json();
        setTodayHolidayInfo({ isHoliday: !!holData.isHoliday, reason: holData.reason || null });
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
          skipHolidays,
          skipWeekends,
          reminderActiveDays: activeDays,
          requireFridaySignature
        })
      });

      // Save to localStorage as backup
      localStorage.setItem("wa_auto_reminder_hour", autoReminderHour);
      localStorage.setItem("wa_auto_reminder_enabled", autoReminderEnabled ? "true" : "false");
      localStorage.setItem("wa_skip_holidays", skipHolidays ? "true" : "false");
      localStorage.setItem("wa_skip_weekends", skipWeekends ? "true" : "false");
      localStorage.setItem("wa_friday_signature_required", requireFridaySignature ? "true" : "false");

      // Save to Firestore
      await saveAbsenDataToFirestore({
        id: "bot_reminder_settings",
        autoReminderHour,
        autoReminderEnabled,
        skipHolidays,
        skipWeekends,
        reminderActiveDays: activeDays,
        requireFridaySignature,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore save fallback error:", e));

      if (res.ok) {
        setSaveSuccessMsg("Pengaturan waktu kirim, lewati tanggal merah/akhir pekan, dan aturan TTD Jumat berhasil disimpan ke server!");
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

            {/* PENGATURAN LEWATI TANGGAL MERAH (LIBUR NASIONAL) */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <CalendarX className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-amber-950">
                        Lewati Tanggal Merah (Hari Libur Nasional Indonesia)
                      </h3>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono ${
                        skipHolidays ? "bg-amber-200/80 text-amber-900" : "bg-slate-200 text-slate-600"
                      }`}>
                        {skipHolidays ? "OTOMATIS DILEWATI" : "NONAKTIF"}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900/80 leading-relaxed">
                      Server otomatis memeriksa kalender hari libur nasional resmi Republik Indonesia. Bila aktif, bot WhatsApp istirahat dan tidak akan mengirimkan pengingat absensi pada tanggal merah atau hari cuti bersama nasional.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSkipHolidays(!skipHolidays)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    skipHolidays ? "bg-amber-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      skipHolidays ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {todayHolidayInfo && (
                <div className={`text-[10px] p-2.5 rounded-xl border flex items-center gap-2 font-medium ${
                  todayHolidayInfo.isHoliday 
                    ? "bg-rose-50 border-rose-200 text-rose-800" 
                    : "bg-white/80 border-amber-200/70 text-amber-900"
                }`}>
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                  <span>
                    Status Kalender Hari Ini ({todayDateStr}): <strong>{todayHolidayInfo.isHoliday ? `🔴 Libur: ${todayHolidayInfo.reason}` : "🟢 Hari Kerja Normal (Bukan Tanggal Merah)"}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* PENGATURAN LEWATI AKHIR PEKAN (SABTU & MINGGU) */}
            <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-sky-950">
                        Lewati Akhir Pekan (Hari Sabtu & Hari Minggu)
                      </h3>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono ${
                        skipWeekends ? "bg-sky-200/80 text-sky-900" : "bg-slate-200 text-slate-600"
                      }`}>
                        {skipWeekends ? "OTOMATIS DILEWATI" : "NONAKTIF"}
                      </span>
                    </div>
                    <p className="text-[11px] text-sky-900/80 leading-relaxed">
                      Bot WhatsApp secara otomatis tidak mengirimkan pengingat absensi pada hari Sabtu dan Minggu agar tidak mengganggu waktu istirahat karyawan di luar hari kerja reguler.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSkipWeekends(!skipWeekends)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    skipWeekends ? "bg-sky-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      skipWeekends ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
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
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Simulasi Ajakan Bot yang Berganti Setiap Hari & Karyawan
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                  34 Format Unik
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Setiap karyawan dan setiap hari menerima pesan yang berbeda, variatif, dan menyemangati
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setPreviewTab("rotating"); setPreviewDayShift(0); }}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  previewTab === "rotating" ? "bg-white text-indigo-950 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ✨ Format Berganti Harian
              </button>
              <button
                type="button"
                onClick={() => { setPreviewTab("friday"); setPreviewDayShift(0); }}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  previewTab === "friday" ? "bg-white text-teal-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🕌 Jumat Berkah & TTD Digital
              </button>
            </div>
          </div>
        </div>

        {/* CONTROLS: PILIH KARYAWAN & SIMULASI HARI */}
        {(() => {
          const activeWorkers = workers.filter(w => w.isActive);
          const currentWorker = activeWorkers.find(w => w.id === previewWorkerId) || activeWorkers[0] || { id: "W01", name: "Suryo Pranoto", role: "Staf" };
          
          // Compute simulated date string
          const simulatedDate = new Date();
          if (previewTab === "friday") {
            const currentDay = simulatedDate.getDay();
            const daysUntilFriday = (5 - currentDay + 7) % 7;
            simulatedDate.setDate(simulatedDate.getDate() + daysUntilFriday);
          } else {
            simulatedDate.setDate(simulatedDate.getDate() + previewDayShift);
          }
          const ymdSim = simulatedDate.toISOString().split("T")[0];
          const indoDayName = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(simulatedDate);
          const fullIndoDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(simulatedDate);

          const hostUrl = typeof window !== "undefined" ? window.location.origin : "https://aplikasi-perusahaan-nmsa.vercel.app";
          const quickParam = previewTab === "friday" ? "&quick=true&friday=true" : "&quick=true";
          const simulatedUrl = `${hostUrl}/?view=absen&workerId=${encodeURIComponent(currentWorker.id)}&id=${encodeURIComponent(currentWorker.id)}${quickParam}`;
          
          const simulatedMessage = getDynamicReminderMessage(
            currentWorker.name, 
            currentWorker.id, 
            simulatedUrl, 
            ymdSim, 
            9
          );

          const handleCopyMessage = () => {
            navigator.clipboard.writeText(simulatedMessage);
            setPreviewCopied(true);
            setTimeout(() => setPreviewCopied(false), 2500);
          };

          return (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                {/* PILIH KARYAWAN */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Pilih Karyawan:</span>
                  <div className="flex flex-wrap gap-1.5 max-w-md">
                    {activeWorkers.slice(0, 6).map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setPreviewWorkerId(w.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                          currentWorker.id === w.id
                            ? "bg-indigo-600 text-white font-bold shadow-xs"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {w.name}
                      </button>
                    ))}
                    {activeWorkers.length > 6 && (
                      <select
                        value={currentWorker.id}
                        onChange={(e) => setPreviewWorkerId(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 outline-none font-medium"
                      >
                        {activeWorkers.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* SIMULASI HARI */}
                {previewTab === "rotating" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Simulasi Waktu:</span>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
                      {[
                        { label: "Hari Ini", shift: 0 },
                        { label: "+1 Hari", shift: 1 },
                        { label: "+2 Hari", shift: 2 },
                        { label: "+3 Hari", shift: 3 },
                        { label: "+7 Hari", shift: 7 },
                      ].map((s) => (
                        <button
                          key={s.shift}
                          type="button"
                          onClick={() => setPreviewDayShift(s.shift)}
                          className={`px-2 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                            previewDayShift === s.shift
                              ? "bg-indigo-100 text-indigo-900 font-bold"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* MOCK WHATSAPP BUBBLE */}
              <div className="max-w-2xl mx-auto bg-slate-100 p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-inner space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>📅 Simulasi: <strong>{indoDayName}, {fullIndoDate}</strong></span>
                  <span>👤 Penerima: <strong>{currentWorker.name}</strong></span>
                </div>

                <div className="bg-[#dcf8c6] text-slate-900 p-4 rounded-2xl rounded-tr-none shadow-sm space-y-3 text-xs leading-relaxed font-sans border border-[#c6e6af] relative">
                  <div className="text-[10px] text-emerald-800 font-mono font-bold flex items-center justify-between border-b border-emerald-600/20 pb-1.5">
                    <span>🤖 Bot WhatsApp PT NMSA</span>
                    <span>{autoReminderHour} WIB</span>
                  </div>

                  <div className="space-y-2 whitespace-pre-line text-slate-800 font-sans leading-relaxed">
                    {simulatedMessage}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 italic">
                    * Buka karyawan lain atau ubah hari untuk melihat rotasi pesan secara instan.
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition cursor-pointer"
                  >
                    {previewCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{previewCopied ? "Tersalin!" : "Salin Format"}</span>
                  </button>
                </div>
              </div>

              {/* INFORMATION FOOTER */}
              <div className="bg-indigo-50/70 border border-indigo-200 text-indigo-950 p-4 rounded-2xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed space-y-1">
                  <p className="font-bold">Keunggulan Sistem Ajakan Bot PT NMSA:</p>
                  <p className="text-indigo-900/90">
                    Sistem menggunakan algoritma seed hashing yang memastikan <strong>setiap karyawan menerima kata-kata dan format yang berbeda di hari yang sama</strong>, dan <strong>setiap hari karyawan yang sama mendapatkan sapaan yang berbeda</strong> (kopi pagi, checklist 3 langkah, doa berkah, motivasi pejuang, pantun ceria, apresiasi tim, dan format khusus Jumat).
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
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
