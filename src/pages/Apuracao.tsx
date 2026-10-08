import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calculator,
  CheckCircle2,
  RefreshCw,
  Calendar,
  Building,
  TrendingUp,
  Sparkles,
  ChevronRight,
  X,
  User,
  ShieldCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatCompetencia } from '../utils/competencia';
import {
  FISCAL_OBLIGATIONS,
  FISCAL_REGIME_OPTIONS,
  FOLHA_PAGAMENTO_OBLIGATIONS,
  hasClientFolha,
} from '../constants/fiscalObligations';
import { APURACAO_CLIENT_IDS } from '../constants/apuracaoScope';
import { ApuracaoDrilldownModal } from '../components/ApuracaoDrilldownModal';
import { ClientApuracoesModal } from '../components/ClientApuracoesModal';
import { notificationService } from '../services/notificationService';
import { apuracaoValidationService, buildValidationKey } from '../services/apuracaoValidationService';
import type { FiscalRegimeType } from '../constants/fiscalObligations';
import type { Client, FiscalRecord, ClientApuracaoValidation } from '../types';

const MONTH_NAMES_SHORT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'
];

export const Apuracao: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Estados principais
  const [activeTab, setActiveTab] = useState<FiscalRegimeType>(() => {
    const regParam = searchParams.get('regime');
    if (regParam && FISCAL_REGIME_OPTIONS.some((r) => r.value === regParam)) {
      return regParam as FiscalRegimeType;
    }
    return 'Simples Nacional';
  });

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Dados
  const [clients, setClients] = useState<Client[]>([]);

  // Cache de valores gravados no formato `client_id::obrigacao::competencia`
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Validações do ADM indexadas por `client_id::competencia`
  const [validations, setValidations] = useState<Record<string, ClientApuracaoValidation>>({});

  // Modal de Drilldown (ao clicar na apuração)
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<string>('');
  const [selectedCompForDrilldown, setSelectedCompForDrilldown] = useState<string>('');
  const [drilldownInitialShowPending, setDrilldownInitialShowPending] = useState(false);

  // Filtro por Cliente Específico e Modal de Apurações do Cliente
  const [selectedClientIdFilter, setSelectedClientIdFilter] = useState<string>('');
  const [clientApuracoesModalOpen, setClientApuracoesModalOpen] = useState(false);
  const [clientForApuracoesModal, setClientForApuracoesModal] = useState<Client | null>(null);

  // Lista de Anos disponíveis
  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  // Lista de competências do ano selecionado (12 meses: JAN/YY a DEZ/YY)
  const yearCompetencias = useMemo(() => {
    return MONTH_NAMES_SHORT.map((_, idx) => formatCompetencia(idx, selectedYear, true));
  }, [selectedYear]);

  // Regra da competência m-1: apurações utilizam sempre o mês anterior como referência padrão
  const currentMonthIdx = useMemo(() => {
    const m = new Date().getMonth();
    return m === 0 ? 11 : m - 1;
  }, []);
  const currentMonthCompetencia = useMemo(() => {
    return formatCompetencia(currentMonthIdx, selectedYear, true);
  }, [currentMonthIdx, selectedYear]);

  // Lista de obrigações da aba ativa (sem etapa 'ENVIO')
  // Na matriz principal da tela, o Administrador e analistas visualizam todas as obrigações
  const currentObligations = useMemo(() => {
    return FISCAL_OBLIGATIONS[activeTab] || [];
  }, [activeTab]);

  // Carrega Clientes e Registros do Ano Selecionado
  const fetchApuracaoData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Busca todos os clientes ativos
      const { data: clientsData, error: clientErr } = await supabase
        .from('clients')
        .select(`
          *,
          client_credentials (*)
        `)
        .ilike('status', 'ATIVO')
        .order('razao_social', { ascending: true });

      if (clientErr) throw clientErr;
      const loadedClients = (clientsData || []) as Client[];
      setClients(loadedClients);

      // 2. Busca registros fiscais das 12 competências do ano selecionado (com paginação para carregar todos os registros além do limite de 1000)
      const shortYearStr = String(selectedYear).slice(-2);
      const allRecords: FiscalRecord[] = [];
      let from = 0;
      const step = 1000;

      while (true) {
        const { data: pageData, error: pageErr } = await supabase
          .from('fiscal_records')
          .select('*')
          .like('competencia', `%/${shortYearStr}`)
          .range(from, from + step - 1);

        if (pageErr) throw pageErr;
        if (!pageData || pageData.length === 0) break;
        allRecords.push(...(pageData as FiscalRecord[]));
        if (pageData.length < step) break;
        from += step;
      }

      const map: Record<string, string> = {};

      // Mapeia os registros reais do banco
      allRecords.forEach((r) => {
        const key = `${r.client_id}::${r.obrigacao}::${r.competencia}`;
        map[key] = r.valor || '';

        // Unificação retrocompatível: se houver registro histórico de "PRO-LAB. / FOPAG" ou "GUIA INSS",
        // popula também a chave unificada "PRO LAB / INSS" (se ainda não preenchida com OK)
        const obNorm = (r.obrigacao || '').trim().toUpperCase();
        if (obNorm === 'PRO-LAB. / FOPAG' || obNorm === 'GUIA INSS') {
          const unifiedKey = `${r.client_id}::PRO LAB / INSS::${r.competencia}`;
          if (!map[unifiedKey] || (r.valor || '').trim().toUpperCase() === 'OK') {
            map[unifiedKey] = r.valor || '';
          }
        }
      });
      setInputValues(map);

      // 3. Busca validações do ADM
      const loadedValidations = await apuracaoValidationService.getValidations(shortYearStr);
      setValidations(loadedValidations);

      // Checagem de link de validação vindo por query param
      const valClientParam = searchParams.get('client_id');
      const valCompParam = searchParams.get('comp');
      const valRegParam = searchParams.get('regime');
      const shouldValidate = searchParams.get('validate') === 'true';

      if (valRegParam && FISCAL_REGIME_OPTIONS.some((r) => r.value === valRegParam)) {
        setActiveTab(valRegParam as FiscalRegimeType);
      }

      if (shouldValidate && valClientParam && valCompParam) {
        const found = loadedClients.find((c) => c.id === valClientParam);
        if (found) {
          setClientForApuracoesModal(found);
          setClientApuracoesModalOpen(true);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar registros de apuração';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, searchParams, toast]);

  // Se a rota/URL mudar os parâmetros enquanto o componente já estiver montado
  useEffect(() => {
    const regParam = searchParams.get('regime');
    const valClientParam = searchParams.get('client_id');
    const valCompParam = searchParams.get('comp');
    const shouldValidate = searchParams.get('validate') === 'true';

    if (regParam && FISCAL_REGIME_OPTIONS.some((r) => r.value === regParam)) {
      setActiveTab(regParam as FiscalRegimeType);
    }

    if (shouldValidate && valClientParam && valCompParam && clients.length > 0) {
      const found = clients.find((c) => c.id === valClientParam);
      if (found) {
        setClientForApuracoesModal(found);
        setClientApuracoesModalOpen(true);
      }
    }
  }, [searchParams, clients]);

  // Listener para sincronização instantânea de validações
  useEffect(() => {
    const handleValidated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.key) {
        setValidations((prev) => {
          if (!detail.record) {
            const next = { ...prev };
            delete next[detail.key];
            return next;
          }
          return { ...prev, [detail.key]: detail.record };
        });
      }
    };

    window.addEventListener('msca_apuracao_validated', handleValidated);
    return () => window.removeEventListener('msca_apuracao_validated', handleValidated);
  }, []);

  // Sincronização em tempo real (Supabase Realtime) para refletir instantaneamente apurações feitas por outros usuários/perfis
  useEffect(() => {
    const channel = supabase
      .channel('realtime_fiscal_records')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fiscal_records' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const r = payload.new as FiscalRecord;
            if (r && r.client_id && r.obrigacao && r.competencia) {
              const key = `${r.client_id}::${r.obrigacao}::${r.competencia}`;
              setInputValues((prev) => {
                const next = { ...prev, [key]: r.valor || '' };
                const obNorm = (r.obrigacao || '').trim().toUpperCase();
                if (obNorm === 'PRO-LAB. / FOPAG' || obNorm === 'GUIA INSS') {
                  const unifiedKey = `${r.client_id}::PRO LAB / INSS::${r.competencia}`;
                  next[unifiedKey] = r.valor || '';
                }
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<FiscalRecord>;
            if (old && old.client_id && old.obrigacao && old.competencia) {
              const key = `${old.client_id}::${old.obrigacao}::${old.competencia}`;
              setInputValues((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    fetchApuracaoData();
  }, [fetchApuracaoData]);

  // Auxiliar: checa se obrigação está habilitada para o cliente
  const isObligationEnabled = useCallback((client: Client, obrigacao: string) => {
    const obNorm = (obrigacao || '').trim().toUpperCase();

    // Tratamento especial para Parc. Ativo (aceita 'Parc. Ativo', 'PARC.', 'PARCELAM. ATIVO')
    if (obNorm === 'PARC. ATIVO' || obNorm === 'PARC.' || obNorm === 'PARCELAM. ATIVO') {
      if (client.parcelamento_ativo === true) return true;
      if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
        return client.obrigacoes_habilitadas.some((o) => {
          const n = (o || '').trim().toUpperCase();
          return n === 'PARC. ATIVO' || n === 'PARC.' || n === 'PARCELAM. ATIVO';
        });
      }
      return false;
    }

    // Tratamento para GERAR OS DAS / GERAR O DAS
    if (obNorm === 'GERAR OS DAS' || obNorm === 'GERAR O DAS') {
      if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
        return client.obrigacoes_habilitadas.some((o) => {
          const n = (o || '').trim().toUpperCase();
          return n === 'GERAR OS DAS' || n === 'GERAR O DAS';
        });
      }
      return true;
    }

    // Obrigações de Folha de Pagamento
    const isFolhaObligation = FOLHA_PAGAMENTO_OBLIGATIONS.some(
      (f) => f.toUpperCase() === obNorm
    );
    if (isFolhaObligation) {
      if (!hasClientFolha(client)) return false;
      if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
        return client.obrigacoes_habilitadas.some((o) => (o || '').trim().toUpperCase() === obNorm);
      }
      return true;
    }

    // Tratamento para PRO LAB / INSS (Simples Nacional)
    if (
      obNorm === 'PRO LAB / INSS' ||
      obNorm === 'PRO-LAB / INSS' ||
      obNorm === 'PRO LAB/INSS'
    ) {
      if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
        return client.obrigacoes_habilitadas.some((o) => {
          const n = (o || '').trim().toUpperCase();
          return (
            n === 'PRO LAB / INSS' ||
            n === 'PRO-LAB / INSS' ||
            n === 'PRO LAB/INSS' ||
            n === 'PRO-LAB. / FOPAG'
          );
        });
      }
      return true;
    }

    if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
      return client.obrigacoes_habilitadas.some((o) => (o || '').trim().toUpperCase() === obNorm);
    }
    return true;
  }, []);

  // Auxiliar: checa se um cliente pertence ao escopo da aba especificada
  const isClientInScope = useCallback((c: Client, tab: FiscalRegimeType): boolean => {
    const statusNorm = (c.status || '').trim().toUpperCase();
    if (statusNorm !== 'ATIVO') return false;

    // Aba Folha de Pagamento: todos os clientes com Folha = Sim (independente do regime fiscal)
    if (tab === 'Folha de Pagamento') {
      return hasClientFolha(c);
    }

    // Aba Lucro Presumido: todos os clientes cujo regime seja Lucro Presumido
    if (tab === 'Lucro Presumido') {
      const cRegimeNorm = (c.regime_tributario || '').trim().toUpperCase();
      const cTipoNorm = (c.tipo_servico || '').trim().toUpperCase();
      return (
        cRegimeNorm.includes('PRESUMIDO') ||
        cTipoNorm.includes('PRESUMIDO') ||
        Boolean(APURACAO_CLIENT_IDS['Lucro Presumido']?.has(c.id))
      );
    }

    // Aba Simples Nacional: todos os clientes cujo regime seja Simples Nacional (com ou sem folha)
    const cRegimeNorm = (c.regime_tributario || '').trim().toUpperCase();
    const cTipoNorm = (c.tipo_servico || '').trim().toUpperCase();
    const isPresumido =
      cRegimeNorm.includes('PRESUMIDO') ||
      cTipoNorm.includes('PRESUMIDO') ||
      Boolean(APURACAO_CLIENT_IDS['Lucro Presumido']?.has(c.id));
    if (isPresumido) return false;

    return (
      cRegimeNorm.includes('SIMPLES') ||
      cTipoNorm.includes('SIMPLES') ||
      Boolean(APURACAO_CLIENT_IDS['Simples Nacional']?.has(c.id)) ||
      (!cRegimeNorm && !cTipoNorm) ||
      cRegimeNorm.includes('FOLHA') ||
      cTipoNorm.includes('FOLHA')
    );
  }, []);

  // Clientes pertencentes ao escopo da aba ativa
  const tabClients = useMemo(() => {
    return clients.filter((c) => isClientInScope(c, activeTab));
  }, [clients, activeTab, isClientInScope]);

  // Salvar alteração de status de apuração (chamado pelo modal de drilldown)
  const handleStatusChange = useCallback(
    async (client: Client, obrigacao: string, newValue: string) => {
      const competencia = selectedCompForDrilldown;
      const key = `${client.id}::${obrigacao}::${competencia}`;

      // Atualização otimista no estado local
      setInputValues((prev) => ({ ...prev, [key]: newValue }));

      try {
        const isOk = newValue.trim().toUpperCase() === 'OK';
        const status = isOk ? 'OK' : newValue.trim() ? 'OBS' : 'PENDENTE';

        const payload = {
          client_id: client.id,
          competencia,
          regime: activeTab,
          obrigacao,
          valor: newValue.trim(),
          status,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('fiscal_records')
          .upsert(payload, { onConflict: 'client_id,competencia,obrigacao' })
          .select()
          .single();

        if (error) throw error;

        // Se marcou como OK, limpar qualquer pendência anterior desta obrigação
        if (isOk) {
          await apuracaoValidationService.clearObligationPending({
            clientId: client.id,
            competencia,
            obrigacao,
          });

          const clientEnabledObligations = currentObligations.filter((ob) =>
            isObligationEnabled(client, ob)
          );

          // Verificar se todas as obrigações habilitadas estão OK (considerando a nova)
          const isAllOk = clientEnabledObligations.every((ob) => {
            if (ob === obrigacao) return true;
            const obKey = `${client.id}::${ob}::${competencia}`;
            const val = inputValues[obKey] || '';
            return val.trim().toUpperCase() === 'OK';
          });

          if (isAllOk) {
            // Disparar notificação para ADM validar
            await notificationService.notifyAdmin100Percent({
              client_id: client.id,
              client_name: client.razao_social,
              competencia,
              regime: activeTab,
              operator_id: user?.id,
              operator_name: profile?.full_name || 'Analista',
            });
            toast(
              `Cliente ${client.razao_social} atingiu 100% no mês! Notificação enviada ao ADM para homologação.`,
              'success',
              'Validação Enviada'
            );
          }
        } else {
          // Se a apuração foi desfeita, limpa ou rebaixa a validação do ADM
          await apuracaoValidationService.clearObligationValidation({
            clientId: client.id,
            competencia,
            obrigacao,
          });
        }
      } catch (err) {
        console.error('Erro ao salvar apuração:', err);
        toast('Erro ao sincronizar apuração com o servidor.', 'error');
      }
    },
    [selectedCompForDrilldown, activeTab, user?.id, profile?.full_name, currentObligations, isObligationEnabled, inputValues, toast]
  );

  // Salvar alteração de status de apuração com competência arbitrária (chamado pelo modal de cliente)
  const handleClientStatusChange = useCallback(
    async (client: Client, obrigacao: string, comp: string, newValue: string) => {
      const key = `${client.id}::${obrigacao}::${comp}`;

      // Atualização otimista no estado local
      setInputValues((prev) => ({ ...prev, [key]: newValue }));

      try {
        const isOk = newValue.trim().toUpperCase() === 'OK';
        const status = isOk ? 'OK' : newValue.trim() ? 'OBS' : 'PENDENTE';

        if (isOk) {
          await apuracaoValidationService.clearObligationPending({
            clientId: client.id,
            competencia: comp,
            obrigacao,
          });

          const clientRegime = client.regime_tributario || activeTab;
          const clientObligations =
            (clientRegime && FISCAL_OBLIGATIONS[clientRegime as FiscalRegimeType]) || currentObligations;
          const clientEnabledObligations = clientObligations.filter((ob) =>
            isObligationEnabled(client, ob)
          );

          // Verificar se todas as obrigações habilitadas estão OK (considerando a nova)
          const isAllOk = clientEnabledObligations.every((ob) => {
            if (ob === obrigacao) return true;
            const obKey = `${client.id}::${ob}::${comp}`;
            const val = inputValues[obKey] || '';
            return val.trim().toUpperCase() === 'OK';
          });

          if (isAllOk) {
            // Disparar notificação para ADM validar
            await notificationService.notifyAdmin100Percent({
              client_id: client.id,
              client_name: client.razao_social,
              competencia: comp,
              regime: activeTab,
              operator_id: user?.id,
              operator_name: profile?.full_name || 'Analista',
            });
            toast(
              `Cliente ${client.razao_social} atingiu 100% no mês! Notificação enviada ao ADM para homologação.`,
              'success',
              'Validação Enviada'
            );
          }
        } else {
          // Se a apuração foi desfeita, limpa ou rebaixa a validação do ADM
          await apuracaoValidationService.clearObligationValidation({
            clientId: client.id,
            competencia: comp,
            obrigacao,
          });
        }

        const payload = {
          client_id: client.id,
          competencia: comp,
          regime: activeTab,
          obrigacao,
          valor: newValue.trim(),
          status,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('fiscal_records')
          .upsert(payload, { onConflict: 'client_id,competencia,obrigacao' })
          .select()
          .single();

        if (error) throw error;
      } catch (err) {
        console.error('Erro ao salvar apuração do cliente:', err);
        toast('Erro ao sincronizar apuração com o servidor.', 'error');
      }
    },
    [activeTab, currentObligations, isObligationEnabled, inputValues, user?.id, profile?.full_name, toast]
  );

  // Clientes considerados no cálculo da matriz (se filtrado por cliente, considera apenas ele)
  const activeScopedClients = useMemo(() => {
    if (selectedClientIdFilter) {
      return tabClients.filter((c) => c.id === selectedClientIdFilter);
    }
    return tabClients;
  }, [tabClients, selectedClientIdFilter]);

  // Cliente único atualmente selecionado (se houver)
  const currentFilteredClient = useMemo(() => {
    if (!selectedClientIdFilter) return null;
    return tabClients.find((c) => c.id === selectedClientIdFilter) || null;
  }, [tabClients, selectedClientIdFilter]);

  // Calcula a porcentagem de conclusão de uma Obrigação em uma Competência específica
  const getObligationMonthStats = useCallback(
    (obrigacao: string, competencia: string) => {
      // Clientes aplicáveis a esta obrigação (respeitando o filtro de cliente se houver)
      const applicable = activeScopedClients.filter((c) => isObligationEnabled(c, obrigacao));
      const total = applicable.length;
      if (total === 0) return { total: 0, okCount: 0, percent: 0 };

      let okCount = 0;
      applicable.forEach((c) => {
        const key = `${c.id}::${obrigacao}::${competencia}`;
        const val = inputValues[key];

        // Reflete estritamente o status real gravado no sistema
        if (val !== undefined && (val || '').trim().toUpperCase() === 'OK') {
          okCount++;
        }
      });

      const percent = Math.round((okCount / total) * 100);
      return { total, okCount, percent };
    },
    [activeScopedClients, isObligationEnabled, inputValues]
  );

  // Auxiliar: verifica se o mês está validado pelo ADM
  // Se houver cliente único filtrado, checa se a apuração daquele cliente no mês foi validada (ou a obrigação específica)
  // Se não houver cliente filtrado, checa se todos os clientes aplicáveis foram validados pelo ADM
  // Estritamente vinculado à existência da apuração ativa (OK): se a apuração foi desfeita, não é considerada validada
  const isMonthValidated = useCallback(
    (competencia: string, obrigacao?: string) => {
      const isClientVal = (c: Client) => {
        // Se checando uma obrigação específica, ela DEVE estar apurada (OK)
        if (obrigacao) {
          const obKey = `${c.id}::${obrigacao}::${competencia}`;
          const val = inputValues[obKey];
          if ((val || '').trim().toUpperCase() !== 'OK') return false;
        }

        const k = buildValidationKey(c.id, competencia);
        const valRec = validations[k];
        if (!valRec) return false;
        if (obrigacao && valRec.validated_obligations && Array.isArray(valRec.validated_obligations)) {
          if (valRec.validated_obligations.includes(obrigacao)) return true;
          const obNorm = (obrigacao || '').trim().toUpperCase();
          if (obNorm === 'PRO LAB / INSS') {
            return (
              valRec.validated_obligations.includes('GUIA INSS') ||
              valRec.validated_obligations.includes('PRO-LAB. / FOPAG')
            );
          }
          return false;
        }
        return valRec.status === 'APPROVED';
      };

      if (currentFilteredClient) {
        return isClientVal(currentFilteredClient);
      }

      const applicableClients = obrigacao
        ? activeScopedClients.filter((c) => isObligationEnabled(c, obrigacao))
        : activeScopedClients;

      if (applicableClients.length === 0) return false;

      return applicableClients.every((c) => isClientVal(c));
    },
    [currentFilteredClient, activeScopedClients, isObligationEnabled, validations, inputValues]
  );

  // Auxiliar: verifica se o cliente ou obrigação possui apontamento de pendência (NEEDS_REVIEW)
  const isMonthNeedsReview = useCallback(
    (competencia: string, obrigacao?: string) => {
      const isClientReview = (c: Client) => {
        const k = buildValidationKey(c.id, competencia);
        const valRec = validations[k];
        if (!valRec || valRec.status !== 'NEEDS_REVIEW') return false;
        if (obrigacao && valRec.pending_obligations && valRec.pending_obligations.length > 0) {
          if (valRec.pending_obligations.includes(obrigacao)) return true;
          const obNorm = (obrigacao || '').trim().toUpperCase();
          if (obNorm === 'PRO LAB / INSS') {
            return (
              valRec.pending_obligations.includes('GUIA INSS') ||
              valRec.pending_obligations.includes('PRO-LAB. / FOPAG')
            );
          }
          return false;
        }
        return true;
      };

      if (currentFilteredClient) {
        return isClientReview(currentFilteredClient);
      }

      const applicableClients = obrigacao
        ? activeScopedClients.filter((c) => isObligationEnabled(c, obrigacao))
        : activeScopedClients;

      return applicableClients.some((c) => isClientReview(c));
    },
    [currentFilteredClient, activeScopedClients, isObligationEnabled, validations]
  );

  // Calcula o status de conclusão e validação de um cliente na competência corrente
  const getClientCurrentMonthSummary = useCallback(
    (client: Client) => {
      const applicable = currentObligations.filter((ob) => isObligationEnabled(client, ob));
      if (applicable.length === 0) return { percent: 0, is100: false, isValidated: false, isNeedsReview: false };

      let okCount = 0;

      applicable.forEach((ob) => {
        const key = `${client.id}::${ob}::${currentMonthCompetencia}`;
        const val = inputValues[key];
        if (val !== undefined && (val || '').trim().toUpperCase() === 'OK') {
          okCount++;
        }
      });

      const percent = Math.round((okCount / applicable.length) * 100);
      const is100 = applicable.length > 0 && okCount === applicable.length;
      const vKey = buildValidationKey(client.id, currentMonthCompetencia);
      const isValidated = is100 && validations[vKey]?.status === 'APPROVED';
      const isNeedsReview = validations[vKey]?.status === 'NEEDS_REVIEW';

      return { percent, is100, isValidated, isNeedsReview };
    },
    [currentObligations, isObligationEnabled, currentMonthCompetencia, inputValues, validations]
  );

  // Mapeamento dos clientes do regime com seu status de conclusão do mês atual
  const clientsWithStatus = useMemo(() => {
    return tabClients.map((c) => {
      const summary = getClientCurrentMonthSummary(c);
      return { client: c, ...summary };
    });
  }, [tabClients, getClientCurrentMonthSummary]);

  // Contagem de clientes 100% que aguardam validação no mês corrente
  const readyForValidationCount = useMemo(() => {
    return clientsWithStatus.filter((c) => c.is100 && !c.isValidated).length;
  }, [clientsWithStatus]);

  // Lista de clientes com 100% apurados
  const clients100Percent = useMemo(() => {
    return clientsWithStatus.filter((c) => c.is100).map((c) => c.client);
  }, [clientsWithStatus]);

  // Lista de clientes disponíveis no select ordenados alfabeticamente
  const selectableClients = useMemo(() => {
    return [...clientsWithStatus].sort((a, b) => {
      return (a.client.razao_social || '').localeCompare(b.client.razao_social || '', 'pt-BR');
    });
  }, [clientsWithStatus]);



  // Percentual total do que já foi apurado no mês corrente (respeitando o filtro de cliente caso aplicado)
  const totalApuradoPercent = useMemo(() => {
    let totalItems = 0;
    let okItems = 0;

    activeScopedClients.forEach((client) => {
      const applicable = currentObligations.filter((ob) => isObligationEnabled(client, ob));
      applicable.forEach((ob) => {
        totalItems++;
        const key = `${client.id}::${ob}::${currentMonthCompetencia}`;
        const val = inputValues[key];
        if (val !== undefined && (val || '').trim().toUpperCase() === 'OK') {
          okItems++;
        }
      });
    });

    if (totalItems === 0) return 0;
    return Math.round((okItems / totalItems) * 100);
  }, [activeScopedClients, currentObligations, isObligationEnabled, currentMonthCompetencia, inputValues]);

  // Percentual total do que já foi validado pelo ADM no mês corrente (respeitando o filtro de cliente caso aplicado)
  // Estritamente condicionado a apuração estar ativa e concluída (OK): se a apuração foi desfeita, o item NÃO é contado como validado
  const totalValidadoPercent = useMemo(() => {
    let totalItems = 0;
    let validatedItems = 0;

    activeScopedClients.forEach((client) => {
      const applicable = currentObligations.filter((ob) => isObligationEnabled(client, ob));
      const vKey = buildValidationKey(client.id, currentMonthCompetencia);
      const valRec = validations[vKey];

      applicable.forEach((ob) => {
        totalItems++;
        const key = `${client.id}::${ob}::${currentMonthCompetencia}`;
        const isOk = (inputValues[key] || '').trim().toUpperCase() === 'OK';

        // Somente pode ser considerado validado se a apuração estiver ativa (OK)
        if (isOk && valRec) {
          if (valRec.status === 'APPROVED') {
            validatedItems++;
          } else if (
            valRec.validated_obligations &&
            Array.isArray(valRec.validated_obligations) &&
            valRec.validated_obligations.includes(ob)
          ) {
            validatedItems++;
          }
        }
      });
    });

    if (totalItems === 0) return 0;
    return Math.round((validatedItems / totalItems) * 100);
  }, [activeScopedClients, currentObligations, isObligationEnabled, currentMonthCompetencia, validations, inputValues]);

  // Abrir Modal de Drilldown para uma apuração
  const handleOpenDrilldown = (obrigacao: string, comp: string, isNeedsReview?: boolean) => {
    setSelectedObligation(obrigacao);
    setSelectedCompForDrilldown(comp);
    setDrilldownInitialShowPending(Boolean(isNeedsReview));
    setDrilldownModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* 1. CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-bold text-[#A67C2E] uppercase tracking-wider">
            <span className="flex items-center space-x-1">
              <Calculator className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Rotina de Apuração Mensal</span>
            </span>
            <span>•</span>
            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
              Visão Consolidada por Mês
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-0.5">
            Apuração Fiscal e Contábil
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Acompanhe o percentual de conclusão por tipo de apuração ao longo dos meses do ano. Clique em qualquer apuração para ver os clientes e atualizar o status.
          </p>
        </div>

        {/* Seletor de Ano e Atualização */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-2xl border border-stone-200/80 shadow-2xs">
            <Calendar className="w-4 h-4 text-[#C5A059]" />
            <span className="text-xs text-stone-500 font-medium">Ano:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs font-bold bg-transparent text-stone-800 focus:outline-none cursor-pointer"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={fetchApuracaoData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-stone-200 rounded-2xl text-xs font-bold text-stone-700 bg-white hover:bg-stone-50 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* 2. CARDS DE RESUMO OPERACIONAL DO MÊS CORRENTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Percentual Total Apurado do Mês Corrente */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200/70 shadow-xs flex items-center justify-between">
          <div className="w-full mr-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                Total Apurado ({currentMonthCompetencia})
              </span>
              <span className="text-2xl font-extrabold text-[#C5A059]">
                {totalApuradoPercent}%
              </span>
            </div>
            <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
              <div
                style={{ width: `${totalApuradoPercent}%` }}
                className="bg-[#C5A059] h-full rounded-full transition-all duration-500"
              />
            </div>
            <div className="text-[11px] text-stone-400 font-medium mt-1.5">
              {currentFilteredClient
                ? `Cliente: ${currentFilteredClient.razao_social} • Progresso no mês`
                : `${activeTab} • Progresso geral de apuração no mês`}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200/60 shadow-2xs shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Percentual Total Validado do Mês Corrente */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200/70 shadow-xs flex items-center justify-between">
          <div className="w-full mr-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                Total Validado ({currentMonthCompetencia})
              </span>
              <span className="text-2xl font-extrabold text-emerald-700">
                {totalValidadoPercent}%
              </span>
            </div>
            <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
              <div
                style={{ width: `${totalValidadoPercent}%` }}
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              />
            </div>
            <div className="text-[11px] text-stone-400 font-medium mt-1.5">
              {currentFilteredClient
                ? `Cliente: ${currentFilteredClient.razao_social} • Homologado no mês`
                : 'Homologado pela Administração no mês'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. BARRA DE SELEÇÃO DE REGIME (TABS) */}
      <div className="bg-white p-2.5 rounded-3xl border border-stone-200/70 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-stone-100/80 p-1 rounded-2xl overflow-x-auto scrollbar-none">
          {FISCAL_REGIME_OPTIONS.map((regime) => {
            const isActive = activeTab === regime.value;
            const count = clients.filter((c) => isClientInScope(c, regime.value)).length;

            return (
              <button
                key={regime.value}
                type="button"
                onClick={() => setActiveTab(regime.value)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap inline-flex items-center space-x-2 cursor-pointer ${
                  isActive
                    ? 'bg-white text-stone-900 shadow-xs scale-[1.01]'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <span>{regime.label}</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.2 rounded-full ${
                    isActive ? 'bg-amber-100 text-amber-900 font-extrabold' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Botão de Filtro Rápido: Clientes 100% Prontos para Validar */}
          {clients100Percent.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const firstReady = clientsWithStatus.find((c) => c.is100 && !c.isValidated)?.client || clients100Percent[0];
                if (firstReady) {
                  setClientForApuracoesModal(firstReady);
                  setClientApuracoesModalOpen(true);
                }
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer border bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
              title="Abrir formulário de validação individual dos clientes que estão 100% apurados"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-700" />
              <span>100% Para Validar</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900">
                {readyForValidationCount}
              </span>
            </button>
          )}

          {/* Seletor de Cliente do Regime */}
          <div className="flex items-center space-x-1.5 bg-stone-50 border border-stone-200/80 rounded-2xl px-3 py-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
            <span className="text-[11px] font-semibold text-stone-500 hidden sm:inline shrink-0">
              Cliente:
            </span>
            <select
              value={selectedClientIdFilter}
              onChange={(e) => setSelectedClientIdFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-stone-800 focus:outline-none max-w-[200px] sm:max-w-[280px] truncate cursor-pointer"
            >
              <option value="">
                {`Todos os clientes (${tabClients.length})`}
              </option>
              {selectableClients.map(({ client: c }) => {
                return (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                );
              })}
            </select>

            {selectedClientIdFilter && (
              <button
                type="button"
                onClick={() => setSelectedClientIdFilter('')}
                className="text-stone-400 hover:text-stone-600 p-0.5 rounded cursor-pointer"
                title="Limpar filtro de cliente"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botão de Ver todas as apurações do cliente selecionado */}
          {currentFilteredClient && (
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setClientForApuracoesModal(currentFilteredClient);
                  setClientApuracoesModalOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-[#C5A059] hover:bg-[#A67C2E] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                title={`Ver e gerenciar todas as apurações de ${currentFilteredClient.razao_social}`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Ver Apurações do Cliente</span>
              </button>
            </div>
          )}

          {!selectedClientIdFilter && (
            <div className="text-xs text-stone-400 font-medium px-2 hidden lg:inline">
              <span>{tabClients.length} clientes ativos monitorados</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. NOVA TABELA PRINCIPAL CONSOLIDADA (LINHAS = APURAÇÕES, COLUNAS = MESES) */}
      <div className="bg-white rounded-3xl border border-stone-200/70 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[380px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-stone-100 shadow-xs">
              <tr className="border-b border-stone-200 text-[11px] font-bold text-stone-600 uppercase tracking-wider select-none">
                {/* Linha Fixa da Apuração */}
                <th className="py-3 px-4 bg-stone-100 w-[240px] min-w-[240px] max-w-[260px] sticky left-0 z-30 shadow-[1px_0_0_0_#E5E7EB]">
                  Tipo de Apuração
                </th>

                {/* 12 Colunas de Meses (JAN a DEZ) */}
                {MONTH_NAMES_SHORT.map((mShort, idx) => {
                  const compStr = yearCompetencias[idx];
                  const isCurrent = idx === currentMonthIdx && selectedYear === new Date().getFullYear();

                  return (
                    <th
                      key={compStr}
                      className={`py-3 px-2 text-center min-w-[76px] whitespace-nowrap bg-stone-100 ${
                        isCurrent ? 'text-amber-800 font-extrabold' : 'text-stone-600'
                      }`}
                      title={`Competência ${compStr}`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px]">{mShort}</span>
                        <span className="text-[9px] text-stone-400 font-mono">
                          {String(selectedYear).slice(-2)}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-stone-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Carregando matriz de apurações...</span>
                    </div>
                  </td>
                </tr>
              ) : currentObligations.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-stone-400">
                    Nenhuma apuração cadastrada para este regime.
                  </td>
                </tr>
              ) : (
                currentObligations.map((obrigacao) => (
                  <tr key={obrigacao} className="hover:bg-amber-50/20 transition-colors">
                    {/* Nome da Apuração Clicável para Drilldown de Clientes */}
                    <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-amber-50/20 shadow-[1px_0_0_0_#E5E7EB] w-[240px] min-w-[240px] max-w-[260px]">
                      <button
                        type="button"
                        onClick={() => handleOpenDrilldown(obrigacao, currentMonthCompetencia)}
                        className="text-left font-bold text-stone-900 hover:text-[#C5A059] transition-colors cursor-pointer group flex items-center justify-between w-full"
                        title={`Clique para abrir a lista de clientes para: ${obrigacao}`}
                      >
                        <span className="truncate group-hover:underline underline-offset-2">
                          {obrigacao}
                        </span>
                        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-[#C5A059] group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                      </button>
                    </td>

                    {/* Células dos Meses com Porcentagem de Conclusão */}
                    {MONTH_NAMES_SHORT.map((_, idx) => {
                      const compStr = yearCompetencias[idx];
                      const stats = getObligationMonthStats(obrigacao, compStr);
                      const is100 = stats.percent === 100;
                      const isZero = stats.percent === 0;
                      const isValidated = is100 && isMonthValidated(compStr, obrigacao);
                      const isNeedsReview = isMonthNeedsReview(compStr, obrigacao);

                      return (
                        <td
                          key={compStr}
                          onClick={() => handleOpenDrilldown(obrigacao, compStr, isNeedsReview)}
                          className="py-2 px-1 text-center cursor-pointer hover:bg-amber-50/60 transition-colors"
                          title={`${obrigacao} em ${compStr}: ${stats.percent}% (${stats.okCount}/${stats.total} clientes). ${
                            isNeedsReview
                              ? 'Atenção: Há pendência apontada pelo ADM para revisão!'
                              : is100
                              ? isValidated
                                ? '100% Apurado e Validado pelo ADM.'
                                : '100% Apurado (Aguardando Validação do ADM).'
                              : ''
                          } Clique para abrir clientes.`}
                        >
                          <div className="flex flex-col items-center justify-center space-y-0.5">
                            {/* Badge Porcentual */}
                            <span
                              className={`inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-lg text-[10px] tracking-tight shadow-2xs transition-transform hover:scale-105 ${
                                isNeedsReview
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold ring-1 ring-rose-400'
                                  : is100
                                  ? isValidated
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold'
                                    : 'bg-slate-100 text-slate-700 border border-slate-300 font-bold'
                                  : isZero
                                  ? 'bg-stone-100 text-stone-400 border border-stone-200/80 font-normal'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                              }`}
                            >
                              <span>{stats.percent}%</span>
                              {isNeedsReview ? (
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0 animate-pulse" />
                              ) : is100 ? (
                                isValidated ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                )
                              ) : null}
                            </span>

                            {/* Contagem discreta */}
                            <span className="text-[8px] font-mono text-stone-400">
                              {stats.okCount}/{stats.total}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Matriz com Instruções e Legenda */}
        <div className="p-4 px-6 bg-stone-50/80 border-t border-stone-200/70 flex flex-wrap items-center justify-between text-xs text-stone-500 gap-3 rounded-b-3xl">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#C5A059]" />
            <span>
              <strong>Dica de uso:</strong> Clique no nome de qualquer apuração ou na célula de qualquer mês para abrir a listagem completa de clientes e alterar o status.
            </span>
          </div>

          {/* Legenda de Conclusão */}
          <div className="flex items-center space-x-3 text-[11px]">
            <div className="flex items-center space-x-1.5" title="Há pendência apontada pelo ADM aguardando revisão">
              <span className="w-3 h-3 rounded-md bg-rose-100 border border-rose-400 flex items-center justify-center">
                <AlertTriangle className="w-2 h-2 text-rose-700" />
              </span>
              <span className="font-semibold text-rose-900">Pendência Apontada</span>
            </div>
            <div className="flex items-center space-x-1.5" title="Apuração 100% concluída e homologada pelo ADM">
              <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-2 h-2 text-emerald-700" />
              </span>
              <span className="font-semibold text-emerald-900">100% Validado ADM</span>
            </div>
            <div className="flex items-center space-x-1.5" title="Apuração 100% concluída, aguardando validação do ADM">
              <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-300 flex items-center justify-center">
                <Clock className="w-2 h-2 text-slate-500" />
              </span>
              <span className="font-semibold text-slate-700">100% Aguardando Validação</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-md bg-amber-100 border border-amber-300"></span>
              <span className="font-semibold text-amber-900">Parcial</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-md bg-stone-100 border border-stone-300"></span>
              <span className="text-stone-400">0% Pendente</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. MODAL DE DRILLDOWN DE CLIENTES POR APURAÇÃO */}
      {drilldownModalOpen && (
        <ApuracaoDrilldownModal
          isOpen={drilldownModalOpen}
          onClose={() => setDrilldownModalOpen(false)}
          obrigacaoName={selectedObligation}
          regime={activeTab}
          competencia={selectedCompForDrilldown}
          clients={activeScopedClients}
          inputValues={inputValues}
          validations={validations}
          initialShowPendingOnly={drilldownInitialShowPending}
          onStatusChange={handleStatusChange}
          isObligationEnabled={isObligationEnabled}
          onRefreshData={fetchApuracaoData}
        />
      )}

      {/* 6. MODAL DE APURAÇÕES COMPLETAS DE UM DETERMINADO CLIENTE (COM APROVADO / PENDENTE E NAVEGAÇÃO 100%) */}
      {clientApuracoesModalOpen && clientForApuracoesModal && (
        <ClientApuracoesModal
          isOpen={clientApuracoesModalOpen}
          onClose={() => {
            setClientApuracoesModalOpen(false);
            setClientForApuracoesModal(null);
          }}
          client={clientForApuracoesModal}
          regime={activeTab}
          year={selectedYear}
          yearCompetencias={yearCompetencias}
          obligations={currentObligations}
          inputValues={inputValues}
          validations={validations}
          onStatusChange={handleClientStatusChange}
          isObligationEnabled={isObligationEnabled}
          clients100Percent={clients100Percent}
          allClients={tabClients}
          onSelectClient={(c) => setClientForApuracoesModal(c)}
          onRefreshData={fetchApuracaoData}
          defaultCompetencia={currentMonthCompetencia}
        />
      )}
    </div>
  );
};

export default Apuracao;
