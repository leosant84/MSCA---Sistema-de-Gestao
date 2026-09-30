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

export const apuracaoValidationService = {
  /**
   * Busca todas as validações de apuração para um ano ou conjunto de competências.
   */
  async getValidations(shortYearStr?: string): Promise<Record<string, ClientApuracaoValidation>> {
    const localMap = getLocalValidations();

    try {
      let query = supabase.from('client_apuracao_validations').select('*');
      if (shortYearStr) {
        query = query.like('competencia', `%/${shortYearStr}`);
      }
      const { data, error } = await query;

      if (!error && data && Array.isArray(data)) {
        const merged = { ...localMap };
        data.forEach((item: ClientApuracaoValidation) => {
          const k = buildValidationKey(item.client_id, item.competencia);
          merged[k] = item;
        });
        saveLocalValidations(merged);
        return merged;
      }
    } catch {
      // Falha silenciosa caso tabela não exista no banco; fallback local funciona 100%
    }

    return localMap;
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

    const record: ClientApuracaoValidation = {
      id: localMap[key]?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: 'APPROVED',
      reviewed_by: params.adminId || null,
      reviewed_by_name: params.adminName || 'Gestor ADM',
      reviewed_at: now,
      review_notes: null,
      pending_obligations: [],
      validated_obligations: params.allObligations || null,
      created_at: localMap[key]?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    // Disparar evento para reatividade em tempo real nas tabelas
    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    // Persistir no Supabase
    try {
      await supabase
        .from('client_apuracao_validations')
        .upsert(
          {
            client_id: params.clientId,
            competencia: params.competencia,
            regime: params.regime,
            status: 'APPROVED',
            reviewed_by: params.adminId || null,
            reviewed_by_name: params.adminName || 'Gestor ADM',
            reviewed_at: now,
            review_notes: null,
            pending_obligations: [],
            updated_at: now,
          },
          { onConflict: 'client_id,competencia' }
        );
    } catch {
      // Ignora falha de rede/schema ausente
    }

    return record;
  },

  /**
   * Alterna a validação de uma única obrigação específica de um cliente na competência.
   * Se todas as obrigações do cliente forem validadas, o status geral vai para APPROVED.
   * Se nenhuma obrigação estiver validada, o registro de validação pode ser limpo ou ficar pendente.
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

    // Se já estava com status APPROVED e sem array discriminado, assumimos que todas as obrigações estavam validadas
    let currentValidated = new Set<string>(
      existing?.validated_obligations
        ? existing.validated_obligations
        : existing?.status === 'APPROVED'
        ? params.allClientObligations
        : []
    );

    if (params.validated) {
      currentValidated.add(params.obrigacao);
    } else {
      currentValidated.delete(params.obrigacao);
    }

    const validatedArray = Array.from(currentValidated);
    const totalObligations = params.allClientObligations.length;
    const isAllValidated =
      totalObligations > 0 &&
      params.allClientObligations.every((ob) => currentValidated.has(ob));

    // Se desmarcou e não sobrou nenhuma validada, e não havia pendências registradas
    if (validatedArray.length === 0 && (!existing?.pending_obligations || existing.pending_obligations.length === 0)) {
      delete localMap[key];
      saveLocalValidations(localMap);
      window.dispatchEvent(
        new CustomEvent('msca_apuracao_validated', { detail: { key, record: null } })
      );
      try {
        await supabase
          .from('client_apuracao_validations')
          .delete()
          .eq('client_id', params.clientId)
          .eq('competencia', params.competencia);
      } catch {
        // ignore
      }
      return null;
    }

    const newStatus: 'APPROVED' | 'PENDING' | 'NEEDS_REVIEW' = isAllValidated
      ? 'APPROVED'
      : existing?.status === 'NEEDS_REVIEW'
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
      review_notes: existing?.review_notes || null,
      pending_obligations: existing?.pending_obligations || [],
      validated_obligations: validatedArray,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    try {
      await supabase
        .from('client_apuracao_validations')
        .upsert(
          {
            client_id: params.clientId,
            competencia: params.competencia,
            regime: params.regime,
            status: newStatus,
            reviewed_by: params.adminId || null,
            reviewed_by_name: params.adminName || 'Gestor ADM',
            reviewed_at: now,
            review_notes: existing?.review_notes || null,
            pending_obligations: existing?.pending_obligations || [],
            updated_at: now,
          },
          { onConflict: 'client_id,competencia' }
        );
    } catch {
      // Ignora falha de schema
    }

    return record;
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

    const record: ClientApuracaoValidation = {
      id: localMap[key]?.id || crypto.randomUUID(),
      client_id: params.clientId,
      competencia: params.competencia,
      regime: params.regime,
      status: 'NEEDS_REVIEW',
      reviewed_by: params.adminId || null,
      reviewed_by_name: params.adminName || 'Gestor ADM',
      reviewed_at: now,
      review_notes: params.reviewNotes,
      pending_obligations: params.pendingObligations || [],
      created_at: localMap[key]?.created_at || now,
      updated_at: now,
    };

    localMap[key] = record;
    saveLocalValidations(localMap);

    window.dispatchEvent(
      new CustomEvent('msca_apuracao_validated', { detail: { key, record } })
    );

    try {
      await supabase
        .from('client_apuracao_validations')
        .upsert(
          {
            client_id: params.clientId,
            competencia: params.competencia,
            regime: params.regime,
            status: 'NEEDS_REVIEW',
            reviewed_by: params.adminId || null,
            reviewed_by_name: params.adminName || 'Gestor ADM',
            reviewed_at: now,
            review_notes: params.reviewNotes,
            pending_obligations: params.pendingObligations || [],
            updated_at: now,
          },
          { onConflict: 'client_id,competencia' }
        );
    } catch {
      // Ignora falha de schema
    }

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

    try {
      await supabase
        .from('client_apuracao_validations')
        .delete()
        .eq('client_id', clientId)
        .eq('competencia', competencia);
    } catch {
      // ignore
    }
  },
};
