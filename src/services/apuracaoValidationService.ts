import { supabase } from '../lib/supabase';
import type { ClientApuracaoValidation } from '../types';

const LOCAL_STORAGE_KEY = 'msca_apuracao_validations';

function getLocalValidations(): Record<string, ClientApuracaoValidation> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalValidations(map: Record<string, ClientApuracaoValidation>) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota issues
  }
}

export function buildValidationKey(clientId: string, competencia: string): string {
  return `${clientId}::${competencia.toLowerCase()}`;
}

async function persistRecord(record: ClientApuracaoValidation) {
  // 1. Persistência primária na tabela fiscal_records (que já existe no Supabase, possui Realtime e RLS ativo)
  try {
    await supabase
      .from('fiscal_records')
      .upsert(
        {
          client_id: record.client_id,
          competencia: record.competencia,
          regime: record.regime,
          obrigacao: '__VALIDACAO_ADM__',
          valor: JSON.stringify(record),
          status: record.enviado_cliente ? 'ENVIADO' : record.status,
          updated_by: record.reviewed_by || null,
          updated_at: record.updated_at || new Date().toISOString(),
        },
        { onConflict: 'client_id,competencia,obrigacao' }
      );
  } catch (err) {
    console.error('Erro ao persistir validação em fiscal_records:', err);
  }

  // 2. Persistência na tabela client_apuracao_validations se existir
  try {
    await supabase
      .from('client_apuracao_validations')
      .upsert(
        {
          client_id: record.client_id,
          competencia: record.competencia,
          regime: record.regime,
          status: record.status,
          reviewed_by: record.reviewed_by || null,
          reviewed_by_name: record.reviewed_by_name || 'Gestor ADM',
          reviewed_at: record.reviewed_at || record.updated_at,
          review_notes: record.review_notes || null,
          pending_obligations: record.pending_obligations || [],
          enviado_cliente: Boolean(record.enviado_cliente),
          enviado_em: record.enviado_em || null,
          enviado_por: record.enviado_por || null,
          enviado_por_nome: record.enviado_por_nome || null,
          updated_at: record.updated_at,
        },
        { onConflict: 'client_id,competencia' }
      );
  } catch {
    // Silencioso se a tabela dedicada não existir no banco
  }
}

async function deleteRecord(clientId: string, competencia: string) {
  try {
    await supabase
      .from('fiscal_records')
      .delete()
      .eq('client_id', clientId)
      .eq('competencia', competencia)
      .eq('obrigacao', '__VALIDACAO_ADM__');
  } catch (err) {
    console.error('Erro ao remover validação em fiscal_records:', err);
  }

  try {
    await supabase
      .from('client_apuracao_validations')
      .delete()
      .eq('client_id', clientId)
      .eq('competencia', competencia);
  } catch {
    // Silencioso
  }
}

export const apuracaoValidationService = {
  /**
   * Busca todas as validações de apuração para um ano ou conjunto de competências.
   */
  async getValidations(shortYearStr?: string): Promise<Record<string, ClientApuracaoValidation>> {
    const localMap = getLocalValidations();
    const merged: Record<string, ClientApuracaoValidation> = { ...localMap };

    // 1. Busca validações de fiscal_records (obrigacao = '__VALIDACAO_ADM__')
    try {
      let query = supabase
        .from('fiscal_records')
        .select('*')
        .eq('obrigacao', '__VALIDACAO_ADM__');

      if (shortYearStr) {
        query = query.like('competencia', `%/${shortYearStr}`);
      }

      const { data, error } = await query;

      if (!error && data && Array.isArray(data)) {
        data.forEach((r: { id: string; client_id: string; competencia: string; regime: string; valor: string; status?: string; updated_by?: string | null; created_at?: string; updated_at?: string }) => {
          try {
            const parsed = JSON.parse(r.valor || '{}');
            const item: ClientApuracaoValidation = {
              id: r.id,
              client_id: r.client_id,
              competencia: r.competencia,
              regime: r.regime,
              status: parsed.status || r.status || 'PENDING',
              reviewed_by: parsed.reviewed_by || r.updated_by || null,
              reviewed_by_name: parsed.reviewed_by_name || 'Gestor ADM',
              reviewed_at: parsed.reviewed_at || r.updated_at,
              review_notes: parsed.review_notes || null,
              pending_obligations: parsed.pending_obligations || [],
              validated_obligations: parsed.validated_obligations || null,
              enviado_cliente: parsed.enviado_cliente !== undefined ? parsed.enviado_cliente : (r.status === 'ENVIADO'),
              enviado_em: parsed.enviado_em || null,
              enviado_por: parsed.enviado_por || null,
              enviado_por_nome: parsed.enviado_por_nome || null,
              created_at: r.created_at,
              updated_at: r.updated_at,
            };
            const k = buildValidationKey(item.client_id, item.competencia);
            merged[k] = item;
          } catch {
            // ignore
          }
        });
      }
    } catch (err) {
      console.warn('Falha ao ler validações de fiscal_records:', err);
    }

    // 2. Busca também de client_apuracao_validations caso a tabela exista
    try {
      let query = supabase.from('client_apuracao_validations').select('*');
      if (shortYearStr) {
        query = query.like('competencia', `%/${shortYearStr}`);
      }
      const { data, error } = await query;

      if (!error && data && Array.isArray(data)) {
        data.forEach((item: ClientApuracaoValidation) => {
          const k = buildValidationKey(item.client_id, item.competencia);
          merged[k] = { ...merged[k], ...item };
        });
      }
    } catch {
      // Falha silenciosa caso tabela dedicada não exista no banco
    }

    saveLocalValidations(merged);
    return merged;
  },

  /**
   * Registra a aprovação de uma apuração de cliente em determinado mês (todas as obrigações).
   */
  async setValidationApproved(params: {
    clientId: string;
    competencia: string;
    regime: string;
    adminId?: string;
    adminName?: string;
    allObligations?: string[];
  }): Promise<ClientApuracaoValidation> {
    const now = new Date().toISOString();
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];

    const record: ClientApuracaoValidation = {
      id: existing?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: 'APPROVED',
      reviewed_by: params.adminId || existing?.reviewed_by || null,
      reviewed_by_name: params.adminName || existing?.reviewed_by_name || 'Gestor ADM',
      reviewed_at: now,
      review_notes: null,
      pending_obligations: [],
      validated_obligations: params.allObligations || existing?.validated_obligations || null,
      enviado_cliente: existing?.enviado_cliente ?? false,
      enviado_em: existing?.enviado_em || null,
      enviado_por: existing?.enviado_por || null,
      enviado_por_nome: existing?.enviado_por_nome || null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    // Disparar evento para reatividade em tempo real nas tabelas
    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    await persistRecord(record);

    return record;
  },

  /**
   * Alterna o status de "Enviado ao Cliente" para a apuração da competência.
   */
  async setEnviadoCliente(params: {
    clientId: string;
    competencia: string;
    regime: string;
    enviado: boolean;
    adminId?: string;
    adminName?: string;
  }): Promise<ClientApuracaoValidation> {
    const now = new Date().toISOString();
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];

    const record: ClientApuracaoValidation = {
      id: existing?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: existing?.status || 'APPROVED',
      reviewed_by: existing?.reviewed_by || params.adminId || null,
      reviewed_by_name: existing?.reviewed_by_name || params.adminName || 'Gestor ADM',
      reviewed_at: existing?.reviewed_at || now,
      review_notes: existing?.review_notes || null,
      pending_obligations: existing?.pending_obligations || [],
      validated_obligations: existing?.validated_obligations || null,
      enviado_cliente: params.enviado,
      enviado_em: params.enviado ? now : null,
      enviado_por: params.enviado ? (params.adminId || null) : null,
      enviado_por_nome: params.enviado ? (params.adminName || 'Gestor ADM') : null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    await persistRecord(record);

    return record;
  },

  /**
   * Alterna a validação de uma única obrigação específica de um cliente na competência.
   */
  async toggleObligationValidation(params: {
    clientId: string;
    competencia: string;
    regime: string;
    obrigacao: string;
    allClientObligations: string[];
    validated: boolean;
    adminId?: string;
    adminName?: string;
  }): Promise<ClientApuracaoValidation | null> {
    const now = new Date().toISOString();
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];

    let currentValidated = new Set<string>(
      existing?.validated_obligations
        ? existing.validated_obligations
        : existing?.status === 'APPROVED'
        ? params.allClientObligations
        : []
    );

    let currentPending = new Set<string>(existing?.pending_obligations || []);

    if (params.validated) {
      currentValidated.add(params.obrigacao);
      currentPending.delete(params.obrigacao);
      const obNorm = (params.obrigacao || '').trim().toUpperCase();
      if (obNorm === 'PRO LAB / INSS') {
        currentPending.delete('GUIA INSS');
        currentPending.delete('PRO-LAB. / FOPAG');
      }
    } else {
      currentValidated.delete(params.obrigacao);
    }

    const validatedArray = Array.from(currentValidated);
    const pendingArray = Array.from(currentPending);
    const totalObligations = params.allClientObligations.length;
    const isAllValidated =
      totalObligations > 0 &&
      params.allClientObligations.every((ob) => currentValidated.has(ob));

    // Se desmarcou e não sobrou nenhuma validada, nem pendência, e não foi enviado
    if (validatedArray.length === 0 && pendingArray.length === 0 && !existing?.enviado_cliente) {
      delete localMap[key];
      saveLocalValidations(localMap);
      window.dispatchEvent(
        new CustomEvent('msca_apuracao_validated', { detail: { key, record: null } })
      );
      await deleteRecord(params.clientId, params.competencia);
      return null;
    }

    const newStatus: 'APPROVED' | 'PENDING' | 'NEEDS_REVIEW' = isAllValidated
      ? 'APPROVED'
      : pendingArray.length > 0
      ? 'NEEDS_REVIEW'
      : 'PENDING';

    const record: ClientApuracaoValidation = {
      id: existing?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: newStatus,
      reviewed_by: params.adminId || existing?.reviewed_by || null,
      reviewed_by_name: params.adminName || existing?.reviewed_by_name || 'Gestor ADM',
      reviewed_at: now,
      review_notes: pendingArray.length > 0 ? existing?.review_notes || null : null,
      pending_obligations: pendingArray,
      validated_obligations: validatedArray,
      enviado_cliente: existing?.enviado_cliente ?? false,
      enviado_em: existing?.enviado_em || null,
      enviado_por: existing?.enviado_por || null,
      enviado_por_nome: existing?.enviado_por_nome || null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    await persistRecord(record);

    return record;
  },

  /**
   * Limpa a pendência de uma obrigação específica quando o usuário a apura novamente (OK).
   */
  async clearObligationPending(params: {
    clientId: string;
    competencia: string;
    obrigacao: string;
  }): Promise<ClientApuracaoValidation | null> {
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];
    if (!existing || existing.status !== 'NEEDS_REVIEW') return null;

    const obNorm = (params.obrigacao || '').trim().toUpperCase();
    const currentPending = (existing.pending_obligations || []).filter((ob) => {
      if (ob === params.obrigacao) return false;
      if (obNorm === 'PRO LAB / INSS' && (ob === 'GUIA INSS' || ob === 'PRO-LAB. / FOPAG')) return false;
      return true;
    });

    const now = new Date().toISOString();
    const remainingPendingCount = currentPending.length;

    const newStatus: 'APPROVED' | 'PENDING' | 'NEEDS_REVIEW' = remainingPendingCount > 0
      ? 'NEEDS_REVIEW'
      : 'PENDING';

    const updatedRecord: ClientApuracaoValidation = {
      ...existing,
      status: newStatus,
      review_notes: remainingPendingCount > 0 ? existing.review_notes : null,
      pending_obligations: currentPending,
      updated_at: now,
    };

    localMap[key] = updatedRecord;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record: updatedRecord } })
    );

    await persistRecord(updatedRecord);

    return updatedRecord;
  },

  /**
   * Remove a validação de uma obrigação específica quando ela é removida/desfeita (não está mais OK).
   */
  async clearObligationValidation(params: {
    clientId: string;
    competencia: string;
    obrigacao: string;
  }): Promise<ClientApuracaoValidation | null> {
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];
    if (!existing) return null;

    const obNorm = (params.obrigacao || '').trim().toUpperCase();

    const remainingValidated = (existing.validated_obligations || []).filter((ob) => {
      if (ob === params.obrigacao) return false;
      if (obNorm === 'PRO LAB / INSS' && (ob === 'GUIA INSS' || ob === 'PRO-LAB. / FOPAG')) return false;
      return true;
    });

    const hasPending = (existing.pending_obligations || []).length > 0;
    const now = new Date().toISOString();

    if (remainingValidated.length === 0 && !hasPending && !existing.enviado_cliente) {
      delete localMap[key];
      saveLocalValidations(localMap);
      window.dispatchEvent(
        new CustomEvent('msca_apuracao_validated', { detail: { key, record: null } })
      );
      await deleteRecord(params.clientId, params.competencia);
      return null;
    }

    const newStatus: 'APPROVED' | 'PENDING' | 'NEEDS_REVIEW' = hasPending
      ? 'NEEDS_REVIEW'
      : 'PENDING';

    const updatedRecord: ClientApuracaoValidation = {
      ...existing,
      status: newStatus,
      validated_obligations: remainingValidated,
      updated_at: now,
    };

    localMap[key] = updatedRecord;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record: updatedRecord } })
    );

    await persistRecord(updatedRecord);

    return updatedRecord;
  },

  /**
   * Registra a sinalização de pendência / revisão pelo ADM.
   */
  async setValidationNeedsReview(params: {
    clientId: string;
    competencia: string;
    regime: string;
    adminId?: string;
    adminName?: string;
    reviewNotes: string;
    pendingObligations?: string[];
  }): Promise<ClientApuracaoValidation> {
    const now = new Date().toISOString();
    const key = buildValidationKey(params.clientId, params.competencia);
    const localMap = getLocalValidations();
    const existing = localMap[key];

    const record: ClientApuracaoValidation = {
      id: existing?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: 'NEEDS_REVIEW',
      reviewed_by: params.adminId || null,
      reviewed_by_name: params.adminName || 'Gestor ADM',
      reviewed_at: now,
      review_notes: params.reviewNotes,
      pending_obligations: params.pendingObligations || [],
      enviado_cliente: existing?.enviado_cliente ?? false,
      enviado_em: existing?.enviado_em || null,
      enviado_por: existing?.enviado_por || null,
      enviado_por_nome: existing?.enviado_por_nome || null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    await persistRecord(record);

    return record;
  },

  /**
   * Remove/reseta a validação (desmarcar validação).
   */
  async clearValidation(clientId: string, competencia: string): Promise<void> {
    const key = buildValidationKey(clientId, competencia);
    const localMap = getLocalValidations();
    if (localMap[key]) {
      delete localMap[key];
      saveLocalValidations(localMap);
      window.dispatchEvent(
        new CustomEvent('msca_apuracao_validated', { detail: { key, record: null } })
      );
    }

    await deleteRecord(clientId, competencia);
  },
};
