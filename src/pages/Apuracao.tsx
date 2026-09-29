import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Calendar,
  Building,
  CheckSquare,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatCompetencia } from '../utils/competencia';
import {
  FISCAL_OBLIGATIONS,
  FISCAL_REGIME_OPTIONS,
} from '../constants/fiscalObligations';
import { APURACAO_CLIENT_IDS } from '../constants/apuracaoScope';
import { RawCnpjCopyButton } from '../components/RawCnpjCopyButton';
import { PortalsDropdown } from '../components/PortalsDropdown';
import type { FiscalRegimeType } from '../constants/fiscalObligations';
import type { Client, FiscalRecord } from '../types';

export const Apuracao: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Estados principais
  const [activeTab, setActiveTab] = useState<FiscalRegimeType>('Simples Nacional');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Dados
  const [clients, setClients] = useState<Client[]>([]);

  // Filtros de Período (Mês e Ano de Competência)
  const [cardMonth, setCardMonth] = useState<number>(() => new Date().getMonth());
  const [cardYear, setCardYear] = useState<number>(() => new Date().getFullYear());

  // Competência formatada ex: "set/26"
  const selectedCompetencia = useMemo(() => {
    return formatCompetencia(cardMonth, cardYear, true);
  }, [cardMonth, cardYear]);

  // Busca textual de cliente
  const [searchTerm, setSearchTerm] = useState('');

  // Cache local em memória de valores digitados para feedback imediato e debounce de gravação
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Lista de anos disponíveis no seletor
  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years = [current - 2, current - 1, current, current + 1];
    return years.sort((a, b) => b - a);
  }, []);

  // 1. Carrega Clientes e Registros de Apuração
  const fetchApuracaoData = useCallback(async () => {
    setLoading(true);
    try {
      // Busca apenas clientes ativos para a rotina de apuração (com credenciais dos portais)
      const { data: clientsData, error: clientErr } = await supabase
        .from('clients')
        .select(`
          *,
          client_credentials (*)
        `)
        .ilike('status', 'ATIVO')
        .order('razao_social', { ascending: true });

      if (clientErr) throw clientErr;
      setClients(clientsData as Client[]);

      // Busca os registros de apuração para a competência selecionada
      const { data: recordsData, error: recErr } = await supabase
        .from('fiscal_records')
        .select('*')
        .eq('competencia', selectedCompetencia);

      if (recErr) throw recErr;
      const recList = (recordsData || []) as FiscalRecord[];

      // Sincroniza os inputValues
      const initialMap: Record<string, string> = {};
      recList.forEach((r) => {
        const key = `${r.client_id}::${r.obrigacao}`;
        initialMap[key] = r.valor || '';
      });
      setInputValues(initialMap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar apuração fiscal';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCompetencia, toast]);

  useEffect(() => {
    fetchApuracaoData();
  }, [fetchApuracaoData]);

  // Salvar uma célula de apuração no Supabase
  const saveRecord = useCallback(
    async (client: Client, obrigacao: string, val: string) => {
      const key = `${client.id}::${obrigacao}`;
      const cleanVal = val.trim();
      const isOk = cleanVal.toUpperCase() === 'OK';
      const status = isOk ? 'OK' : cleanVal ? 'OBS' : 'PENDENTE';

      setSavingKey(key);

      try {
        const payload = {
          client_id: client.id,
          competencia: selectedCompetencia,
          regime: activeTab,
          obrigacao,
          valor: cleanVal,
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
        setSavingKey(null);
      } catch (err: unknown) {
        console.error('Erro ao salvar apuração:', err);
        setSavingKey(null);
        toast('Não foi possível salvar o registro de apuração.', 'error', 'Erro ao salvar');
      }
    },
    [activeTab, selectedCompetencia, user?.id, toast]
  );

  // Debounce timeout ref para persistência automática
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleCellChange = (client: Client, obrigacao: string, newValue: string) => {
    const key = `${client.id}::${obrigacao}`;
    setInputValues((prev) => ({ ...prev, [key]: newValue }));

    // Limpa timer anterior para esta célula
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    // Salva automaticamente com debounce de 600ms
    debounceTimers.current[key] = setTimeout(() => {
      saveRecord(client, obrigacao, newValue);
      delete debounceTimers.current[key];
    }, 600);
  };

  const handleCellBlur = (client: Client, obrigacao: string) => {
    const key = `${client.id}::${obrigacao}`;
    // Se ainda houver timeout pendente, cancela e salva imediatamente no blur
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
      delete debounceTimers.current[key];
      const val = inputValues[key] ?? '';
      saveRecord(client, obrigacao, val);
    }
  };

  // Clientes filtrados para a aba ativa
  const tabClients = useMemo(() => {
    return clients.filter((c) => {
      // 0. Apenas clientes ATIVOS participam do setor de apuração
      const statusNorm = (c.status || '').trim().toUpperCase();
      if (statusNorm !== 'ATIVO') return false;

      // 1. Filtrar pelo escopo oficial da aba (166 Simples Nacional, 18 Lucro Presumido, 7 Folha de Pagamento)
      const scopeSet = APURACAO_CLIENT_IDS[activeTab];
      const matchRegime = scopeSet ? scopeSet.has(c.id) : false;

      if (!matchRegime) return false;

      // 2. Filtro textual de busca
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = (c.razao_social || '').toLowerCase().includes(term);
        const matchCnpj = (c.cnpj || '').includes(term);
        const matchCity = (c.localidade || '').toLowerCase().includes(term);
        const matchDominio = (c.numero_pasta || '').toLowerCase().includes(term);
        return matchName || matchCnpj || matchCity || matchDominio;
      }

      return true;
    });
  }, [clients, activeTab, searchTerm]);

  // Lista de obrigações da aba ativa
  const currentObligations = useMemo(() => {
    return FISCAL_OBLIGATIONS[activeTab] || [];
  }, [activeTab]);

  // Função auxiliar para verificar se uma obrigação está habilitada para o cliente
  const isObligationEnabled = useCallback((client: Client, obrigacao: string) => {
    // Se o cliente tem a lista configurada, checa nela
    if (client.obrigacoes_habilitadas && Array.isArray(client.obrigacoes_habilitadas)) {
      return client.obrigacoes_habilitadas.includes(obrigacao);
    }
    // Caso padrão (se ainda não cadastrado o checklist): todas habilitadas
    return true;
  }, []);

  // Cálculo de Progresso por Cliente
  const calculateClientProgress = useCallback(
    (client: Client) => {
      const enabledList = currentObligations.filter((ob) => isObligationEnabled(client, ob));
      const totalEnabled = enabledList.length;

      if (totalEnabled === 0) return { totalEnabled: 0, okCount: 0, percent: 100 };

      let okCount = 0;
      enabledList.forEach((ob) => {
        const key = `${client.id}::${ob}`;
        const val = (inputValues[key] !== undefined ? inputValues[key] : '') || '';
        if (val.trim().toUpperCase() === 'OK') {
          okCount++;
        }
      });

      const percent = Math.round((okCount / totalEnabled) * 100);
      return { totalEnabled, okCount, percent };
    },
    [currentObligations, isObligationEnabled, inputValues]
  );

  // Totais Gerais do Dashboard no topo da página
  const dashboardStats = useMemo(() => {
    let totalClientsCount = tabClients.length;
    let totalCompletedClients = 0;
    let sumPercentages = 0;

    tabClients.forEach((c) => {
      const { percent } = calculateClientProgress(c);
      if (percent === 100) totalCompletedClients++;
      sumPercentages += percent;
    });

    const averageProgress = totalClientsCount > 0 ? Math.round(sumPercentages / totalClientsCount) : 0;

    return {
      totalClientsCount,
      totalCompletedClients,
      pendingClients: totalClientsCount - totalCompletedClients,
      averageProgress,
    };
  }, [tabClients, calculateClientProgress]);

  // Ação rápida: Marcar todos os campos habilitados do cliente como "OK"
  const handleMarkAllClientOk = async (client: Client) => {
    const enabledList = currentObligations.filter((ob) => isObligationEnabled(client, ob));
    if (enabledList.length === 0) return;

    if (!window.confirm(`Deseja marcar todas as ${enabledList.length} obrigações de "${client.razao_social}" como "OK"?`)) {
      return;
    }

    const updates: Record<string, string> = {};
    for (const ob of enabledList) {
      const key = `${client.id}::${ob}`;
      updates[key] = 'OK';
    }
    setInputValues((prev) => ({ ...prev, ...updates }));

    // Persiste em lote no banco
    try {
      const payloads = enabledList.map((ob) => ({
        client_id: client.id,
        competencia: selectedCompetencia,
        regime: activeTab,
        obrigacao: ob,
        valor: 'OK',
        status: 'OK',
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('fiscal_records')
        .upsert(payloads, { onConflict: 'client_id,competencia,obrigacao' })
        .select();

      if (error) throw error;

      toast(`Todas as obrigações de "${client.razao_social}" foram marcadas como OK!`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar em lote.';
      toast(msg, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-[#1E2022] tracking-tight flex items-center space-x-2">
              <Calculator className="w-6 h-6 text-[#C5A059]" />
              <span>Apuração Fiscal e Contábil</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
              Rotina Mensal
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Controle de obrigações tributárias, rotinas de fechamento e apuração mensal por cliente e regime
          </p>
        </div>

        {/* Botão de Atualizar */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchApuracaoData}
            title="Recarregar dados"
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#C5A059]' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE CONTROLES: FILTRO DE PERÍODO (MÊS / ANO) + CARDS RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        {/* Card Seletor de Período */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-2 text-stone-700 mb-2">
            <Calendar className="w-4 h-4 text-[#C5A059]" />
            <span className="text-xs font-bold">Competência:</span>
            <span className="text-xs font-mono font-extrabold text-[#C5A059] bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
              {selectedCompetencia}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="comp-month" className="block text-[10px] font-semibold text-gray-500 mb-1">
                Mês
              </label>
              <select
                id="comp-month"
                value={cardMonth}
                onChange={(e) => setCardMonth(Number(e.target.value))}
                className="w-full text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#C5A059] focus:outline-none cursor-pointer"
              >
                {[
                  { value: 0, label: '01 - Jan' },
                  { value: 1, label: '02 - Fev' },
                  { value: 2, label: '03 - Mar' },
                  { value: 3, label: '04 - Abr' },
                  { value: 4, label: '05 - Mai' },
                  { value: 5, label: '06 - Jun' },
                  { value: 6, label: '07 - Jul' },
                  { value: 7, label: '08 - Ago' },
                  { value: 8, label: '09 - Set' },
                  { value: 9, label: '10 - Out' },
                  { value: 10, label: '11 - Nov' },
                  { value: 11, label: '12 - Dez' },
                ].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="comp-year" className="block text-[10px] font-semibold text-gray-500 mb-1">
                Ano
              </label>
              <select
                id="comp-year"
                value={cardYear}
                onChange={(e) => setCardYear(Number(e.target.value))}
                className="w-full text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#C5A059] focus:outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Card 1: Total de Clientes no Regime */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Clientes no Escopo
            </span>
            <div className="text-xl font-extrabold text-stone-800 mt-1">
              {dashboardStats.totalClientsCount}
            </div>
            <div className="text-[10px] text-gray-500">
              {activeTab}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
            <Building className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Clientes Concluídos 100% */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
              100% Apurados
            </span>
            <div className="text-xl font-extrabold text-emerald-600 mt-1">
              {dashboardStats.totalCompletedClients}
            </div>
            <div className="text-[10px] text-gray-500">
              {dashboardStats.pendingClients} cliente(s) pendente(s)
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Progresso Médio da Rotina */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div className="w-full mr-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Progresso Geral
              </span>
              <span className="text-xs font-extrabold text-[#C5A059]">
                {dashboardStats.averageProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div
                style={{ width: `${dashboardStats.averageProgress}%` }}
                className="bg-gradient-to-r from-[#C5A059] to-[#D4B26F] h-full rounded-full transition-all duration-500"
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              Média de apuração do mês
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. BARRA DE NAVEGAÇÃO POR ABAS (TABS) & BUSCA */}
      <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center space-x-1.5 bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-none">
          {FISCAL_REGIME_OPTIONS.map((regime) => {
            const isActive = activeTab === regime.value;
            // Contagem de clientes naquele regime
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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap inline-flex items-center space-x-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#1E2022] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                <span>{regime.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-amber-100 text-amber-900 font-extrabold' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Campo de Busca Rápida */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, CNPJ ou cidade..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 focus:bg-white border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#C5A059] focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* 4. TABELA DINÂMICA DE APURAÇÃO (COM ROLAGEM HORIZONTAL E COLUNAS CONGELADAS) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-stone-50 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                {/* Colunas Fixas Congeladas à Esquerda */}
                <th className="py-3 px-3.5 sticky left-0 z-20 bg-stone-50 shadow-[1px_0_0_0_#E5E7EB] w-[260px] min-w-[260px] max-w-[260px]">
                  Razão Social / Cliente
                </th>
                <th className="py-3 px-3 sticky left-[260px] z-20 bg-stone-50 shadow-[1px_0_0_0_#E5E7EB] w-[170px] min-w-[170px] max-w-[170px] whitespace-nowrap">
                  CNPJ
                </th>
                <th className="py-3 px-3 min-w-[100px] whitespace-nowrap">
                  Portais
                </th>
                <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">
                  Localidade
                </th>

                {/* Colunas Dinâmicas: Uma para cada obrigação */}
                {currentObligations.map((obrigacao) => (
                  <th
                    key={obrigacao}
                    className="py-3 px-2 text-center text-[10px] min-w-[115px] max-w-[140px] whitespace-normal leading-tight border-l border-gray-100"
                    title={obrigacao}
                  >
                    <span className="line-clamp-2">{obrigacao}</span>
                  </th>
                ))}

                {/* Coluna Final: % Concluído */}
                <th className="py-3 px-3 text-center sticky right-0 z-20 bg-stone-50 shadow-[-1px_0_0_0_#E5E7EB] min-w-[130px]">
                  % Concluído
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {loading ? (
                <tr>
                  <td
                    colSpan={currentObligations.length + 5}
                    className="py-16 text-center text-gray-400"
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Carregando rotina de apuração...</span>
                    </div>
                  </td>
                </tr>
              ) : tabClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentObligations.length + 5}
                    className="py-16 text-center text-gray-400"
                  >
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <span className="text-xs font-semibold">
                      Nenhum cliente cadastrado no regime "{activeTab}"
                      {searchTerm ? ' para o filtro informado' : ''}.
                    </span>
                  </td>
                </tr>
              ) : (
                tabClients.map((client) => {
                  const progress = calculateClientProgress(client);
                  const is100 = progress.percent === 100;

                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-amber-50/20 transition-colors ${
                        is100 ? 'bg-emerald-50/15' : ''
                      }`}
                    >
                      {/* Coluna 1 Fixa: Razão Social */}
                      <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-white group-hover:bg-amber-50/20 shadow-[1px_0_0_0_#E5E7EB] w-[260px] min-w-[260px] max-w-[260px]">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <span
                              className="font-bold text-gray-900 truncate block text-xs"
                              title={client.razao_social}
                            >
                              {client.razao_social}
                            </span>
                            <div className="flex items-center space-x-1.5 text-[10px] text-gray-400">
                              <span>Nº Domínio: {client.numero_pasta || '-'}</span>
                              {client.parcelamento_ativo && (
                                <span className="text-[#C5A059] font-bold">Parc. Ativo</span>
                              )}
                            </div>
                          </div>

                          {/* Botão de Atalho para Marcar todos como OK */}
                          <button
                            type="button"
                            onClick={() => handleMarkAllClientOk(client)}
                            title="Marcar todas as obrigações deste cliente como OK"
                            className="p-1 rounded hover:bg-emerald-100 text-gray-300 hover:text-emerald-700 transition-colors cursor-pointer shrink-0"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Coluna 2 Fixa: CNPJ (sem máscara e com botão de copiar) */}
                      <td className="py-2.5 px-3 sticky left-[260px] z-10 bg-white shadow-[1px_0_0_0_#E5E7EB] w-[170px] min-w-[170px] max-w-[170px] whitespace-nowrap">
                        <RawCnpjCopyButton cnpj={client.cnpj || client.cpf} />
                      </td>

                      {/* Coluna 3: Portais com logins e senhas */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <PortalsDropdown
                          loginPrefeitura={client.login_prefeitura}
                          senhaPrefeitura={client.senha_prefeitura}
                          loginPostoFiscal={client.login_posto_fiscal}
                          senhaPostoFiscal={client.senha_posto_fiscal}
                          extraCredentials={client.client_credentials}
                        />
                      </td>

                      {/* Coluna 4: Localidade */}
                      <td className="py-2.5 px-3 text-[11px] text-gray-600 whitespace-nowrap">
                        {client.localidade || '-'}
                      </td>

                      {/* Colunas Dinâmicas: Inputs de Obrigação */}
                      {currentObligations.map((obrigacao) => {
                        const key = `${client.id}::${obrigacao}`;
                        const isEnabled = isObligationEnabled(client, obrigacao);
                        const rawValue = inputValues[key] !== undefined ? inputValues[key] : '';
                        const cleanValue = rawValue.trim();
                        const isOk = cleanValue.toUpperCase() === 'OK';
                        const isFilled = cleanValue.length > 0;
                        const isSavingThis = savingKey === key;

                        // 1. Obrigação NÃO habilitada para este cliente:
                        // Mantém desabilitado, marca d'água cinza claro, sem permitir digitação
                        if (!isEnabled) {
                          return (
                            <td
                              key={obrigacao}
                              className="py-1 px-1.5 text-center bg-gray-50/80 border-l border-gray-100"
                              title="Obrigação não aplicável a este cliente"
                            >
                              <div className="w-full py-1 text-[10px] text-gray-300 font-mono select-none">
                                N/A
                              </div>
                            </td>
                          );
                        }

                        // 2. Obrigação HABILITADA:
                        // Input inline com estilização condicional (Verde se OK, Vermelho se outro valor, Neutro se vazio)
                        let inputStyle = 'bg-white border-gray-200 text-gray-800 focus:border-[#C5A059]';
                        if (isOk) {
                          inputStyle = 'bg-emerald-50 border-emerald-400 text-emerald-800 font-extrabold shadow-2xs';
                        } else if (isFilled) {
                          inputStyle = 'bg-rose-50 border-rose-300 text-rose-700 font-semibold';
                        }

                        return (
                          <td
                            key={obrigacao}
                            className="py-1 px-1.5 text-center border-l border-gray-100 relative"
                          >
                            <input
                              type="text"
                              value={rawValue}
                              onChange={(e) => handleCellChange(client, obrigacao, e.target.value)}
                              onBlur={() => handleCellBlur(client, obrigacao)}
                              placeholder="-"
                              title={`Valor: "${rawValue}" | Digite "OK" para concluir`}
                              className={`w-full text-center text-[11px] py-1 px-1 rounded-lg border transition-all focus:outline-none focus:ring-1 focus:ring-[#C5A059] ${inputStyle}`}
                            />
                            {isSavingThis && (
                              <span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            )}
                          </td>
                        );
                      })}

                      {/* Coluna Final Fixa: % Concluído com Barra de Progresso */}
                      <td className="py-2 px-3 sticky right-0 z-10 bg-white shadow-[-1px_0_0_0_#E5E7EB] text-center">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span
                              className={`text-xs font-black font-mono ${
                                is100
                                  ? 'text-emerald-600'
                                  : progress.percent > 0
                                  ? 'text-[#C5A059]'
                                  : 'text-gray-400'
                              }`}
                            >
                              {progress.percent}%
                            </span>
                            {is100 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          </div>

                          {/* Mini Barra de Progresso */}
                          <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${progress.percent}%` }}
                              className={`h-full rounded-full transition-all duration-300 ${
                                is100 ? 'bg-emerald-500' : 'bg-[#C5A059]'
                              }`}
                            />
                          </div>

                          <span className="text-[9px] text-gray-400">
                            {progress.okCount}/{progress.totalEnabled}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela com Legenda das Cores */}
        <div className="p-3 bg-stone-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-3">
          <div className="flex items-center space-x-4">
            <span>
              Total de Clientes no Regime: <strong className="text-gray-800">{tabClients.length}</strong>
            </span>
            <span className="border-l pl-3 border-gray-300">
              Obrigações na Rotina: <strong className="text-gray-800">{currentObligations.length}</strong>
            </span>
          </div>

          {/* Legenda de Cores */}
          <div className="flex items-center flex-wrap gap-3 text-[11px]">
            <div className="flex items-center space-x-1">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-400"></span>
              <span className="text-emerald-900 font-semibold">"OK" (Concluído)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300"></span>
              <span className="text-rose-700 font-semibold">Diferente de "OK" (Observação/Pendente)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></span>
              <span className="text-gray-400">Vazio (Não iniciado)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200 text-[8px] flex items-center justify-center font-mono text-gray-400">
                N/A
              </span>
              <span className="text-gray-400">Desabilitado (Não aplicável)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Apuracao;
