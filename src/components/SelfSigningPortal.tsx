import React, { useState } from "react";
import { 
  CheckCircle2, 
  PenTool, 
  Calendar, 
  DollarSign, 
  User, 
  ShieldCheck, 
  ArrowLeft, 
  Send,
  Building,
  Check
} from "lucide-react";
import { Worker, AttendanceRecord } from "../types";
import { SignaturePad } from "./SignaturePad";

interface SelfSigningPortalProps {
  worker: Worker;
  attendanceRecord?: AttendanceRecord;
  weekStart: string;
  weekEnd: string;
  weekDates: string[];
  existingSignature?: string | null;
  onSaveSignature: (signatureBase64: string) => Promise<void> | void;
  onClose: () => void;
}

export function SelfSigningPortal({
  worker,
  attendanceRecord,
  weekStart,
  weekEnd,
  weekDates,
  existingSignature,
  onSaveSignature,
  onClose
}: SelfSigningPortalProps) {
  const [signatureDraft, setSignatureDraft] = useState<string | null>(existingSignature || null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Calculate days present & total allowance
  let daysPresent = 0;
  weekDates.forEach((d) => {
    if (attendanceRecord?.attendance?.[d]) {
      const cStatus = attendanceRecord?.customStatus?.[d];
      if (cStatus !== "Meeting" && cStatus !== "Izin" && cStatus !== "Sakit" && cStatus !== "Absen") {
        daysPresent++;
      }
    }
  });

  const dailyAllowance = attendanceRecord?.dailyAllowance || 25000;
  const totalAllowance = daysPresent * dailyAllowance;

  const handleSubmit = async () => {
    if (!signatureDraft) {
      alert("Silakan goreskan atau ketik tanda tangan / paraf Anda terlebih dahulu.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSaveSignature(signatureDraft);
      setIsSuccess(true);
    } catch (e: any) {
      alert("Gagal menyimpan tanda tangan: " + (e.message || String(e)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Background Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 text-center relative">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Building className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-extrabold tracking-wider uppercase text-indigo-300">
              PT. Nusantara Mineral Sukses Abadi
            </span>
          </div>
          <h1 className="text-base font-extrabold text-white tracking-tight">
            Penanda Tanganan Uang Makan Online
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Konfirmasi kehadiran &amp; pembubuhan paraf digital mandiri
          </p>
        </div>

        {isSuccess ? (
          /* SUCCESS CONFIRMATION VIEW */
          <div className="p-6 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider font-mono">
                BERHASIL DITANDATANGANI
              </span>
              <h2 className="text-lg font-bold text-white pt-2">
                Terima Kasih, {worker.name}!
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                Paraf digital Anda telah resmi tercatat dan disematkan langsung pada berkas PDF Rekap Keuangan Uang Makan kantor.
              </p>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Karyawan:</span>
                <span className="text-white font-bold">{worker.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Periode:</span>
                <span className="text-slate-300 font-mono">{weekStart} s/d {weekEnd}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">Total Uang Makan:</span>
                <span className="text-emerald-400 font-bold font-mono">
                  Rp {totalAllowance.toLocaleString("id-ID")} ({daysPresent} Hari)
                </span>
              </div>
              {signatureDraft && (
                <div className="border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400 text-[10px] block mb-1">Paraf Tersimpan:</span>
                  <div className="h-12 bg-white rounded-lg flex items-center justify-center p-1">
                    <img src={signatureDraft} alt="Paraf" className="max-h-10 max-w-[120px] object-contain mix-blend-multiply" />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 px-6 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30 uppercase text-xs tracking-wider"
            >
              <Check className="w-4 h-4" />
              <span>Selesai / Kembali</span>
            </button>
          </div>
        ) : (
          /* SIGNING FORM VIEW */
          <div className="p-5 space-y-5">
            {/* Worker & Allowance Card */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {worker.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{worker.name}</h3>
                    <p className="text-[11px] text-slate-400">{worker.role}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                  {daysPresent} Hari Hadir
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-2.5">
                <div>
                  <span className="text-[10px] text-slate-500 block">Periode Rekap:</span>
                  <span className="text-slate-300 font-mono text-[11px]">{weekStart} s/d {weekEnd}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Total Hak Uang Makan:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    Rp {totalAllowance.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            </div>

            {/* Signature Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Paraf / Tanda Tangan Anda:</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Gores jari atau ketik
                </span>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-700 bg-white">
                <SignaturePad
                  workerName={worker.name}
                  initialSignature={existingSignature || null}
                  onSignatureChange={(base64) => setSignatureDraft(base64)}
                  placeholder="Goreskan jari Anda di kotak ini untuk bertanda tangan"
                  compact={true}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={!signatureDraft || isSubmitting}
                onClick={handleSubmit}
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold py-3.5 px-6 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 uppercase text-xs tracking-wider"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? "Menyimpan..." : "Konfirmasi & Simpan Tanda Tangan"}</span>
              </button>

              <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                Dengan menekan tombol di atas, Anda menyatakan bahwa data presensi dan uang makan mingguan telah benar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
