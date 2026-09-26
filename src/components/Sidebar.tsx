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
    <aside className="w-64 bg-[#1E2022] text-white flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-lg border-r border-[#2B2D2F]">
      <div>
        {/* Logotipo e Cabeçalho Corporativo */}
        <div className="p-4 border-b border-[#2B2D2F]">
          <div className="w-full flex items-center justify-center">
            <img
              src="/logo-msca-dark.png"
              alt="MSCA - Sistema de Gestão"
              className="w-full h-auto max-h-14 object-contain rounded"
            />
          </div>
        </div>

        {/* Menu de Navegação */}
        <nav className="p-4 space-y-1.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Módulos Principais
          </div>

          <NavLink
            to="/clientes"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#C5A059] text-white shadow-md'
                  : 'text-gray-300 hover:bg-[#2B2D2F] hover:text-white'
              }`
            }
          >
            <Users className="w-4 h-4" />
            <span>Clientes</span>
          </NavLink>

          {/* O menu de Financeiro só é renderizado se for admin */}
          {isAdmin && (
            <>
              <NavLink
                to="/financeiro"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#C5A059] text-white shadow-md'
                      : 'text-gray-300 hover:bg-[#2B2D2F] hover:text-white'
                  }`
                }
              >
                <DollarSign className="w-4 h-4" />
                <span>Financeiro</span>
                <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Admin
                </span>
              </NavLink>

              <NavLink
                to="/auditoria"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#C5A059] text-white shadow-md'
                      : 'text-gray-300 hover:bg-[#2B2D2F] hover:text-white'
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Auditoria</span>
                <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Logs
                </span>
              </NavLink>
            </>
          )}

          {/* Configurações de Senha e Perfil acessível a todos os usuários autenticados */}
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#C5A059] text-white shadow-md'
                  : 'text-gray-300 hover:bg-[#2B2D2F] hover:text-white'
              }`
            }
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Configurações</span>
          </NavLink>
        </nav>
      </div>

      {/* Rodapé: Informações do Usuário e Logout */}
      <div className="p-4 border-t border-[#2B2D2F]">
        <div className="px-3 py-2 rounded-lg bg-[#2B2D2F]/60 mb-3">
          <div className="flex items-center space-x-2">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-[#C5A059]" />
            ) : (
              <UserCheck className="w-4 h-4 text-gray-400" />
            )}
            <div className="truncate flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {profile?.full_name || profile?.email || 'Usuário'}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                {role || 'Colaborador'}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-red-950/40 border border-transparent hover:border-red-800/50 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
};
