import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Users, DollarSign, LogOut, ShieldCheck, UserCheck, ShieldAlert, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const TopNavbar: React.FC = () => {
  const { profile, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-white/85 backdrop-blur-md border-b border-slate-200/70 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Lado Esquerdo: Logotipo MSCA */}
          <div className="flex items-center space-x-6 shrink-0">
            <NavLink to="/clientes" className="flex items-center">
              <img
                src="/logo-msca.png"
                alt="MS Contadores Associados"
                className="h-10 w-auto object-contain mix-blend-multiply"
              />
            </NavLink>

            {/* Separador vertical elegante */}
            <div className="hidden md:block h-6 w-px bg-slate-200" />
          </div>

          {/* Centro: Links de Navegação em Formato de Barra de Abas / Pílulas */}
          <nav className="flex items-center space-x-1.5 overflow-x-auto py-1 scrollbar-none">
            <NavLink
              to="/clientes"
              className={({ isActive }) =>
                `inline-flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                    : 'text-stone-600 hover:bg-slate-100/90 hover:text-stone-900'
                }`
              }
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Clientes</span>
            </NavLink>

            {isAdmin && (
              <>
                <NavLink
                  to="/financeiro"
                  className={({ isActive }) =>
                    `inline-flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                        : 'text-stone-600 hover:bg-slate-100/90 hover:text-stone-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <DollarSign className="w-4 h-4 shrink-0" />
                      <span>Financeiro</span>
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border ${
                        isActive
                          ? 'bg-white/20 text-white border-white/30'
                          : 'bg-slate-100 text-stone-500 border-slate-200'
                      }`}>
                        Admin
                      </span>
                    </>
                  )}
                </NavLink>

                <NavLink
                  to="/auditoria"
                  className={({ isActive }) =>
                    `inline-flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                        : 'text-stone-600 hover:bg-slate-100/90 hover:text-stone-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Auditoria</span>
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border ${
                        isActive
                          ? 'bg-white/20 text-white border-white/30'
                          : 'bg-slate-100 text-stone-500 border-slate-200'
                      }`}>
                        Logs
                      </span>
                    </>
                  )}
                </NavLink>
              </>
            )}

            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                `inline-flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                    : 'text-stone-600 hover:bg-slate-100/90 hover:text-stone-900'
                }`
              }
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              <span>Configurações</span>
            </NavLink>
          </nav>

          {/* Lado Direito: Perfil do Usuário e Botão Sair */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Chip de Usuário */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-2xl bg-white/90 border border-slate-200/70 shadow-2xs">
              <div className="w-7 h-7 rounded-xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200/60 shrink-0">
                {isAdmin ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="text-left max-w-[130px] truncate">
                <div className="text-xs font-bold text-stone-800 truncate leading-tight">
                  {profile?.full_name || profile?.email || 'Usuário'}
                </div>
                <div className="text-[9px] text-[#9E7B35] uppercase font-bold tracking-wider">
                  {role || 'Colaborador'}
                </div>
              </div>
            </div>

            {/* Botão Sair do Sistema */}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-rose-600 hover:bg-rose-50/80 border border-slate-200/60 hover:border-rose-100 transition-all cursor-pointer"
              title="Sair do sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
