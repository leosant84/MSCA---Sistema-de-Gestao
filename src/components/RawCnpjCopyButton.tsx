import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface RawCnpjCopyButtonProps {
  cnpj?: string | null;
  className?: string;
}

export const RawCnpjCopyButton: React.FC<RawCnpjCopyButtonProps> = ({ cnpj, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const rawCnpj = (cnpj || '').replace(/\D/g, '');

  if (!rawCnpj) {
    return <span className="text-gray-300 text-xs">-</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawCnpj);
    setCopied(true);
    toast(`CNPJ copiado sem máscara: ${rawCnpj}`, 'success');

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Clique para copiar CNPJ (sem máscara)"
      className={`inline-flex items-center space-x-1 font-mono text-[10px] text-stone-700 hover:text-stone-900 font-semibold bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 hover:border-slate-300 transition-all shadow-2xs cursor-pointer group ${className}`}
    >
      <span>{rawCnpj}</span>
      {copied ? (
        <Check className="w-2.5 h-2.5 text-emerald-600 animate-pulse ml-0.5" />
      ) : (
        <Copy className="w-2.5 h-2.5 text-stone-400 group-hover:text-stone-600 ml-0.5 transition-colors" />
      )}
    </button>
  );
};
