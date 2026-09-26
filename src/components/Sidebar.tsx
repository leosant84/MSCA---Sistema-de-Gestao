import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Users, DollarSign, LogOut, ShieldCheck, UserCheck, ShieldAlert, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Sidebar: React.FC = () => {
  const { profile, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-white/70 backdrop-blur-md text-stone-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 border-r border-slate-200/60 shadow-sm z-20">
      <div>
        {/* Logotipo e Cabeçalho Corporativo com efeito refinado */}
        <div className="p-4 border-b border-slate-100/80 bg-white/40">
          <div className="w-full flex items-center justify-center">
            <img
              src="/logo-msca.png"
              alt="MS Contadores Associados"
              className="w-full h-auto max-h-12 object-contain"
            />
          </div>
        </div>

        {/* Menu de Navegação */}
        <nav className="p-3.5 space-y-1.5">
          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-3 py-1 mb-1">
            Módulos Principais
          </div>

          <NavLink
            to="/clientes"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                  : 'text-stone-600 hover:bg-slate-100/80 hover:text-stone-900'
              }`
            }
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clientes</span>
          </NavLink>

          {/* O menu de Financeiro só é renderizado se for admin */}
          {isAdmin && (
            <>
              <NavLink
                to="/financeiro"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                      : 'text-stone-600 hover:bg-slate-100/80 hover:text-stone-900'
                  }`
                }
              >
                <DollarSign className="w-4 h-4 shrink-0" />
                <span>Financeiro</span>
                <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-stone-500 border border-slate-200">
                  Admin
                </span>
              </NavLink>

              <NavLink
                to="/auditoria"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                      : 'text-stone-600 hover:bg-slate-100/80 hover:text-stone-900'
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Auditoria</span>
                <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-stone-500 border border-slate-200">
                  Logs
                </span>
              </NavLink>
            </>
          )}

          {/* Configurações de Senha e Perfil */}
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#C5A059] to-[#D4B26F] text-white shadow-md shadow-[#C5A059]/25 scale-[1.02]'
                  : 'text-stone-600 hover:bg-slate-100/80 hover:text-stone-900'
              }`
            }
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span>Configurações</span>
          </NavLink>
        </nav>
      </div>

      {/* Rodapé: Informações do Usuário e Logout */}
      <div className="p-3.5 border-t border-slate-100/80 bg-white/40">
        <div className="px-3.5 py-2.5 rounded-2xl bg-white/90 border border-slate-200/60 shadow-xs mb-2.5">
          <div className="flex items-center space-x-2.5">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
            ) : (
              <UserCheck className="w-4 h-4 text-stone-500 shrink-0" />
            )}
            <div className="truncate flex-1">
              <div className="text-xs font-bold text-stone-800 truncate">
                {profile?.full_name || profile?.email || 'Usuário'}
              </div>
              <div className="text-[10px] text-amber-800 uppercase font-semibold tracking-wider">
                {role || 'Colaborador'}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium text-stone-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
};
