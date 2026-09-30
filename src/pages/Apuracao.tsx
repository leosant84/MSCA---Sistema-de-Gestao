import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calculator,
  CheckCircle2,
  RefreshCw,
  Calendar,
  Building,
  TrendingUp,
  Layers,
  Sparkles,
  ChevronRight,
  X,
  User,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatCompetencia } from '../utils/competencia';
import {
  FISCAL_OBLIGATIONS,
  FISCAL_REGIME_OPTIONS,
} from '../constants/fiscalObligations';
import { APURACAO_CLIENT_IDS } from '../constants/apuracaoScope';
import { ApuracaoDrilldownModal } from '../components/ApuracaoDrilldownModal';
import { ApuracaoValidationModal } from '../components/ApuracaoValidationModal';
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

  // Filtro por Cliente Específico e Modal de Apurações do Cliente
  const [selectedClientIdFilter, setSelectedClientIdFilter] = useState<string>('');
  const [onlyReadyForValidationFilter, setOnlyReadyForValidationFilter] = useState<boolean>(false);
  const [clientApuracoesModalOpen, setClientApuracoesModalOpen] = useState(false);
  const [clientForApuracoesModal, setClientForApuracoesModal] = useState<Client | null>(null);

  // Modal de Validação ADM
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [clientToValidate, setClientToValidate] = useState<Client | null>(null);
  const [compToValidate, setCompToValidate] = useState<string>('');

  // Lista de Anos disponíveis
  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  // Lista de competências do ano selecionado (12 meses: JAN/YY a DEZ/YY)
  const yearCompetencias = useMemo(() => {
    return MONTH_NAMES_SHORT.map((_, idx) => formatCompetencia(idx, selectedYear, true));
  }, [selectedYear]);

  const currentMonthIdx = useMemo(() => new Date().getMonth(), []);
  const currentMonthCompetencia = useMemo(() => {
    return formatCompetencia(currentMonthIdx, selectedYear, true);
  }, [currentMonthIdx, selectedYear]);

  // Lista de obrigações da aba ativa (sem etapa 'ENVIO')
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

      // 2. Busca registros fiscais das 12 competências do ano selecionado
      const shortYearStr = String(selectedYear).slice(-2);
      const { data: recordsData, error: recErr } = await supabase
        .from('fiscal_records')
        .select('*')
        .like('competencia', `%/${shortYearStr}`);

      if (recErr) throw recErr;
      const recList = (recordsData || []) as FiscalRecord[];

      const map: Record<string, string> = {};
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      // Pré-preenche meses anteriores como "OK" (100% apurados)
      loadedClients.forEach((client) => {
        MONTH_NAMES_SHORT.forEach((_, monthIdx) => {
          const isPast =
            selectedYear < currentYear ||
            (selectedYear === currentYear && monthIdx < currentMonth);

          if (isPast) {
            const comp = formatCompetencia(monthIdx, selectedYear, true);
            const allObligations = [
              ...(FISCAL_OBLIGATIONS['Simples Nacional'] || []),
              ...(FISCAL_OBLIGATIONS['Lucro Presumido'] || []),
              ...(FISCAL_OBLIGATIONS['Folha de Pagamento'] || []),
            ];
            allObligations.forEach((ob) => {
              const k = `${client.id}::${ob}::${comp}`;
              map[k] = 'OK';
            });
          }
        });
      });

      // Sobrescreve com os registros reais do banco (se houver edição pelo usuário)
      recList.forEach((r) => {
        const key = `${r.client_id}::${r.obrigacao}::${r.competencia}`;
        map[key] = r.valor || '';
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
          setClientToValidate(found);
          setCompToValidate(valCompParam);
          setValidationModalOpen(true);
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
        setClientToValidate(found);
        setCompToValidate(valCompParam);
        setValidationModalOpen(true);
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

  useEffect(() => {
    fetchApuracaoData();
  }, [fetchApuracaoData]);

  // Auxiliar: checa se obrigação está habilitada para o cliente
  const isObligationEnabled = useCallback((client: Client, obrigacao: string) => {
    if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
      return client.obrigacoes_habilitadas.includes(obrigacao);
    }
    return true;
  }, []);

  // Clientes pertencentes ao escopo da aba ativa
  const tabClients = useMemo(() => {
    const scopeSet = APURACAO_CLIENT_IDS[activeTab];
    return clients.filter((c) => {
      const statusNorm = (c.status || '').trim().toUpperCase();
      if (statusNorm !== 'ATIVO') return false;
      return scopeSet ? scopeSet.has(c.id) : false;
    });
  }, [clients, activeTab]);

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

        // Se marcou como OK, verificar se o cliente atingiu 100% no mês
        if (isOk) {
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
    [activeTab, user?.id, toast]
  );

  // Auxiliar: checa se uma competência (ex: "jan/26") é de um mês anterior
  const isPastCompetencia = useCallback((compStr: string) => {
    const parts = compStr.toLowerCase().split('/');
    if (parts.length !== 2) return false;
    const mIdx = MONTH_NAMES_SHORT.findIndex((m) => m.toLowerCase() === parts[0]);
    if (mIdx === -1) return false;
    let y = parseInt(parts[1], 10);
    if (y < 100) y += 2000;

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();

    return y < curY || (y === curY && mIdx < curM);
  }, []);

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
      if (total === 0) return { total: 0, okCount: 0, percent: 100 };

      const isPast = isPastCompetencia(competencia);

      let okCount = 0;
      applicable.forEach((c) => {
        const key = `${c.id}::${obrigacao}::${competencia}`;
        const val = inputValues[key];

        // Se tiver valor no map (ou no banco), respeita o valor. Se não tiver registro e for mês anterior, considera OK (100%).
        if (val !== undefined) {
          if ((val || '').trim().toUpperCase() === 'OK') {
            okCount++;
          }
        } else if (isPast) {
          okCount++;
        }
      });

      const percent = Math.round((okCount / total) * 100);
      return { total, okCount, percent };
    },
    [activeScopedClients, isObligationEnabled, inputValues, isPastCompetencia]
  );

  // Auxiliar: verifica se o mês está validado pelo ADM
  // Se houver cliente único filtrado, checa se a apuração daquele cliente no mês foi validada (ou a obrigação específica)
  // Se não houver cliente filtrado, checa se todos os clientes aplicáveis foram validados pelo ADM
  const isMonthValidated = useCallback(
    (competencia: string, obrigacao?: string) => {
      const isClientVal = (c: Client) => {
        const k = buildValidationKey(c.id, competencia);
        const valRec = validations[k];
        if (!valRec) return false;
        if (obrigacao && valRec.validated_obligations && Array.isArray(valRec.validated_obligations)) {
          return valRec.validated_obligations.includes(obrigacao);
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
    [currentFilteredClient, activeScopedClients, isObligationEnabled, validations]
  );

  // Calcula o status de conclusão e validação de um cliente na competência corrente
  const getClientCurrentMonthSummary = useCallback(
    (client: Client) => {
      const applicable = currentObligations.filter((ob) => isObligationEnabled(client, ob));
      if (applicable.length === 0) return { percent: 100, is100: true, isValidated: false };

      const isPast = isPastCompetencia(currentMonthCompetencia);
      let okCount = 0;

      applicable.forEach((ob) => {
        const key = `${client.id}::${ob}::${currentMonthCompetencia}`;
        const val = inputValues[key];
        if (val !== undefined) {
          if ((val || '').trim().toUpperCase() === 'OK') okCount++;
        } else if (isPast) {
          okCount++;
        }
      });

      const percent = Math.round((okCount / applicable.length) * 100);
      const is100 = percent === 100;
      const vKey = buildValidationKey(client.id, currentMonthCompetencia);
      const isValidated = is100 && validations[vKey]?.status === 'APPROVED';

      return { percent, is100, isValidated };
    },
    [currentObligations, isObligationEnabled, currentMonthCompetencia, isPastCompetencia, inputValues, validations]
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

  // Lista de clientes disponíveis no select (considera filtro de "apenas prontos para validar")
  const selectableClients = useMemo(() => {
    const list = onlyReadyForValidationFilter
      ? clientsWithStatus.filter((c) => c.is100 && !c.isValidated)
      : [...clientsWithStatus];

    return list.sort((a, b) => {
      return (a.client.razao_social || '').localeCompare(b.client.razao_social || '', 'pt-BR');
    });
  }, [clientsWithStatus, onlyReadyForValidationFilter]);



  const overallCurrentMonthProgress = useMemo(() => {
    if (currentObligations.length === 0) return 0;
    let sumPercent = 0;
    currentObligations.forEach((ob) => {
      const stats = getObligationMonthStats(ob, currentMonthCompetencia);
      sumPercent += stats.percent;
    });
    return Math.round(sumPercent / currentObligations.length);
  }, [currentObligations, getObligationMonthStats, currentMonthCompetencia]);

  // Abrir Modal de Drilldown para uma apuração
  const handleOpenDrilldown = (obrigacao: string, comp: string) => {
    setSelectedObligation(obrigacao);
    setSelectedCompForDrilldown(comp);
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

      {/* 2. CARDS DE RESUMO OPERACIONAL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Card 1: Total de Clientes no Regime */}
        <div className="bg-white p-4 rounded-3xl border border-stone-200/70 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Clientes no Regime
            </span>
            <div className="text-2xl font-extrabold text-stone-800 mt-0.5">
              {tabClients.length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              {activeTab} • Ativos
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-2xs">
            <Building className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Total de Apurações do Regime */}
        <div className="bg-white p-4 rounded-3xl border border-stone-200/70 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
              Tipos de Apuração
            </span>
            <div className="text-2xl font-extrabold text-stone-800 mt-0.5">
              {currentObligations.length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              Etapa Envio Desconsiderada
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200/60 shadow-2xs">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Progresso da Competência Corrente */}
        <div className="bg-white p-4 rounded-3xl border border-stone-200/70 shadow-xs flex items-center justify-between">
          <div className="w-full mr-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                Mês Corrente ({currentMonthCompetencia})
              </span>
              <span className="text-sm font-extrabold text-emerald-700">
                {overallCurrentMonthProgress}%
              </span>
            </div>
            <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
              <div
                style={{ width: `${overallCurrentMonthProgress}%` }}
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              />
            </div>
            <div className="text-[10px] text-stone-400 mt-1">
              Média consolidada do mês atual
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. BARRA DE SELEÇÃO DE REGIME (TABS) */}
      <div className="bg-white p-2.5 rounded-3xl border border-stone-200/70 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-stone-100/80 p-1 rounded-2xl overflow-x-auto scrollbar-none">
          {FISCAL_REGIME_OPTIONS.map((regime) => {
            const isActive = activeTab === regime.value;
            const scopeSet = APURACAO_CLIENT_IDS[regime.value];
            const count = clients.filter((c) => {
              const statusNorm = (c.status || '').trim().toUpperCase();
              if (statusNorm !== 'ATIVO') return false;
              return scopeSet ? scopeSet.has(c.id) : false;
            }).length;

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
          {readyForValidationCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const nextVal = !onlyReadyForValidationFilter;
                setOnlyReadyForValidationFilter(nextVal);
                if (nextVal) {
                  // Seleciona automaticamente o primeiro cliente da lista para validar
                  const firstReady = clientsWithStatus.find((c) => c.is100 && !c.isValidated);
                  if (firstReady) {
                    setSelectedClientIdFilter(firstReady.client.id);
                  }
                }
              }}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-2xs cursor-pointer border ${
                onlyReadyForValidationFilter
                  ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
              }`}
              title="Filtrar clientes que estão 100% apurados aguardando validação do ADM"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>100% Para Validar</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  onlyReadyForValidationFilter ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
                }`}
              >
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
                {onlyReadyForValidationFilter
                  ? `Prontos para validar (${selectableClients.length})`
                  : `Todos os clientes (${tabClients.length})`}
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

              {profile?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setClientToValidate(currentFilteredClient);
                    setCompToValidate(currentMonthCompetencia);
                    setValidationModalOpen(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title={`Validar ou apontar pendência de apuração para ${currentFilteredClient.razao_social}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Validar / Apontar Pendência</span>
                </button>
              )}
            </div>
          )}

          {!selectedClientIdFilter && !onlyReadyForValidationFilter && (
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

                      return (
                        <td
                          key={compStr}
                          onClick={() => handleOpenDrilldown(obrigacao, compStr)}
                          className="py-2 px-1 text-center cursor-pointer hover:bg-amber-50/60 transition-colors"
                          title={`${obrigacao} em ${compStr}: ${stats.percent}% (${stats.okCount}/${stats.total} clientes). ${
                            is100
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
                                is100
                                  ? isValidated
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold'
                                    : 'bg-slate-100 text-slate-700 border border-slate-300 font-bold'
                                  : isZero
                                  ? 'bg-stone-100 text-stone-400 border border-stone-200/80 font-normal'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                              }`}
                            >
                              <span>{stats.percent}%</span>
                              {is100 && (
                                isValidated ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                )
                              )}
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
          clients={tabClients}
          inputValues={inputValues}
          onStatusChange={handleStatusChange}
          isObligationEnabled={isObligationEnabled}
        />
      )}

      {/* 6. MODAL DE VALIDAÇÃO DO ADM */}
      {validationModalOpen && (
        <ApuracaoValidationModal
          isOpen={validationModalOpen}
          onClose={() => setValidationModalOpen(false)}
          client={clientToValidate}
          competencia={compToValidate}
          regime={activeTab}
          obligations={currentObligations.filter((ob) =>
            clientToValidate ? isObligationEnabled(clientToValidate, ob) : true
          )}
          onValidationSuccess={fetchApuracaoData}
        />
      )}

      {/* 7. MODAL DE APURAÇÕES COMPLETAS DE UM DETERMINADO CLIENTE */}
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
          onOpenValidationModal={(cli, comp) => {
            setClientToValidate(cli);
            setCompToValidate(comp);
            setValidationModalOpen(true);
          }}
          onRefreshData={fetchApuracaoData}
        />
      )}
    </div>
  );
};

export default Apuracao;
