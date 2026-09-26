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
    <aside className="w-56 bg-stone-100/90 text-stone-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-sm border-r border-amber-200/50 backdrop-blur-sm">
      <div>
        {/* Logotipo e Cabeçalho Corporativo */}
        <div className="p-3.5 border-b border-amber-200/40 bg-white/60">
          <div className="w-full flex items-center justify-center">
            <img
              src="/logo-msca.png"
              alt="MS Contadores Associados"
              className="w-full h-auto max-h-12 object-contain"
            />
          </div>
        </div>

        {/* Menu de Navegação */}
        <nav className="p-3 space-y-1">
          <div className="text-[10px] font-bold text-amber-900/60 uppercase tracking-wider px-3 py-1 mb-1">
            Módulos Principais
          </div>

          <NavLink
            to="/clientes"
            className={({ isActive }) =>
              `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#C5A059] text-white shadow-sm shadow-[#C5A059]/30'
                  : 'text-stone-600 hover:bg-amber-100/60 hover:text-amber-950'
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
                  `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#C5A059] text-white shadow-sm shadow-[#C5A059]/30'
                      : 'text-stone-600 hover:bg-amber-100/60 hover:text-amber-950'
                  }`
                }
              >
                <DollarSign className="w-4 h-4 shrink-0" />
                <span>Financeiro</span>
                <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Admin
                </span>
              </NavLink>

              <NavLink
                to="/auditoria"
                className={({ isActive }) =>
                  `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#C5A059] text-white shadow-sm shadow-[#C5A059]/30'
                      : 'text-stone-600 hover:bg-amber-100/60 hover:text-amber-950'
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Auditoria</span>
                <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                  Logs
                </span>
              </NavLink>
            </>
          )}

          {/* Configurações de Senha e Perfil */}
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#C5A059] text-white shadow-sm shadow-[#C5A059]/30'
                  : 'text-stone-600 hover:bg-amber-100/60 hover:text-amber-950'
              }`
            }
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span>Configurações</span>
          </NavLink>
        </nav>
      </div>

      {/* Rodapé: Informações do Usuário e Logout */}
      <div className="p-3 border-t border-amber-200/40 bg-white/40">
        <div className="px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200/60 mb-2">
          <div className="flex items-center space-x-2">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
            ) : (
              <UserCheck className="w-4 h-4 text-stone-500 shrink-0" />
            )}
            <div className="truncate flex-1">
              <div className="text-xs font-bold text-stone-800 truncate">
                {profile?.full_name || profile?.email || 'Usuário'}
              </div>
              <div className="text-[9px] text-amber-800/80 uppercase font-semibold tracking-wider">
                {role || 'Colaborador'}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium text-stone-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
};
