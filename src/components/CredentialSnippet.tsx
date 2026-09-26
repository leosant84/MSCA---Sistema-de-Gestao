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
    <div className="flex flex-col space-y-1 text-xs bg-gray-50/80 p-1.5 rounded border border-gray-100">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </div>

      {login && (
        <div className="flex items-center justify-between space-x-1 group">
          <span className="truncate max-w-[120px] text-gray-700 font-mono text-[11px]" title={login}>
            {login}
          </span>
          <button
            type="button"
            onClick={() => copyToClipboard(login, 'login')}
            className="p-0.5 text-gray-400 hover:text-[#C5A059] transition-colors"
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
        <div className="flex items-center justify-between space-x-1 group">
          <span className="text-gray-700 font-mono text-[11px]">
            {showPassword ? senha : '••••••••'}
          </span>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
              title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
            >
              {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(senha, 'senha')}
              className="p-0.5 text-gray-400 hover:text-[#C5A059] transition-colors"
              title={`Copiar Senha do ${label}`}
            >
              {copiedField === 'senha' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
