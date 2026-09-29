import { supabase } from '../lib/supabase';
import type { AppNotification, NotificationType, UserRole } from '../types';

const LOCAL_STORAGE_KEY = 'msca_notifications_cache';

// Carregar notificações salvas localmente como fallback resiliente
function getLocalNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalNotifications(list: AppNotification[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // ignorar quota de storage
  }
}

export const notificationService = {
  /**
   * Busca notificações para o usuário atual (baseado em seu ID e sua Role)
   */
  async getNotifications(userId?: string, userRole?: UserRole): Promise<AppNotification[]> {
    try {
      // Tentar buscar da tabela 'notifications' do Supabase se existir
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);

      if (userRole === 'admin') {
        // Admins recebem notificações direcionadas a 'admin' ou ao seu ID ou broadcast
        query = query.or(`recipient_role.eq.admin,recipient_id.eq.${userId || 'null'},recipient_id.is.null`);
      } else if (userId) {
        // Colaboradores recebem notificações direcionadas ao seu ID ou broadcast para colaboradores
        query = query.or(`recipient_id.eq.${userId},recipient_role.eq.colaborador,recipient_id.is.null`);
      }

      const { data, error } = await query;

      if (!error && data) {
        const remoteList = data as AppNotification[];
        // Mesclar com cache local para itens locais recém-criados
        const localList = getLocalNotifications();
        const mergedMap = new Map<string, AppNotification>();
        remoteList.forEach((n) => mergedMap.set(n.id, n));
        localList.forEach((n) => {
          if (!mergedMap.has(n.id)) {
            // Filtrar se relevante para a role
            if (userRole === 'admin' && n.recipient_role === 'admin') mergedMap.set(n.id, n);
            else if (userRole !== 'admin' && (n.recipient_id === userId || n.recipient_role === 'colaborador')) {
              mergedMap.set(n.id, n);
            }
          }
        });
        const combined = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        saveLocalNotifications(combined);
        return combined;
      }
    } catch {
      // Silenciar erro do Supabase caso a tabela ainda não exista fisicamente
    }

    // Fallback: Retornar do armazenamento local
    const local = getLocalNotifications();
    if (userRole === 'admin') {
      return local.filter((n) => n.recipient_role === 'admin' || !n.recipient_role);
    }
    return local.filter((n) => n.recipient_id === userId || n.recipient_role === 'colaborador' || !n.recipient_role);
  },

  /**
   * Cria e dispara uma nova notificação
   */
  async createNotification(payload: {
    title: string;
    message: string;
    type: NotificationType;
    recipient_id?: string | null;
    recipient_role?: UserRole | null;
    sender_id?: string | null;
    sender_name?: string | null;
    client_id?: string | null;
    client_name?: string | null;
    competencia?: string | null;
    regime?: string | null;
    link?: string | null;
  }): Promise<AppNotification> {
    const newNotif: AppNotification = {
      id: crypto.randomUUID(),
      title: payload.title,
      message: payload.message,
      type: payload.type,
      recipient_id: payload.recipient_id || null,
      recipient_role: payload.recipient_role || null,
      sender_id: payload.sender_id || null,
      sender_name: payload.sender_name || 'Sistema',
      client_id: payload.client_id || null,
      client_name: payload.client_name || null,
      competencia: payload.competencia || null,
      regime: payload.regime || null,
      read: false,
      link: payload.link || null,
      created_at: new Date().toISOString(),
    };

    // Tentar persistir no Supabase
    try {
      await supabase.from('notifications').insert([newNotif]);
    } catch {
      // Ignorar falha caso tabela não exista ainda
    }

    // Salvar no storage local
    const local = getLocalNotifications();
    const updated = [newNotif, ...local.filter((n) => n.id !== newNotif.id)];
    saveLocalNotifications(updated);

    // Disparar evento customizado de window para atualização instantânea na interface
    window.dispatchEvent(new CustomEvent('msca_notification_received', { detail: newNotif }));

    return newNotif;
  },

  /**
   * Marca uma notificação individual como lida
   */
  async markAsRead(id: string): Promise<void> {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    } catch {
      // ignore
    }

    const local = getLocalNotifications();
    const updated = local.map((n) => (n.id === id ? { ...n, read: true } : n));
    saveLocalNotifications(updated);
    window.dispatchEvent(new CustomEvent('msca_notifications_updated'));
  },

  /**
   * Marca todas as notificações visíveis como lidas
   */
  async markAllAsRead(userId?: string, userRole?: UserRole): Promise<void> {
    try {
      if (userRole === 'admin') {
        await supabase
          .from('notifications')
          .update({ read: true })
          .or(`recipient_role.eq.admin,recipient_id.eq.${userId || 'null'},recipient_id.is.null`);
      } else if (userId) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .or(`recipient_id.eq.${userId},recipient_role.eq.colaborador,recipient_id.is.null`);
      }
    } catch {
      // ignore
    }

    const local = getLocalNotifications();
    const updated = local.map((n) => ({ ...n, read: true }));
    saveLocalNotifications(updated);
    window.dispatchEvent(new CustomEvent('msca_notifications_updated'));
  },

  /**
   * Notifica administradores que a apuração de um cliente atingiu 100% no mês
   */
  async notifyAdmin100Percent(params: {
    client_id: string;
    client_name: string;
    competencia: string;
    regime: string;
    operator_id?: string;
    operator_name?: string;
  }) {
    // Evita notificações duplicadas na mesma sessão/minutos para o mesmo cliente+mês
    const local = getLocalNotifications();
    const alreadySentRecently = local.some(
      (n) =>
        n.type === 'APURACAO_100_PERCENT' &&
        n.client_id === params.client_id &&
        n.competencia === params.competencia &&
        Date.now() - new Date(n.created_at).getTime() < 1000 * 60 * 15 // 15 minutos de debounce
    );

    if (alreadySentRecently) return;

    return this.createNotification({
      title: 'Apuração 100% Concluída',
      message: `${params.client_name} atingiu 100% na apuração de ${params.competencia} (${params.regime}). Aguardando validação ADM.`,
      type: 'APURACAO_100_PERCENT',
      recipient_role: 'admin',
      sender_id: params.operator_id,
      sender_name: params.operator_name || 'Analista',
      client_id: params.client_id,
      client_name: params.client_name,
      competencia: params.competencia,
      regime: params.regime,
      link: `/apuracao?client_id=${params.client_id}&comp=${encodeURIComponent(params.competencia)}&regime=${encodeURIComponent(params.regime)}&validate=true`,
    });
  },

  /**
   * Notifica analistas/operadores que o ADM apontou pendência ou solicitou revisão
   */
  async notifyOperatorReviewNeeded(params: {
    client_id: string;
    client_name: string;
    competencia: string;
    regime: string;
    admin_id?: string;
    admin_name?: string;
    review_notes: string;
    pending_obligations?: string[];
    operator_id?: string;
  }) {
    const obDetails = params.pending_obligations?.length
      ? ` Etapas: ${params.pending_obligations.join(', ')}.`
      : '';

    return this.createNotification({
      title: 'Revisão Solicitada pelo ADM',
      message: `O ADM ${params.admin_name || 'Gestor'} solicitou revisão em ${params.client_name} (${params.competencia}).${obDetails} Motivo: "${params.review_notes}"`,
      type: 'APURACAO_NEEDS_REVIEW',
      recipient_id: params.operator_id || null,
      recipient_role: 'colaborador',
      sender_id: params.admin_id,
      sender_name: params.admin_name || 'Administrador',
      client_id: params.client_id,
      client_name: params.client_name,
      competencia: params.competencia,
      regime: params.regime,
      link: `/apuracao?client_id=${params.client_id}&comp=${encodeURIComponent(params.competencia)}&regime=${encodeURIComponent(params.regime)}`,
    });
  },

  /**
   * Notifica que o ADM aprovou com sucesso a apuração do cliente
   */
  async notifyOperatorApproved(params: {
    client_id: string;
    client_name: string;
    competencia: string;
    regime: string;
    admin_id?: string;
    admin_name?: string;
    operator_id?: string;
  }) {
    return this.createNotification({
      title: 'Apuração Aprovada pelo ADM',
      message: `A apuração de ${params.client_name} para ${params.competencia} foi aprovada com sucesso pelo ADM ${params.admin_name || ''}!`,
      type: 'APURACAO_APPROVED',
      recipient_id: params.operator_id || null,
      recipient_role: 'colaborador',
      sender_id: params.admin_id,
      sender_name: params.admin_name || 'Administrador',
      client_id: params.client_id,
      client_name: params.client_name,
      competencia: params.competencia,
      regime: params.regime,
      link: `/apuracao?client_id=${params.client_id}&comp=${encodeURIComponent(params.competencia)}&regime=${encodeURIComponent(params.regime)}`,
    });
  },
};
