import React, { useRef, useState, useEffect } from "react";
import { Trash2, Type, Paintbrush, Undo, Check } from "lucide-react";

interface SignaturePadProps {
  onSignatureChange: (signatureBase64: string | null) => void;
  workerName: string;
  initialSignature?: string | null;
  placeholder?: string;
  compact?: boolean;
}

export function SignaturePad({ 
  onSignatureChange, 
  workerName, 
  initialSignature,
  placeholder,
  compact = false 
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typedText, setTypedText] = useState("");
  const [inkColor, setInkColor] = useState<"#1e3a8a" | "#0f172a">("#1e3a8a");
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas context & set dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = 500;
    canvas.height = compact ? 180 : 220;

    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Load initial signature if provided
    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasDrawn(true);
      };
      img.src = initialSignature;
    }
  }, [compact, initialSignature]);

  // Update strokeStyle when inkColor changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = inkColor;
    }
  }, [inkColor]);

  // Update canvas if mode changes or typedText changes
  useEffect(() => {
    if (mode === "type") {
      drawTextToCanvas();
    }
  }, [mode, typedText, inkColor]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    setIsDrawing(true);
    setHasDrawn(true);

    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setTypedText("");
    onSignatureChange(null);
  };

  const drawTextToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const textToDraw = typedText.trim() || workerName;
    
    ctx.fillStyle = inkColor;
    ctx.font = "italic 36px 'Dancing Script', 'Brush Script MT', 'Caveat', cursive, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(textToDraw, canvas.width / 2, canvas.height * 0.45);

    // Decorative signature flourish
    ctx.strokeStyle = inkColor === "#1e3a8a" ? "rgba(30, 58, 138, 0.4)" : "rgba(15, 23, 42, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.18, canvas.height * 0.68);
    ctx.quadraticCurveTo(
      canvas.width * 0.45,
      canvas.height * 0.82,
      canvas.width * 0.82,
      canvas.height * 0.70
    );
    ctx.stroke();

    setHasDrawn(true);
    onSignatureChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Header controls: Modes & Ink Color */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setMode("draw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              mode === "draw"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Gores Tangan (Sentuh)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("type");
              if (!typedText) setTypedText(workerName);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              mode === "type"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Ketik Paraf Elegan</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Ink color */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span>Warna Tinta:</span>
            <button
              type="button"
              onClick={() => setInkColor("#1e3a8a")}
              className={`w-5 h-5 rounded-full bg-blue-900 border-2 transition cursor-pointer flex items-center justify-center ${
                inkColor === "#1e3a8a" ? "border-indigo-500 scale-110 shadow-xs" : "border-white"
              }`}
              title="Biru Navy Resmi"
            >
              {inkColor === "#1e3a8a" && <Check className="w-3 h-3 text-white" />}
            </button>
            <button
              type="button"
              onClick={() => setInkColor("#0f172a")}
              className={`w-5 h-5 rounded-full bg-slate-900 border-2 transition cursor-pointer flex items-center justify-center ${
                inkColor === "#0f172a" ? "border-indigo-500 scale-110 shadow-xs" : "border-white"
              }`}
              title="Hitam Resmi"
            >
              {inkColor === "#0f172a" && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>

          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasDrawn}
            className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-md transition cursor-pointer disabled:opacity-40"
            title="Hapus goresan"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus</span>
          </button>
        </div>
      </div>

      {/* Canvas Drawing Area */}
      <div className="relative p-3 bg-slate-50/40 flex-1 flex flex-col justify-center items-center">
        <div className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-inner overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className={`w-full ${compact ? 'h-[160px]' : 'h-[190px]'} bg-white cursor-crosshair touch-none`}
          />

          {!hasDrawn && mode === "draw" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-slate-300">
              <Paintbrush className="w-8 h-8 opacity-40 mb-1" />
              <span className="text-xs font-semibold">
                {placeholder || "Goreskan tanda tangan atau paraf Anda di sini"}
              </span>
              <span className="text-[10px] text-slate-400">
                (Dukungan layar sentuh HP / tablet / mouse laptop)
              </span>
            </div>
          )}

          {/* Baseline guide line */}
          <div className="absolute left-6 right-6 bottom-7 border-b border-dashed border-slate-200 pointer-events-none flex justify-between text-[9px] text-slate-400 uppercase tracking-widest px-2">
            <span>Paraf Sah</span>
            <span>PT. NMSA</span>
          </div>
        </div>
      </div>

      {/* Typing Mode Input Box */}
      {mode === "type" && (
        <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-600 font-bold">
              Ketik Nama / Inisial untuk Paraf Digital Otomatis:
            </label>
            <button
              type="button"
              onClick={() => setTypedText(workerName)}
              className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              Gunakan Nama Karyawan ({workerName})
            </button>
          </div>
          <input
            type="text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={`Contoh: ${workerName}`}
            className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      )}

      {/* Footer info */}
      <div className="px-3.5 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Resolusi Tinggi &bull; Transparan &bull; Resmi
        </span>
        <span>
          {mode === "draw" ? "Gunakan jari atau pena stylus" : "Cursive Elegant Font"}
        </span>
      </div>
    </div>
  );
}
