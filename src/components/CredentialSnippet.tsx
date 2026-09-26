import React, { useState } from 'react';
import { Copy, Eye, EyeOff, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface CredentialSnippetProps {
  label: string;
  login?: string | null;
  senha?: string | null;
}

export const CredentialSnippet: React.FC<CredentialSnippetProps> = ({
  label,
  login,
  senha,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<'login' | 'senha' | null>(null);
  const { toast } = useToast();

  if (!login && !senha) {
    return <span className="text-gray-300 text-xs">-</span>;
  }

  const copyToClipboard = (text: string, fieldName: 'login' | 'senha') => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast(`${label} (${fieldName}) copiado com sucesso!`, 'success');
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="flex flex-col space-y-0.5 text-xs py-0.5">
      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
        {label}
      </div>

      {login && (
        <div className="flex items-center space-x-1.5 group">
          <span className="truncate max-w-[130px] text-stone-700 font-mono text-[11px]" title={login}>
            {login}
          </span>
          <button
            type="button"
            onClick={() => copyToClipboard(login, 'login')}
            className="p-0.5 text-stone-400 hover:text-amber-700 transition-colors"
            title={`Copiar Login do ${label}`}
          >
            {copiedField === 'login' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      )}

      {senha && (
        <div className="flex items-center space-x-1.5 group">
          <span className="text-amber-500 font-bold tracking-widest text-xs select-none">
            {showPassword ? senha : '★★★★★★★★'}
          </span>
          <button
            type="button"
            onClick={() => copyToClipboard(senha, 'senha')}
            className="p-0.5 text-stone-400 hover:text-amber-700 transition-colors"
            title={`Copiar Senha do ${label}`}
          >
            {copiedField === 'senha' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="p-0.5 text-stone-400 hover:text-stone-600 transition-colors"
            title={showPassword ? 'Ocultar Senha' : 'Ver Senha'}
          >
            {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
};
