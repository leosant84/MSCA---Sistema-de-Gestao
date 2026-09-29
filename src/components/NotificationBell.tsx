import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types';

export const NotificationBell: React.FC = () => {
  const { user, role, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const data = await notificationService.getNotifications(user?.id, role || undefined);
      setNotifications(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadNotifications();

    const handleUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('msca_notification_received', handleUpdate);
    window.addEventListener('msca_notifications_updated', handleUpdate);

    // Polling a cada 30 segundos
    const interval = setInterval(loadNotifications, 30000);

    return () => {
      window.removeEventListener('msca_notification_received', handleUpdate);
      window.removeEventListener('msca_notifications_updated', handleUpdate);
      clearInterval(interval);
    };
  }, [user?.id, role]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await notificationService.markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    await notificationService.markAllAsRead(user?.id, role || undefined);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setLoading(false);
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Agora';
      if (diffMins < 60) return `${diffMins}m atrás`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h atrás`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d atrás`;
    } catch {
      return '';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botão Sininho */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-2xl text-stone-600 hover:text-stone-900 hover:bg-slate-100/90 transition-all cursor-pointer border border-slate-200/60 shadow-2xs group"
        title="Central de Notificações e Validações"
        aria-label="Abrir notificações"
      >
        <Bell className="w-4 h-4 transition-transform group-hover:rotate-12" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-extrabold shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Painel de Notificações */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-stone-200/90 py-3 z-50 animate-in fade-in zoom-in-95">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 pb-2.5 border-b border-stone-100">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-stone-800">Notificações</span>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[10px]">
                  {unreadCount} nova(s)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-stone-500 font-medium text-[10px]">
                  Tudo lido
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-[11px] font-medium text-[#A67C2E] hover:text-[#7A5B20] inline-flex items-center space-x-1 cursor-pointer transition-colors"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar todas como lidas</span>
              </button>
            )}
          </div>

          {/* Lista de Alertas */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-stone-100">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                <Bell className="w-8 h-8 text-stone-300 mx-auto mb-2 opacity-50" />
                <span>Nenhuma notificação no momento.</span>
              </div>
            ) : (
              notifications.map((n) => {
                const isPending100 = n.type === 'APURACAO_100_PERCENT';
                const isNeedsReview = n.type === 'APURACAO_NEEDS_REVIEW';
                const isApproved = n.type === 'APURACAO_APPROVED';

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 px-4 transition-colors cursor-pointer flex items-start space-x-3 text-left ${
                      !n.read ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Ícone contextual */}
                    <div className="mt-0.5 shrink-0">
                      {isPending100 ? (
                        <div className="w-7 h-7 rounded-xl bg-amber-100 text-[#C5A059] flex items-center justify-center border border-amber-300/60 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                      ) : isNeedsReview ? (
                        <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200 shadow-2xs">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : isApproved ? (
                        <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-xl bg-slate-100 text-stone-600 flex items-center justify-center">
                          <Building className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-stone-900 truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-stone-400 whitespace-nowrap">
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-stone-600 mt-0.5 leading-snug line-clamp-2">
                        {n.message}
                      </p>

                      {/* Footer do card com tags contextuais */}
                      <div className="flex items-center space-x-2 mt-1.5 text-[10px]">
                        {n.client_name && (
                          <span className="font-semibold text-stone-700 bg-stone-100 px-1.5 py-0.2 rounded">
                            {n.client_name}
                          </span>
                        )}
                        {n.competencia && (
                          <span className="font-mono text-stone-500 bg-stone-50 px-1 rounded border border-stone-200">
                            {n.competencia}
                          </span>
                        )}
                        {n.link && (
                          <span className="text-[#A67C2E] font-medium inline-flex items-center space-x-0.5 ml-auto">
                            <span>Ver</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Marcador de não lida */}
                    {!n.read && (
                      <div
                        onClick={(e) => handleMarkAsRead(n.id, e)}
                        className="w-2 h-2 rounded-full bg-[#C5A059] shrink-0 mt-2 hover:scale-125 transition-transform"
                        title="Marcar como lida"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Rodapé com info de perfil */}
          <div className="pt-2 px-4 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
            <span>Central MSCA • {isAdmin ? 'Perfil Administrador' : 'Perfil Operador'}</span>
            <span className="text-stone-300">Atualização em tempo real</span>
          </div>
        </div>
      )}
    </div>
  );
};
