import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Building,
  Shield,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  Receipt,
  MapPin,
  Percent,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CnpjCopyButton } from '../components/CnpjCopyButton';
import { CpfCopyButton } from '../components/CpfCopyButton';
import { PortalsDropdown } from '../components/PortalsDropdown';
import { ClientModal } from '../components/ClientModal';
import { ExportClientsModal } from '../components/ExportClientsModal';
import { isEntryOverdue } from '../utils/competencia';
import type { Client, FinancialEntry } from '../types';

export const Clients: React.FC = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ATIVO');

  // Ordenação das Colunas
  type SortField = 'numero_pasta' | 'razao_social' | 'cnpj' | 'cpf' | 'localidade' | 'fator_r' | 'status';
  const [sortField, setSortField] = useState<SortField>('razao_social');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    if (location.state?.accessDenied) {
      toast('Acesso restrito: apenas Administradores têm permissão para acessar o Módulo Financeiro.', 'error');
      // Limpa o state para não disparar novamente
      window.history.replaceState({}, document.title);
    }
  }, [location.state, toast]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Referência para o atalho de teclado Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      // 1. Busca lista de clientes
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_credentials (*)
        `)
        .order('razao_social', { ascending: true });

      if (error) throw error;
      setClients(data as Client[]);

      // 2. Se for admin, busca lançamentos para mapear inadimplência
      if (isAdmin) {
        const { data: entriesData } = await supabase
          .from('financial_entries')
          .select('id, client_id, competencia, valor, status, observacao')
          .eq('status', 'À RECEBER');
        if (entriesData) {
          setFinancialEntries(entriesData as FinancialEntry[]);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar lista de clientes';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [isAdmin]);

  // Atalho Ctrl+K ou Cmd+K para focar no campo de busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mapeia quais clientes possuem débitos vencidos (inadimplentes) e detalhes das pendências
  const overdueClientsMap = useMemo(() => {
    const map = new Map<string, { totalOverdue: number; count: number; oldestComp: string }>();
    if (!isAdmin || financialEntries.length === 0) return map;

    financialEntries.forEach((entry) => {
      if (entry.client_id && isEntryOverdue(entry)) {
        const current = map.get(entry.client_id) || { totalOverdue: 0, count: 0, oldestComp: entry.competencia };
        current.totalOverdue += Number(entry.valor || 0);
        current.count += 1;
        map.set(entry.client_id, current);
      }
    });

    return map;
  }, [isAdmin, financialEntries]);

  // Limpa todos os filtros ativos
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('Todos');
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    statusFilter !== 'ATIVO'
  );

  // Filtragem dinâmica e ordenação por colunas
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const cleanNumbersQuery = searchQuery.replace(/\D/g, '');

    const filtered = clients.filter((c) => {
        if (statusFilter === '__FINANCEIRO_ATRASO__') {
          // Filtra todos os clientes que possuem valores a receber vencidos, independentemente do status (ativo, inativo, etc.)
          if (!overdueClientsMap.has(c.id)) {
            return false;
          }
        } else if (statusFilter !== 'Todos') {
          const clientStatusNorm = (c.status || '').trim().toUpperCase();
          const filterStatusNorm = statusFilter.trim().toUpperCase();

          if (filterStatusNorm === 'INATIVA' || filterStatusNorm === 'INATIVO') {
            if (!clientStatusNorm.startsWith('INATIV')) {
              return false;
            }
          } else {
            if (clientStatusNorm !== filterStatusNorm) {
              return false;
            }
          }
        }

      // 2. Campo de Busca Geral (se preenchido)
      if (q) {
        const matchesRazao = c.razao_social?.toLowerCase().includes(q);
        const matchesSieg = c.sieg?.toLowerCase().includes(q);
        const matchesPasta = c.numero_pasta?.toLowerCase().includes(q);
        const matchesLocal = c.localidade?.toLowerCase().includes(q);

        const rawCnpj = (c.cnpj || '').replace(/\D/g, '');
        const rawCpf = (c.cpf || '').replace(/\D/g, '');

        const matchesCnpj = cleanNumbersQuery && rawCnpj.includes(cleanNumbersQuery);
        const matchesCpf = cleanNumbersQuery && rawCpf.includes(cleanNumbersQuery);

        if (!matchesRazao && !matchesSieg && !matchesPasta && !matchesLocal && !matchesCnpj && !matchesCpf) {
          return false;
        }
      }

      return true;
    });

    // Ordenação dinâmica pela coluna selecionada
    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'numero_pasta': {
          const pastaA = (a.numero_pasta || '').trim();
          const pastaB = (b.numero_pasta || '').trim();
          comparison = pastaA.localeCompare(pastaB, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'razao_social': {
          const razaoA = (a.razao_social || '').trim();
          const razaoB = (b.razao_social || '').trim();
          comparison = razaoA.localeCompare(razaoB, 'pt-BR', { sensitivity: 'base' });
          break;
        }
        case 'cnpj': {
          const cnpjA = (a.cnpj || '').replace(/\D/g, '');
          const cnpjB = (b.cnpj || '').replace(/\D/g, '');
          comparison = cnpjA.localeCompare(cnpjB);
          break;
        }
        case 'cpf': {
          const cpfA = (a.cpf || '').replace(/\D/g, '');
          const cpfB = (b.cpf || '').replace(/\D/g, '');
          comparison = cpfA.localeCompare(cpfB);
          break;
        }
        case 'localidade': {
          const locA = (a.localidade || '').trim();
          const locB = (b.localidade || '').trim();
          comparison = locA.localeCompare(locB, 'pt-BR', { sensitivity: 'base' });
          break;
        }
        case 'fator_r': {
          const frA = (a.fator_r || '').trim();
          const frB = (b.fator_r || '').trim();
          comparison = frA.localeCompare(frB);
          break;
        }
        case 'status': {
          const stA = (a.status || '').trim();
          const stB = (b.status || '').trim();
          comparison = stA.localeCompare(stB);
          break;
        }
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    clients,
    searchQuery,
    statusFilter,
    sortField,
    sortDirection,
    overdueClientsMap,
  ]);

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedClient(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2022] tracking-tight">
            Gestão de Clientes
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Consulta rápida de cadastros, controle de pastas, acessos fiscais e credenciais
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchClients}
            title="Recarregar clientes"
            className="p-3 rounded-2xl border border-slate-200/80 bg-white/90 hover:bg-white text-stone-600 hover:text-stone-900 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C5A059]' : ''}`} />
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              title="Limpar todos os filtros da tabela"
              className="inline-flex items-center space-x-1.5 px-3.5 py-3 rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 text-xs font-semibold shadow-xs transition-all cursor-pointer animate-in fade-in"
            >
              <X className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">Limpar Filtros</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (filteredClients.length === 0) {
                toast('Nenhum cliente disponível para exportar com os filtros atuais.', 'info');
                return;
              }
              setIsExportModalOpen(true);
            }}
            title="Exportar clientes filtrados para Excel"
            className="inline-flex items-center space-x-2 px-4 py-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800 text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#C5A059] to-[#D4B26F] hover:from-[#b8934c] hover:to-[#c6a25e] text-white text-xs font-semibold shadow-md shadow-[#C5A059]/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Banner de Alerta Discreto para o Administrador sobre Inadimplência */}
      {isAdmin && overdueClientsMap.size > 0 && (
        <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-700">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div className="text-[11px] text-stone-600">
              <span className="font-semibold text-stone-800">Atenção Financeira:</span>
              <span className="ml-1">
                Existe(m) <strong className="text-stone-900 font-semibold">{overdueClientsMap.size} cliente(s)</strong> com valores a receber que já excederam a data de vencimento.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === '__FINANCEIRO_ATRASO__' ? 'Todos' : '__FINANCEIRO_ATRASO__')}
            className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-amber-100/80 text-stone-700 hover:text-amber-900 border border-stone-200/80 text-[11px] font-medium transition-colors shrink-0 cursor-pointer"
          >
            {statusFilter === '__FINANCEIRO_ATRASO__' ? 'Ver Todos os Clientes' : 'Filtrar Inadimplentes'}
          </button>
        </div>
      )}

      {/* Barra de Pesquisa e Filtros Refinada */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-stone-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por Razão Social, CNPJ, CPF, SIEG ou Nº Domínio... (Ctrl + K)"
            className="block w-full pl-10 pr-24 py-2 text-xs border border-transparent hover:border-slate-200 focus:border-[#C5A059] rounded-2xl bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C5A059]/20 text-stone-900 placeholder-stone-400 transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="hidden sm:inline-block text-[10px] font-mono font-medium text-stone-400 border border-slate-200 bg-white px-2 py-0.5 rounded-lg shadow-2xs">
              Ctrl + K
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-xs text-stone-500 font-medium shrink-0">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200/80 rounded-2xl px-3.5 py-2 bg-slate-50/70 hover:bg-white text-stone-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#C5A059]/20 transition-all cursor-pointer"
          >
            <option value="Todos">TODOS</option>
            <option value="ATIVO">ATIVO</option>
            <option value="TRANSFERIDO">TRANSFERIDO</option>
            <option value="BAIXADA">BAIXADA</option>
            <option value="INATIVA">INATIVA</option>
          </select>
        </div>
      </div>

      {/* Tabela de Clientes Estilo Card Flutuante */}
      <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-16 z-20">
              {/* Linha Única do Cabeçalho: Títulos das Colunas com Setas de Ordenação */}
              <tr className="bg-slate-50 border-b border-slate-200/60 text-[10px] font-bold text-stone-500 uppercase tracking-wider select-none shadow-xs">
                <th className="py-2.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('numero_pasta')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por Domínio"
                  >
                    <span>Domínio</span>
                    {sortField === 'numero_pasta' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleSort('razao_social')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por Razão Social"
                  >
                    <span>Razão Social / Regime</span>
                    {sortField === 'razao_social' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-2.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('cnpj')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por CNPJ"
                  >
                    <span>CNPJ</span>
                    {sortField === 'cnpj' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-2.5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('cpf')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por CPF"
                  >
                    <span>CPF</span>
                    {sortField === 'cpf' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('localidade')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por Localidade"
                  >
                    <span>Localidade</span>
                    {sortField === 'localidade' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-2.5">Portais</th>

                <th className="py-2.5 px-2 text-center whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('fator_r')}
                    className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                    title="Classificar por Fator R"
                  >
                    <span>Fator R</span>
                    {sortField === 'fator_r' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                    )}
                  </button>
                </th>

                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center space-x-2 justify-end">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        title="Limpar busca e filtros"
                        className="px-2 py-0.5 rounded bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 text-[10px] font-normal transition-colors cursor-pointer inline-flex items-center space-x-1"
                      >
                        <X className="w-3 h-3" />
                        <span>Limpar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center space-x-1 font-bold text-stone-600 hover:text-[#C5A059] transition-colors cursor-pointer group"
                      title="Classificar por Status"
                    >
                      <span>Status</span>
                      {sortField === 'status' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#C5A059]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#C5A059]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-stone-300 group-hover:text-stone-400" />
                      )}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[11px] text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-5 h-5 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[11px]">Carregando dados dos clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
                    <Building className="w-7 h-7 text-gray-300 mx-auto mb-2" />
                    <span className="text-xs">Nenhum cliente localizado para esta busca.</span>
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-amber-50/30 transition-colors">
                    {/* Domínio */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-xs font-bold text-stone-800">
                        {c.numero_pasta || '-'}
                      </span>
                    </td>

                    {/* Razão Social com link para abertura do formulário de edição */}
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            title="Clique para abrir formulário de edição deste cliente"
                            className="font-semibold text-stone-900 text-xs leading-tight text-left hover:text-[#C5A059] transition-colors cursor-pointer group inline-flex items-center space-x-1"
                          >
                            <span className="group-hover:underline underline-offset-2">{c.razao_social}</span>
                          </button>

                          {c.parcelamento_ativo && (
                            <span
                              title="Cliente possui parcelamento ativo"
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs"
                            >
                              <Receipt className="w-2.5 h-2.5 text-[#C5A059]" />
                              <span>Parcelamento</span>
                            </span>
                          )}
                        </div>

                        {/* Regime Tributário / Tipo de Serviço discreto abaixo do nome */}
                        {c.tipo_servico || c.regime_tributario ? (
                          <div className="flex items-center flex-wrap gap-1 text-[10px] text-stone-500 font-medium">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/70"></span>
                            <span className="tracking-tight text-stone-700 bg-amber-50/60 px-1.5 py-0.2 rounded border border-amber-200/60 font-semibold">
                              {c.tipo_servico || c.regime_tributario}
                            </span>
                            {c.puro_ou_hibrido && (
                              <span className="text-[9px] text-stone-500 bg-stone-50 px-1 rounded border border-stone-200">
                                {c.puro_ou_hibrido}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400 italic">Regime não def.</span>
                        )}
                      </div>
                    </td>

                    {/* CNPJ com recurso de copiar */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <CnpjCopyButton cnpj={c.cnpj} />
                    </td>

                    {/* CPF sem máscara com recurso de copiar */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <CpfCopyButton cpf={c.cpf} />
                    </td>

                    {/* Localidade (com fonte e espaçamento reduzidos) */}
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      {c.localidade ? (
                        <div className="inline-flex items-center space-x-1 text-[10px] font-medium text-stone-700 bg-stone-50 px-1.5 py-0.5 rounded-md border border-stone-200/80 shadow-2xs">
                          <MapPin className="w-2.5 h-2.5 text-[#C5A059] shrink-0" />
                          <span className="uppercase tracking-tight">{c.localidade}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Portais (Dropdown com setinha para copiar logins e senhas) */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <PortalsDropdown
                        loginPrefeitura={c.login_prefeitura}
                        senhaPrefeitura={c.senha_prefeitura}
                        loginPostoFiscal={c.login_posto_fiscal}
                        senhaPostoFiscal={c.senha_posto_fiscal}
                        extraCredentials={c.client_credentials}
                      />
                    </td>

                    {/* Coluna Fator R */}
                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      {c.fator_r === 'Sim' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 shadow-2xs">
                          <Percent className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Sim</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-50 text-stone-400 font-medium text-[10px] border border-slate-200">
                          Não
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end space-y-1">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-tight shadow-2xs ${
                            (c.status || '').toUpperCase() === 'ATIVO'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                              : (c.status || '').toUpperCase() === 'TRANSFERIDO'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/80'
                              : (c.status || '').toUpperCase() === 'BAIXADA'
                              ? 'bg-orange-50 text-orange-700 border border-orange-200/80'
                              : (c.status || '').toUpperCase().startsWith('INATIV')
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                              : 'bg-slate-100 text-stone-600 border border-slate-200'
                          }`}
                        >
                          {(c.status || '').toUpperCase().startsWith('INATIV') ? 'Inativa' : c.status}
                        </span>

                        {isAdmin && overdueClientsMap.has(c.id) && (
                          <span
                            title="Total vencido em aberto (Inadimplente)"
                            className="inline-flex items-center text-[10px] font-bold text-rose-600 bg-rose-50/80 px-2 py-0.5 rounded-full border border-rose-200 shadow-2xs"
                          >
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                              overdueClientsMap.get(c.id)?.totalOverdue || 0
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela */}
        <div className="p-3.5 px-6 bg-slate-50/70 border-t border-slate-200/60 flex items-center justify-between text-xs text-stone-500 rounded-b-3xl">
          <div>
            Total exibido: <span className="font-semibold text-stone-800">{filteredClients.length}</span>{' '}
            {filteredClients.length === 1 ? 'cliente' : 'clientes'}
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] text-stone-400 font-medium">
            <Shield className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Dados protegidos por RLS</span>
          </div>
        </div>
      </div>

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <ClientModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchClients}
          clientToEdit={selectedClient}
        />
      )}

      {/* Modal de Seleção de Campos para Exportação Excel */}
      {isExportModalOpen && (
        <ExportClientsModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          clients={filteredClients}
          filterContext={statusFilter !== 'Todos' ? statusFilter : undefined}
        />
      )}
    </div>
  );
};
