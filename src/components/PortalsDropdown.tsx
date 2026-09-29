import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import type { ClientCredential } from '../types';

interface PortalItem {
  id: string;
  label: string;
  login?: string | null;
  senha?: string | null;
}

interface PortalsDropdownProps {
  loginPrefeitura?: string | null;
  senhaPrefeitura?: string | null;
  loginPostoFiscal?: string | null;
  senhaPostoFiscal?: string | null;
  extraCredentials?: ClientCredential[] | null;
}

export const PortalsDropdown: React.FC<PortalsDropdownProps> = ({
  loginPrefeitura,
  senhaPrefeitura,
  loginPostoFiscal,
  senhaPostoFiscal,
  extraCredentials,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const portals: PortalItem[] = [];

  if (loginPrefeitura || senhaPrefeitura) {
    portals.push({
      id: 'prefeitura',
      label: 'Prefeitura',
      login: loginPrefeitura,
      senha: senhaPrefeitura,
    });
  }

  if (loginPostoFiscal || senhaPostoFiscal) {
    portals.push({
      id: 'posto_fiscal',
      label: 'Posto Fiscal',
      login: loginPostoFiscal,
      senha: senhaPostoFiscal,
    });
  }

  if (extraCredentials && extraCredentials.length > 0) {
    extraCredentials.forEach((ec) => {
      if (ec.login || ec.senha) {
        portals.push({
          id: ec.id,
          label: ec.sistema_nome,
          login: ec.login,
          senha: ec.senha,
        });
      }
    });
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = (text: string, key: string, label: string, fieldType: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMap((prev) => ({ ...prev, [key]: true }));
    toast(`${label} (${fieldType}) copiado!`, 'success');
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [key]: false }));
    }, 1800);
  };

  const togglePassword = (id: string) => {
    setShowPasswordMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggle = () => {
    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Se tiver menos de 300px abaixo e mais de 200px acima, abre para cima
      if (spaceBelow < 300 && rect.top > 200) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
    }
    setIsOpen((prev) => !prev);
  };

  if (portals.length === 0) {
    return <span className="text-gray-300 text-[11px]">-</span>;
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg border border-amber-200/80 bg-amber-50/60 hover:bg-amber-100/80 text-stone-800 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer group"
      >
        <Globe className="w-3 h-3 text-[#C5A059]" />
        <span>Portais</span>
        <span className="px-1 py-0.2 rounded-full bg-[#C5A059]/20 text-[#A67C2E] font-bold text-[9px]">
          {portals.length}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-stone-400 group-hover:text-stone-600 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute left-0 ${
            openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } w-72 bg-white rounded-2xl shadow-2xl border border-stone-200/80 py-2 px-2.5 z-50 animate-in fade-in zoom-in-95`}
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-stone-100 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
            <span>Acessos aos Portais ({portals.length})</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {portals.map((p) => {
              const isShowingPass = !!showPasswordMap[p.id];
              const loginCopied = !!copiedMap[`${p.id}_login`];
              const passCopied = !!copiedMap[`${p.id}_pass`];

              return (
                <div
                  key={p.id}
                  className="p-2 rounded-xl bg-slate-50/70 border border-slate-100 flex flex-col space-y-1 hover:bg-amber-50/40 transition-colors"
                >
                  <div className="text-[10px] font-bold text-[#A67C2E] uppercase tracking-wide">
                    {p.label}
                  </div>

                  {/* Linha de Login */}
                  {p.login && (
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <div className="flex items-center space-x-1 truncate">
                        <span className="text-stone-400 text-[9px] uppercase font-bold">Log:</span>
                        <span className="font-mono text-stone-800 truncate" title={p.login}>
                          {p.login}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(p.login!, `${p.id}_login`, p.label, 'Login')}
                        className="p-1 rounded text-stone-400 hover:text-amber-700 hover:bg-amber-100/50 transition-colors shrink-0"
                        title="Copiar Login"
                      >
                        {loginCopied ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Linha de Senha */}
                  {p.senha && (
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <div className="flex items-center space-x-1 truncate">
                        <span className="text-stone-400 text-[9px] uppercase font-bold">Sen:</span>
                        <span className="font-mono text-stone-800 tracking-wider truncate">
                          {isShowingPass ? p.senha : '••••••••'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => togglePassword(p.id)}
                          className="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-200/50 transition-colors"
                          title={isShowingPass ? 'Ocultar Senha' : 'Ver Senha'}
                        >
                          {isShowingPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(p.senha!, `${p.id}_pass`, p.label, 'Senha')}
                          className="p-1 rounded text-stone-400 hover:text-amber-700 hover:bg-amber-100/50 transition-colors"
                          title="Copiar Senha"
                        >
                          {passCopied ? (
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
            })}
          </div>
        </div>
      )}
    </div>
  );
};
