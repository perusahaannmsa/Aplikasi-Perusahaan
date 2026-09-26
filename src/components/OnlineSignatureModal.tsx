import React, { useState } from "react";
import { 
  X, 
  PenTool, 
  CheckCircle2, 
  Users, 
  ShieldCheck, 
  Share2, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  Trash2, 
  Sparkles, 
  Check,
  Send,
  UserCheck
} from "lucide-react";
import { Worker } from "../types";
import { SignaturePad } from "./SignaturePad";

interface OnlineSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  signatures: Record<string, string>;
  onSaveSignature: (id: string, signatureBase64: string | null) => void;
  onBatchAutoSignAll?: (newSignatures: Record<string, string>) => void;
  onClearAllSignatures?: () => void;
  weekStart: string;
  weekEnd: string;
}

export function OnlineSignatureModal({
  isOpen,
  onClose,
  workers,
  signatures,
  onSaveSignature,
  onBatchAutoSignAll,
  onClearAllSignatures,
  weekStart,
  weekEnd
}: OnlineSignatureModalProps) {
  const activeWorkers = workers.filter(w => w.isActive);
  const [activeTab, setActiveTab] = useState<"karyawan" | "keuangan" | "share">("karyawan");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(activeWorkers[0]?.id || "");
  const [currentSignatureDraft, setCurrentSignatureDraft] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedOfficer, setSelectedOfficer] = useState<"finance_receiver" | "finance_reporter">("finance_reporter");

  if (!isOpen) return null;

  const selectedWorker = activeWorkers.find(w => w.id === selectedWorkerId) || activeWorkers[0];
  const totalSignedWorkers = activeWorkers.filter(w => !!signatures[w.id]).length;

  const filteredWorkers = activeWorkers.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    w.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveCurrentWorker = () => {
    if (selectedWorker) {
      onSaveSignature(selectedWorker.id, currentSignatureDraft);
    }
  };

  const handleRemoveWorkerSignature = (workerId: string) => {
    onSaveSignature(workerId, null);
    if (selectedWorkerId === workerId) {
      setCurrentSignatureDraft(null);
    }
  };

  const handleSaveOfficerSignature = () => {
    onSaveSignature(selectedOfficer, currentSignatureDraft);
  };

  const handleCopyShareLink = (workerId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const link = `${origin}${pathname}?sign=1&workerId=${workerId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(workerId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSendWhatsAppLink = (worker: Worker) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const link = `${origin}${pathname}?sign=1&workerId=${worker.id}`;
    
    const message = `Halo *${worker.name}*,\n\nMohon untuk menandatangani berkas rekap absensi & uang makan mingguan Anda periode *${weekStart} s/d ${weekEnd}* melalui link penanda tanganan online berikut:\n\n👉 ${link}\n\nTerima kasih atas kerja samanya.\n_PT. Nusantara Mineral Sukses Abadi_`;
    
    let cleanPhone = (worker.phoneNumber || "").replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    }
    
    const waUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(waUrl, "_blank");
  };

  const handleBatchAutoSign = () => {
    if (!onBatchAutoSignAll) return;
    if (!confirm("Buat paraf otomatis untuk semua karyawan yang belum bertanda tangan?")) return;

    const newSignatures: Record<string, string> = { ...signatures };

    activeWorkers.forEach(w => {
      if (!newSignatures[w.id]) {
        // Create cursive SVG/Canvas data URL for worker
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#1e3a8a";
          ctx.font = "italic 32px 'Dancing Script', cursive, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(w.name, 200, 80);

          ctx.strokeStyle = "rgba(30, 58, 138, 0.4)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(80, 120);
          ctx.quadraticCurveTo(200, 145, 330, 125);
          ctx.stroke();

          newSignatures[w.id] = canvas.toDataURL("image/png");
        }
      }
    });

    onBatchAutoSignAll(newSignatures);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Main Dialog Box */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <PenTool className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">Studio Tanda Tangan & Paraf Online</h2>
                <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full font-bold">
                  {totalSignedWorkers}/{activeWorkers.length} Karyawan Selesai
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Bubuhkan tanda tangan sah untuk laporan PDF mingguan periode: <strong className="text-white">{weekStart} s/d {weekEnd}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="Tutup (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("karyawan")}
            className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === "karyawan"
                ? "border-indigo-600 text-indigo-700 bg-white rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Paraf Karyawan ({totalSignedWorkers}/{activeWorkers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("keuangan")}
            className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === "keuangan"
                ? "border-indigo-600 text-indigo-700 bg-white rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Tanda Tangan Keuangan & Pelapor</span>
            {(signatures['finance_receiver'] || signatures['finance_reporter']) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("share")}
            className={`py-2.5 px-4 border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === "share"
                ? "border-indigo-600 text-indigo-700 bg-white rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Link Tanda Tangan Mandiri (WhatsApp HP)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: PARAF KARYAWAN */}
          {activeTab === "karyawan" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Worker Selector */}
              <div className="md:col-span-5 flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Pilih Karyawan:</span>
                  {onBatchAutoSignAll && (
                    <button
                      type="button"
                      onClick={handleBatchAutoSign}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Isi otomatis paraf digital untuk semua karyawan yang belum"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Auto-Paraf Semua</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Cari nama atau jabatan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />

                <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredWorkers.map((w, idx) => {
                    const hasSig = !!signatures[w.id];
                    const isSelected = selectedWorker?.id === w.id;

                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkerId(w.id);
                          setCurrentSignatureDraft(signatures[w.id] || null);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {w.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {w.role}
                          </div>
                        </div>

                        {hasSig ? (
                          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-700 shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Sudah Ada</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md font-medium shrink-0">
                            Belum
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Signature Pad Canvas for selected worker */}
              <div className="md:col-span-7 flex flex-col space-y-4">
                {selectedWorker ? (
                  <>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                          Karyawan Terpilih
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                          {selectedWorker.name}
                        </h3>
                        <div className="text-xs text-slate-500">
                          {selectedWorker.role} &bull; No: {selectedWorker.phoneNumber || "-"}
                        </div>
                      </div>

                      {signatures[selectedWorker.id] && (
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 font-semibold mb-1">Paraf Saat Ini:</div>
                          <div className="h-10 px-2 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-xs">
                            <img 
                              src={signatures[selectedWorker.id]} 
                              alt="Paraf saat ini" 
                              className="max-h-8 max-w-[90px] object-contain mix-blend-multiply" 
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <SignaturePad
                        key={selectedWorker.id}
                        workerName={selectedWorker.name}
                        initialSignature={signatures[selectedWorker.id] || null}
                        onSignatureChange={(base64) => setCurrentSignatureDraft(base64)}
                        placeholder={`Goreskan tanda tangan / paraf untuk ${selectedWorker.name}`}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      {signatures[selectedWorker.id] ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkerSignature(selectedWorker.id)}
                          className="px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Paraf Ini</span>
                        </button>
                      ) : <div />}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppLink(selectedWorker)}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                          title="Kirim link ke WhatsApp karyawan untuk tanda tangan dari HP"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Minta via WA</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveCurrentWorker}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer shadow-indigo-600/20"
                        >
                          <Check className="w-4 h-4" />
                          <span>Simpan Paraf Karyawan</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    Pilih karyawan di sebelah kiri untuk membubuhkan paraf online.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TANDA TANGAN KEPEGAWAIAN & KEUANGAN */}
          {activeTab === "keuangan" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <strong>Tanda Tangan Pengesahan Laporan Resmi:</strong>
                  <p className="mt-0.5 text-amber-800">
                    Tanda tangan digital di tab ini akan langsung disematkan pada kotak pengesahan di bagian bawah berkas PDF Laporan Uang Makan Mingguan (Staff Keuangan & Pimpinan Keuangan).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Officer 1: Nur Wahyudi */}
                <div 
                  onClick={() => {
                    setSelectedOfficer("finance_reporter");
                    setCurrentSignatureDraft(signatures["finance_reporter"] || null);
                  }}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    selectedOfficer === "finance_reporter"
                      ? "bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20"
                      : "bg-white hover:bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        Diserahkan &amp; Dilaporkan Oleh
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                        Nur Wahyudi
                      </h4>
                      <div className="text-xs text-slate-500">Staff Keuangan</div>
                    </div>
                    {signatures["finance_reporter"] ? (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                        ✓ Ada Tanda Tangan
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded">
                        Belum Ada
                      </span>
                    )}
                  </div>

                  {signatures["finance_reporter"] && (
                    <div className="mt-3 p-2 bg-white rounded-xl border border-slate-200 flex items-center justify-center h-16">
                      <img 
                        src={signatures["finance_reporter"]} 
                        alt="Tanda tangan Nur Wahyudi" 
                        className="max-h-12 max-w-[140px] object-contain mix-blend-multiply" 
                      />
                    </div>
                  )}
                </div>

                {/* Officer 2: Andi Dhiya Salsabila */}
                <div 
                  onClick={() => {
                    setSelectedOfficer("finance_receiver");
                    setCurrentSignatureDraft(signatures["finance_receiver"] || null);
                  }}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    selectedOfficer === "finance_receiver"
                      ? "bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20"
                      : "bg-white hover:bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        Diterima &amp; Diperiksa Oleh
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                        Andi Dhiya Salsabila
                      </h4>
                      <div className="text-xs text-slate-500">Keuangan</div>
                    </div>
                    {signatures["finance_receiver"] ? (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                        ✓ Ada Tanda Tangan
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded">
                        Belum Ada
                      </span>
                    )}
                  </div>

                  {signatures["finance_receiver"] && (
                    <div className="mt-3 p-2 bg-white rounded-xl border border-slate-200 flex items-center justify-center h-16">
                      <img 
                        src={signatures["finance_receiver"]} 
                        alt="Tanda tangan Andi Dhiya Salsabila" 
                        className="max-h-12 max-w-[140px] object-contain mix-blend-multiply" 
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Active Officer Signature Pad */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Bubuhkan Tanda Tangan Resmi untuk:{" "}
                    <strong className="text-indigo-700">
                      {selectedOfficer === "finance_reporter" ? "Nur Wahyudi (Staff Keuangan)" : "Andi Dhiya Salsabila (Keuangan)"}
                    </strong>
                  </span>
                  {signatures[selectedOfficer] && (
                    <button
                      type="button"
                      onClick={() => onSaveSignature(selectedOfficer, null)}
                      className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Hapus Tanda Tangan Ini
                    </button>
                  )}
                </div>

                <SignaturePad
                  key={selectedOfficer}
                  workerName={selectedOfficer === "finance_reporter" ? "Nur Wahyudi" : "Andi Dhiya Salsabila"}
                  initialSignature={signatures[selectedOfficer] || null}
                  onSignatureChange={(base64) => setCurrentSignatureDraft(base64)}
                  placeholder={`Goreskan tanda tangan ${selectedOfficer === "finance_reporter" ? "Nur Wahyudi" : "Andi Dhiya Salsabila"} di sini`}
                />

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveOfficerSignature}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer shadow-indigo-600/20"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan Tanda Tangan Pengesahan</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BAGIKAN LINK TANDA TANGAN MANDIRI KE WHATSAPP */}
          {activeTab === "share" && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
                <Share2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-950 leading-relaxed">
                  <strong>Tanda Tangan Mandiri dari Handphone Karyawan:</strong>
                  <p className="mt-0.5 text-indigo-800">
                    Karyawan dapat membubuhkan tanda tangan secara mandiri menggunakan layar sentuh HP masing-masing melalui tautan khusus di bawah ini. Tanda tangan yang dikirimkan karyawan akan langsung masuk ke sistem dan tercetak di PDF.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {activeWorkers.map((w, idx) => {
                  const hasSig = !!signatures[w.id];
                  const isCopied = copiedId === w.id;

                  return (
                    <div 
                      key={w.id} 
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono font-bold text-slate-400 w-6 text-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{w.name}</span>
                            {hasSig ? (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                                ✓ Sudah Ditandatangani
                              </span>
                            ) : (
                              <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                                Belum
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {w.role} &bull; WA: {w.phoneNumber || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyShareLink(w.id)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>{isCopied ? "Tersalin!" : "Salin Link"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppLink(w)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/20"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Kirim ke WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info & close */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tanda tangan tersimpan permanen dan otomatis disematkan pada seluruh laporan PDF &amp; Google Drive.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
