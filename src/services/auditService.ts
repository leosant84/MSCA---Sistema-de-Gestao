import { supabase } from '../lib/supabase';
import type { AuditAction, AuditEntity } from '../types';

interface LogAuditEventParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  entityName?: string;
  changes?: Record<string, { old?: unknown; new?: unknown }>;
}

/**
 * Registra um evento de auditoria manual ou de segurança (ex: tentativa de acesso indevido).
 * As operações de banco de dados (INSERT, UPDATE, DELETE em clients, credentials, financeiro)
 * também contam com trigger automática no Supabase para garantir integridade.
 */
export async function logAuditEvent({
  action,
  entity,
  entityId,
  entityName,
  changes,
}: LogAuditEventParams): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let userEmail: string | undefined;
    let userName: string | undefined;

    if (user) {
      userEmail = user.email;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      userName = profile?.full_name || profile?.email || user.email;
    }

    await supabase.from('audit_logs').insert([
      {
        user_id: user?.id || null,
        user_email: userEmail || null,
        user_name: userName || null,
        action,
        entity,
        entity_id: entityId || null,
        entity_name: entityName || null,
        changes: changes || null,
      },
    ]);
  } catch (err) {
    // Falhas de log não devem quebrar o fluxo principal da aplicação
    console.error('Falha silenciosa ao registrar log de auditoria:', err);
  }
}
