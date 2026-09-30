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
   * Registra a aprovação de uma apuração de cliente em determinado mês.
   */
  async setValidationApproved(params: {
    clientId: string;
    competencia: string;
    regime: string;
    adminId?: string;
    adminName?: string;
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
