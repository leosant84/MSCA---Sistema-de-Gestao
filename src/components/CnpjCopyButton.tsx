import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface CnpjCopyButtonProps {
  cnpj?: string | null;
  className?: string;
}

export const CnpjCopyButton: React.FC<CnpjCopyButtonProps> = ({ cnpj, className = '' }) => {
  const [copiedFormat, setCopiedFormat] = useState<'masked' | 'raw' | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const rawCnpj = (cnpj || '').replace(/\D/g, '');
  
  const formatCnpj = (val: string) => {
    if (!val || val.length !== 14) return val || '-';
    return val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const maskedCnpj = formatCnpj(rawCnpj);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!rawCnpj) {
    return <span className="text-gray-400 text-xs">-</span>;
  }

  const handleCopy = (format: 'masked' | 'raw', e?: React.MouseEvent) => {
    e?.stopPropagation();
    const textToCopy = format === 'masked' ? maskedCnpj : rawCnpj;
    navigator.clipboard.writeText(textToCopy);
    setCopiedFormat(format);
    setDropdownOpen(false);

    if (format === 'masked') {
      toast(`CNPJ copiado com máscara: ${maskedCnpj}`, 'success');
    } else {
      toast(`CNPJ copiado sem máscara: ${rawCnpj}`, 'success');
    }

    setTimeout(() => {
      setCopiedFormat(null);
    }, 2000);
  };

  return (
    <div className={`relative inline-flex items-center group ${className}`} ref={dropdownRef}>
      {/* Botão Principal com clique duplo ou simples */}
      <button
        type="button"
        onClick={(e) => handleCopy('masked', e)}
        onDoubleClick={(e) => handleCopy('raw', e)}
        title="Clique simples: Copiar com máscara | Duplo clique: Copiar sem máscara"
        className="inline-flex items-center space-x-1.5 font-mono text-xs text-stone-800 hover:text-amber-900 font-semibold bg-amber-50/70 hover:bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-200/60 hover:border-amber-300 transition-all shadow-xs"
      >
        <span>{maskedCnpj}</span>
        {copiedFormat ? (
          <Check className="w-3.5 h-3.5 text-emerald-600 animate-pulse ml-1" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-amber-700/60 group-hover:text-amber-800 ml-1 transition-colors" />
        )}
      </button>

      {/* Botão de Menu de Opções */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDropdownOpen((prev) => !prev);
        }}
        aria-label="Opções de cópia do CNPJ"
        className="ml-0.5 p-1 text-gray-400 hover:text-[#C5A059] rounded hover:bg-gray-100 transition-colors"
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown Menu de Contexto */}
      {dropdownOpen && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-40 text-left animate-in fade-in zoom-in-95">
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Opções de Cópia
          </div>
          <button
            type="button"
            onClick={(e) => handleCopy('masked', e)}
            className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-amber-50 hover:text-[#C5A059] flex items-center justify-between"
          >
            <span>Copiar com máscara</span>
            <span className="font-mono text-[10px] text-gray-400">XX.XXX...</span>
          </button>
          <button
            type="button"
            onClick={(e) => handleCopy('raw', e)}
            className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-amber-50 hover:text-[#C5A059] flex items-center justify-between"
          >
            <span>Copiar sem máscara</span>
            <span className="font-mono text-[10px] text-gray-400">Apenas núm.</span>
          </button>
        </div>
      )}
    </div>
  );
};
