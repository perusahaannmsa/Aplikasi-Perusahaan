import React, { useRef, useEffect, useState, useCallback } from 'react';

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
  const format = (command: string, val: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, val);
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

  return (
    <div
      className={`rounded-xl border transition flex flex-col bg-white overflow-hidden ${
        isFocused
          ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
          : 'border-stone-300 hover:border-stone-400'
      } ${className}`}
    >
      {/* WORD-STYLE FORMATTING TOOLBAR - CLEAN TEXT BUTTONS ONLY (NO ICON PICTURES / NO EXTRA TEXT) */}
      <div className="bg-stone-50 border-b border-stone-200 px-2 py-1.5 flex flex-wrap items-center gap-1 select-none">
        {/* Tombol Tebal (B) */}
        <button
          type="button"
          onClick={() => format('bold')}
          className={`h-7 px-2.5 rounded-md text-xs font-black transition cursor-pointer border ${
            activeFormats.bold
              ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
              : 'bg-white border-stone-300 text-stone-900 hover:bg-stone-100'
          }`}
          title="Tebal / Bold (Ctrl + B)"
        >
          <strong>B</strong>
        </button>

        {/* Tombol Miring (I) */}
        <button
          type="button"
          onClick={() => format('italic')}
          className={`h-7 px-2.5 rounded-md text-xs italic font-serif font-bold transition cursor-pointer border ${
            activeFormats.italic
              ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
              : 'bg-white border-stone-300 text-stone-900 hover:bg-stone-100'
          }`}
          title="Miring / Italic (Ctrl + I)"
        >
          <em>I</em>
        </button>

        {/* Tombol Garis Bawah (U) */}
        <button
          type="button"
          onClick={() => format('underline')}
          className={`h-7 px-2.5 rounded-md text-xs underline font-bold transition cursor-pointer border ${
            activeFormats.underline
              ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
              : 'bg-white border-stone-300 text-stone-900 hover:bg-stone-100'
          }`}
          title="Garis Bawah / Underline (Ctrl + U)"
        >
          <u>U</u>
        </button>

        {/* Tombol Coret (S) */}
        <button
          type="button"
          onClick={() => format('strikeThrough')}
          className={`h-7 px-2.5 rounded-md text-xs line-through font-bold transition cursor-pointer border ${
            activeFormats.strikeThrough
              ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
              : 'bg-white border-stone-300 text-stone-900 hover:bg-stone-100'
          }`}
          title="Coret / Strikethrough"
        >
          <s>S</s>
        </button>

        <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

        {/* Tombol Stabilo */}
        <button
          type="button"
          onClick={() => format('hiliteColor', '#fef08a')}
          className="h-7 px-2.5 rounded-md text-xs font-semibold bg-amber-100/90 hover:bg-amber-200 text-amber-950 border border-amber-300 transition cursor-pointer"
          title="Stabilo Kuning"
        >
          Stabilo
        </button>

        {/* Tombol Warna Teks */}
        <button
          type="button"
          onClick={() => format('foreColor', '#dc2626')}
          className="h-7 px-2 rounded-md text-xs font-bold text-red-600 bg-white hover:bg-red-50 border border-red-200 transition cursor-pointer"
          title="Warna Teks Merah"
        >
          Merah
        </button>
        <button
          type="button"
          onClick={() => format('foreColor', '#1d4ed8')}
          className="h-7 px-2 rounded-md text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 transition cursor-pointer"
          title="Warna Teks Biru"
        >
          Biru
        </button>
        <button
          type="button"
          onClick={() => format('foreColor', '#000000')}
          className="h-7 px-2 rounded-md text-xs font-bold text-black bg-white hover:bg-stone-100 border border-stone-300 transition cursor-pointer"
          title="Warna Teks Hitam (Default)"
        >
          Hitam
        </button>

        <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

        {/* Tombol Daftar Poin & Nomor */}
        <button
          type="button"
          onClick={() => format('insertUnorderedList')}
          className="h-7 px-2 rounded-md text-xs font-medium bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 transition cursor-pointer"
          title="Daftar Poin (Bullet)"
        >
          • Poin
        </button>
        <button
          type="button"
          onClick={() => format('insertOrderedList')}
          className="h-7 px-2 rounded-md text-xs font-medium bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 transition cursor-pointer"
          title="Daftar Nomor"
        >
          1. Nomor
        </button>

        {/* Tombol Hapus Format */}
        <button
          type="button"
          onClick={() => format('removeFormat')}
          className="h-7 px-2 rounded-md text-xs font-medium bg-white hover:bg-stone-100 text-stone-600 hover:text-red-700 border border-stone-300 transition cursor-pointer"
          title="Hapus Format Teks"
        >
          Hapus Format
        </button>

        <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>

        {/* Tombol Undo & Redo */}
        <button
          type="button"
          onClick={() => format('undo')}
          className="h-7 px-2 rounded-md text-xs font-medium bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 transition cursor-pointer"
          title="Urungkan (Undo)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => format('redo')}
          className="h-7 px-2 rounded-md text-xs font-medium bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 transition cursor-pointer"
          title="Ulangi (Redo)"
        >
          Redo
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
        className="p-3.5 min-h-[140px] max-h-[360px] overflow-y-auto text-sm leading-normal text-stone-900 focus:outline-none memo-editor-surface selection:bg-amber-200 selection:text-black"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: "Calibri, 'Calibri (Body)', Aptos, 'Segoe UI', Arial, sans-serif",
          fontSize: '11pt',
          lineHeight: 1.15,
          textAlign: 'justify',
        }}
      />
    </div>
  );
};
