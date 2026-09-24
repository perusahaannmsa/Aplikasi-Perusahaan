import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  RemoveFormatting,
  Undo,
  Redo,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';

interface MemoRichEditorProps {
  value: string;
  onChange: (htmlContent: string) => void;
  placeholder?: string;
  className?: string;
}

export const MemoRichEditor: React.FC<MemoRichEditorProps> = ({
  value,
  onChange,
  placeholder = 'Tulis isi memo di sini...',
  className = '',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
  });

  // Track if editor content is currently being updated internally
  const isInternalUpdate = useRef(false);

  // Helper to safely format legacy text to rich HTML
  const ensureHtml = (raw: string): string => {
    if (!raw) return '';
    // If it already looks like HTML (has tags)
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw;
    }
    // Otherwise convert newlines to <br/>
    return raw.replace(/\n/g, '<br>');
  };

  // Synchronize incoming value prop to editor innerHTML if changed externally
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      const formatted = ensureHtml(value);
      if (editorRef.current.innerHTML !== formatted) {
        editorRef.current.innerHTML = formatted;
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  // Update active format state (bold, italic, underline, strike)
  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
      });
    } catch {
      // ignore
    }
  }, []);

  // Execute formatting command like Microsoft Word
  const format = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    updateActiveFormats();
    triggerChange();
  };

  // Trigger onChange when content changes
  const triggerChange = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    onChange(html);
  };

  // Keyboard shortcut listener (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, etc.)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        format('bold');
      } else if (key === 'i') {
        e.preventDefault();
        format('italic');
      } else if (key === 'u') {
        e.preventDefault();
        format('underline');
      }
    }
  };

  // Quick insertion helpers
  const insertQuickText = (text: string, asBold = false) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const htmlToInsert = asBold ? `<strong>${text}</strong>` : text;
    document.execCommand('insertHTML', false, htmlToInsert);
    triggerChange();
  };

  return (
    <div
      className={`rounded-xl border transition flex flex-col bg-white overflow-hidden ${
        isFocused
          ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
          : 'border-stone-300 hover:border-stone-400'
      } ${className}`}
    >
      {/* WORD-STYLE FORMATTING TOOLBAR */}
      <div className="bg-stone-50 border-b border-stone-200 px-2 py-1.5 flex flex-wrap items-center justify-between gap-1 select-none">
        {/* Basic Word Formatting Buttons */}
        <div className="flex items-center gap-0.5">
          {/* Bold Button (Ctrl+B) */}
          <button
            type="button"
            onClick={() => format('bold')}
            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
              activeFormats.bold
                ? 'bg-amber-500 text-white shadow-xs font-black'
                : 'text-stone-700 hover:bg-stone-200/80'
            }`}
            title="Tebal / Bold (Ctrl + B)"
          >
            <Bold size={15} />
          </button>

          {/* Italic Button (Ctrl+I) */}
          <button
            type="button"
            onClick={() => format('italic')}
            className={`p-1.5 rounded-lg text-xs transition flex items-center justify-center cursor-pointer ${
              activeFormats.italic
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200/80'
            }`}
            title="Garis Miring / Italic (Ctrl + I)"
          >
            <Italic size={15} />
          </button>

          {/* Underline Button (Ctrl+U) */}
          <button
            type="button"
            onClick={() => format('underline')}
            className={`p-1.5 rounded-lg text-xs transition flex items-center justify-center cursor-pointer ${
              activeFormats.underline
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200/80'
            }`}
            title="Garis Bawah / Underline (Ctrl + U)"
          >
            <Underline size={15} />
          </button>

          {/* Strikethrough Button */}
          <button
            type="button"
            onClick={() => format('strikeThrough')}
            className={`p-1.5 rounded-lg text-xs transition flex items-center justify-center cursor-pointer ${
              activeFormats.strikeThrough
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-stone-700 hover:bg-stone-200/80'
            }`}
            title="Coret Teks / Strikethrough"
          >
            <Strikethrough size={15} />
          </button>

          <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

          {/* Highlight Marker */}
          <button
            type="button"
            onClick={() => format('hiliteColor', '#fef08a')}
            className="p-1.5 rounded-lg text-xs text-stone-700 hover:bg-yellow-100 transition flex items-center justify-center cursor-pointer"
            title="Stabilo Kuning (Highlight)"
          >
            <Highlighter size={15} className="text-amber-600" />
          </button>

          {/* Text Color: Merah / Red for Urgency */}
          <button
            type="button"
            onClick={() => format('foreColor', '#dc2626')}
            className="px-1.5 py-1 rounded-lg text-[11px] font-black text-red-600 hover:bg-red-50 transition flex items-center gap-0.5 cursor-pointer"
            title="Warna Teks Merah"
          >
            A
          </button>

          {/* Text Color: Biru / Blue */}
          <button
            type="button"
            onClick={() => format('foreColor', '#1d4ed8')}
            className="px-1.5 py-1 rounded-lg text-[11px] font-black text-blue-700 hover:bg-blue-50 transition flex items-center gap-0.5 cursor-pointer"
            title="Warna Teks Biru"
          >
            A
          </button>

          {/* Reset Text Color to Black */}
          <button
            type="button"
            onClick={() => format('foreColor', '#000000')}
            className="px-1.5 py-1 rounded-lg text-[11px] font-black text-black hover:bg-stone-200 transition flex items-center gap-0.5 cursor-pointer"
            title="Warna Teks Hitam (Default)"
          >
            A
          </button>

          <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

          {/* Bullet List */}
          <button
            type="button"
            onClick={() => format('insertUnorderedList')}
            className="p-1.5 rounded-lg text-xs text-stone-700 hover:bg-stone-200/80 transition flex items-center justify-center cursor-pointer"
            title="Daftar Poin (Bullet List)"
          >
            <List size={15} />
          </button>

          {/* Numbered List */}
          <button
            type="button"
            onClick={() => format('insertOrderedList')}
            className="p-1.5 rounded-lg text-xs text-stone-700 hover:bg-stone-200/80 transition flex items-center justify-center cursor-pointer"
            title="Daftar Nomor (Numbered List)"
          >
            <ListOrdered size={15} />
          </button>

          {/* Clear Formatting */}
          <button
            type="button"
            onClick={() => format('removeFormat')}
            className="p-1.5 rounded-lg text-xs text-stone-600 hover:bg-stone-200/80 hover:text-red-700 transition flex items-center justify-center cursor-pointer"
            title="Hapus Format (Kembali ke Teks Polos)"
          >
            <RemoveFormatting size={15} />
          </button>

          <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => format('undo')}
            className="p-1.5 rounded-lg text-xs text-stone-600 hover:bg-stone-200/80 transition flex items-center justify-center cursor-pointer"
            title="Urungkan / Undo (Ctrl + Z)"
          >
            <Undo size={14} />
          </button>
          <button
            type="button"
            onClick={() => format('redo')}
            className="p-1.5 rounded-lg text-xs text-stone-600 hover:bg-stone-200/80 transition flex items-center justify-center cursor-pointer"
            title="Ulangi / Redo (Ctrl + Y)"
          >
            <Redo size={14} />
          </button>
        </div>

        {/* Quick word shortcuts badge */}
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-stone-500 font-mono">
          <span className="bg-stone-200/70 text-stone-700 px-1 py-0.5 rounded-md font-semibold">Ctrl+B</span>
          <span>Tebal</span>
          <span className="bg-stone-200/70 text-stone-700 px-1 py-0.5 rounded-md font-semibold ml-1">Ctrl+I</span>
          <span>Miring</span>
          <span className="bg-stone-200/70 text-stone-700 px-1 py-0.5 rounded-md font-semibold ml-1">Ctrl+U</span>
          <span>Garis Bawah</span>
        </div>
      </div>

      {/* QUICK PHRASES SNIPPET BAR */}
      <div className="bg-amber-50/60 border-b border-amber-200/60 px-2 py-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className="text-amber-900 font-bold flex items-center gap-1 shrink-0">
          <Sparkles size={11} className="text-amber-600" />
          Sisipkan Format Cepat:
        </span>
        <button
          type="button"
          onClick={() => insertQuickText(' Sebesar Rp. ', true)}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-amber-300 rounded text-[10px] font-bold transition cursor-pointer"
        >
          <strong>Rp. Nominal</strong>
        </button>
        <button
          type="button"
          onClick={() => insertQuickText(' Invoice No. ... Tanggal ... ', true)}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-amber-300 rounded text-[10px] font-bold transition cursor-pointer"
        >
          <strong>No. Invoice</strong>
        </button>
        <button
          type="button"
          onClick={() => insertQuickText(' PLTU Pelabuhan Ratu ADC', true)}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-amber-300 rounded text-[10px] font-bold transition cursor-pointer"
        >
          <strong>PLTU Pelabuhan Ratu</strong>
        </button>
        <button
          type="button"
          onClick={() => insertQuickText(' DP Tongkang sebesar 50%', true)}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-800 border border-amber-300 rounded text-[10px] font-bold transition cursor-pointer"
        >
          <strong>DP Tongkang 50%</strong>
        </button>
        <button
          type="button"
          onClick={() => insertQuickText(', yaitu Sebesar ')}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-700 border border-amber-200 rounded text-[10px] transition cursor-pointer"
        >
          yaitu Sebesar
        </button>
        <button
          type="button"
          onClick={() => insertQuickText(' dapat di Transfer ke :')}
          className="px-1.5 py-0.5 bg-white hover:bg-amber-100 text-stone-700 border border-amber-200 rounded text-[10px] transition cursor-pointer"
        >
          dapat di Transfer ke :
        </button>
      </div>

      {/* RICH TEXT EDITABLE CONTENT AREA (Word Style) */}
      <div
        ref={editorRef}
        contentEditable
        onFocus={() => {
          setIsFocused(true);
          updateActiveFormats();
        }}
        onBlur={() => {
          setIsFocused(false);
          triggerChange();
        }}
        onInput={triggerChange}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className="p-3.5 min-h-[140px] max-h-[360px] overflow-y-auto text-xs leading-relaxed text-stone-900 focus:outline-none font-sans memo-editor-surface selection:bg-amber-200 selection:text-black"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />

      {/* FOOTER BAR: HINT & SHORTCUT INFO */}
      <div className="bg-stone-50 border-t border-stone-200 px-3 py-1.5 flex items-center justify-between text-[10px] text-stone-500 font-sans">
        <span className="flex items-center gap-1">
          <Info size={12} className="text-stone-400" />
          Blok kata untuk memilih tombol format tebal, miring, atau garis bawah seperti di Microsoft Word.
        </span>
        <span className="font-mono text-stone-400">Word Rich Text</span>
      </div>
    </div>
  );
};
