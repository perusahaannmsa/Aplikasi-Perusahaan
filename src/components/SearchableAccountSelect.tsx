import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface AccurateAccountOption {
  code: string;
  name: string;
}

interface SearchableAccountSelectProps {
  value: string;
  onChange: (code: string) => void;
  accounts: AccurateAccountOption[];
  placeholder?: string;
  excludeCode?: string;
  className?: string;
  compact?: boolean;
  buttonClassName?: string;
}

export const SearchableAccountSelect: React.FC<SearchableAccountSelectProps> = ({
  value,
  onChange,
  accounts,
  placeholder = '-- Pilih Akun Accurate --',
  excludeCode,
  className = '',
  compact = false,
  buttonClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter accounts based on excludeCode
  const availableAccounts = useMemo(() => {
    if (!excludeCode) return accounts;
    return accounts.filter((a) => a.code !== excludeCode);
  }, [accounts, excludeCode]);

  // Filter accounts based on search query (matches code or name)
  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) return availableAccounts;
    const term = searchTerm.toLowerCase().trim();
    return availableAccounts.filter(
      (a) =>
        a.code.toLowerCase().includes(term) ||
        a.name.toLowerCase().includes(term)
    );
  }, [availableAccounts, searchTerm]);

  // Selected account object
  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.code === value);
  }, [accounts, value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setHighlightedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-account-item]');
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredAccounts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredAccounts.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAccounts[highlightedIndex]) {
        handleSelect(filteredAccounts[highlightedIndex].code);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left w-full font-sans ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-stone-300 hover:border-emerald-500 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-900 shadow-3xs transition focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
          compact ? 'py-1 text-[11px]' : 'py-2'
        } ${buttonClassName}`}
      >
        <span className="truncate flex-1 text-left">
          {selectedAccount ? (
            <span className="font-bold">
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1.5 font-mono text-[11px]">
                [{selectedAccount.code}]
              </span>
              <span className="text-stone-900 font-sans">{selectedAccount.name}</span>
            </span>
          ) : (
            <span className="text-stone-400 font-normal">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`text-stone-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-600' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-full min-w-[280px] sm:min-w-[340px] max-w-lg bg-white border border-stone-300 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input Header */}
          <div className="p-2.5 border-b border-stone-200 bg-stone-50">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-stone-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Cari kode (600006) atau nama akun (Transportasi)..."
                className="w-full pl-9 pr-8 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 text-stone-400 hover:text-stone-700 p-0.5 rounded"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-stone-500 font-mono">
              <span>
                {filteredAccounts.length} akun ditemukan
              </span>
              <span className="text-stone-400">
                Gunakan ↑↓ dan Enter
              </span>
            </div>
          </div>

          {/* Accounts List */}
          <div
            ref={listRef}
            className="max-h-60 overflow-y-auto divide-y divide-stone-100 p-1 font-mono text-xs"
          >
            {filteredAccounts.length === 0 ? (
              <div className="p-4 text-center text-stone-400 text-xs font-mono">
                Tidak ada akun yang cocok dengan "{searchTerm}"
              </div>
            ) : (
              filteredAccounts.map((acc, idx) => {
                const isSelected = acc.code === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={acc.code}
                    type="button"
                    data-account-item
                    onClick={() => handleSelect(acc.code)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded-xl transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200'
                        : isHighlighted
                        ? 'bg-stone-100 text-stone-900'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                          isSelected
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : 'bg-stone-200/80 text-stone-800'
                        }`}
                      >
                        [{acc.code}]
                      </span>
                      <span className="truncate font-sans font-medium text-stone-900">
                        {acc.name}
                      </span>
                    </div>

                    {isSelected && (
                      <Check size={14} className="text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
