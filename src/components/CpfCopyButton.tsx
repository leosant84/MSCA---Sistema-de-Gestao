import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface CpfCopyButtonProps {
  cpf?: string | null;
  className?: string;
}

export const CpfCopyButton: React.FC<CpfCopyButtonProps> = ({ cpf, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const rawCpf = (cpf || '').replace(/\D/g, '');

  if (!rawCpf) {
    return <span className="text-gray-300 text-xs">-</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawCpf);
    setCopied(true);
    toast(`CPF copiado sem máscara: ${rawCpf}`, 'success');

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Clique para copiar CPF (sem máscara)"
      className={`inline-flex items-center space-x-1 font-mono text-[11px] text-stone-700 hover:text-stone-900 font-semibold bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-all shadow-2xs cursor-pointer group ${className}`}
    >
      <span>{rawCpf}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-600 animate-pulse ml-0.5" />
      ) : (
        <Copy className="w-3 h-3 text-stone-400 group-hover:text-stone-600 ml-0.5 transition-colors" />
      )}
    </button>
  );
};
