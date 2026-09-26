import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Calendar,
  Landmark,
  Building,
  Info,
  CheckSquare,
  Square,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { FinancialEntryModal } from '../components/FinancialEntryModal';
import { FinancialExpenseModal } from '../components/FinancialExpenseModal';
import { SettleEntryModal } from '../components/SettleEntryModal';
import { SettleExpenseModal } from '../components/SettleExpenseModal';
import { BatchSettleModal } from '../components/BatchSettleModal';
import { EXPENSE_PAYMENT_METHODS } from '../constants/expenseCategories';
import type { FinancialEntry, FinancialExpense, FinancialEntryStatus } from '../types';

export const Financial: React.FC = () => {
  const { toast } = useToast();

  // Estados principais
  const [activeTab, setActiveTab] = useState<'entradas' | 'saidas'>('entradas');
  const [loading, setLoading] = useState(true);

  // Dados
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);

  // Filtros Globais
  const [selectedCompetencia, setSelectedCompetencia] = useState<string>('Todas');
  const [bancoFilter, setBancoFilter] = useState<string>('Todos');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [clientFilter, setClientFilter] = useState<string>('Todos');

  // Filtro Rápido de Visão de Cobrança (Pills de status para Entradas)
  const [entryViewFilter, setEntryViewFilter] = useState<
    'TODOS' | FinancialEntryStatus
  >('TODOS');

  // Seleção Múltipla para Baixa em Lote
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [isBatchSettleModalOpen, setIsBatchSettleModalOpen] = useState(false);

  // Modais de Criação/Edição
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<FinancialExpense | null>(null);

  // Modal de Liquidação Rápida Individual (Entradas e Saídas)
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [entryToSettle, setEntryToSettle] = useState<FinancialEntry | null>(null);

  const [settleExpenseModalOpen, setSettleExpenseModalOpen] = useState(false);
  const [expenseToSettle, setExpenseToSettle] = useState<FinancialExpense | null>(null);

  // Carregar dados de Entradas e Saídas
  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      // 1. Busca Entradas vinculando dados do cliente
      const { data: entriesData, error: entriesError } = await supabase
        .from('financial_entries')
        .select(`
          *,
          client:client_id (
            id,
            razao_social
          )
        `)
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;
      setEntries(entriesData as FinancialEntry[]);

      // 2. Busca Saídas
      const { data: expensesData, error: expensesError } = await supabase
        .from('financial_expenses')
        .select('*')
        .order('data_pagamento_previsao', { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData as FinancialExpense[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar dados financeiros';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, []);

  // Formatação em Real Brasileiro
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  // Formatação de Data DD/MM/AAAA
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Contagem de pendentes para badge
  const pendingCount = useMemo(() => {
    return entries.filter((e) => e.status === 'À RECEBER').length;
  }, [entries]);

  const expensePendingCount = useMemo(() => {
    return expenses.filter((e) => e.status === 'A pagar').length;
  }, [expenses]);

  // Lista de clientes únicos para filtro
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const name = e.client?.razao_social || e.cliente_nome_avulso;
      if (name) map.set(name, name);
    });
    return Array.from(map.values()).sort();
  }, [entries]);

  // Filtragem de Entradas considerando Visão de Cobrança, Competência, Banco, Cliente e Status
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const clientName = e.client?.razao_social || e.cliente_nome_avulso || '';
      const matchClient = clientFilter === 'Todos' || clientName === clientFilter;
      const matchComp = selectedCompetencia === 'Todas' || e.competencia === selectedCompetencia;
      const matchBanco = bancoFilter === 'Todos' || (e.banco || '') === bancoFilter;

      // Filtro por Pill rápida de status (ou select)
      let matchStatus = true;
      if (entryViewFilter !== 'TODOS') {
        matchStatus = e.status === entryViewFilter;
      } else if (statusFilter !== 'Todos') {
        matchStatus = e.status === statusFilter;
      }

      return matchClient && matchComp && matchBanco && matchStatus;
    });
  }, [entries, entryViewFilter, selectedCompetencia, bancoFilter, clientFilter, statusFilter]);

  // Filtragem de Saídas por Competência, Banco e Status
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchComp = selectedCompetencia === 'Todas' || e.competencia === selectedCompetencia;
      const matchBanco = bancoFilter === 'Todos' || e.banco === bancoFilter;
      const matchStatus =
        statusFilter === 'Todos' ||
        e.status === statusFilter ||
        (statusFilter.startsWith('A pagar') && e.status === 'A pagar');
      return matchComp && matchBanco && matchStatus;
    });
  }, [expenses, selectedCompetencia, bancoFilter, statusFilter]);

  // Totais Calculados para a visualização atual
  const totals = useMemo(() => {
    const totalRecebido = filteredEntries
      .filter((e) => e.status === 'RECEBIDO')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalAReceber = filteredEntries
      .filter((e) => e.status === 'À RECEBER')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalSaidas = filteredExpenses
      .filter((e) => e.status !== 'Cancelado')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalPago = filteredExpenses
      .filter((e) => e.status === 'Pago' || e.status === 'Descontado')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalAPagar = filteredExpenses
      .filter((e) => e.status === 'A pagar')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const saldoLiquido = totalRecebido - totalPago;

    return { totalRecebido, totalAReceber, totalSaidas, totalPago, totalAPagar, saldoLiquido };
  }, [filteredEntries, filteredExpenses]);

  // Lista de competências disponíveis para escolha
  const availableCompetencias = useMemo(() => {
    const comps = new Set<string>();
    entries.forEach((e) => e.competencia && comps.add(e.competencia));
    expenses.forEach((e) => e.competencia && comps.add(e.competencia));
    return Array.from(comps).sort().reverse();
  }, [entries, expenses]);

  // Transição rápida de Status direto na tabela in-line
  const handleQuickStatusChange = async (entry: FinancialEntry, newStatus: FinancialEntryStatus) => {
    if (entry.status === newStatus) return;

    if (newStatus === 'RECEBIDO') {
      // Abre o modal de liquidação para coletar Data e Banco
      setEntryToSettle(entry);
      setSettleModalOpen(true);
      return;
    }

    if (newStatus === 'À RECEBER' || newStatus === 'PERMUTA') {
      try {
        const { error } = await supabase
          .from('financial_entries')
          .update({
            status: newStatus,
            ...(newStatus === 'À RECEBER' ? { data_recebimento: null, banco: null } : {}),
          })
          .eq('id', entry.id);

        if (error) throw error;
        toast(`Status atualizado para "${newStatus}" com sucesso!`, 'success');
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  status: newStatus,
                  ...(newStatus === 'À RECEBER' ? { data_recebimento: null, banco: null } : {}),
                }
              : item
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao atualizar status';
        toast(msg, 'error');
      }
    }
  };

  // Transição rápida de Status de Saídas in-line
  const handleQuickExpenseStatusChange = async (expense: FinancialExpense, newStatus: string) => {
    if (expense.status === newStatus) return;

    if (newStatus === 'Pago') {
      setExpenseToSettle(expense);
      setSettleExpenseModalOpen(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('financial_expenses')
        .update({ status: newStatus })
        .eq('id', expense.id);

      if (error) throw error;
      toast(`Status da saída atualizado para "${newStatus}"!`, 'success');
      setExpenses((prev) =>
        prev.map((item) => (item.id === expense.id ? { ...item, status: newStatus } : item))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar status da saída';
      toast(msg, 'error');
    }
  };

  // Gerenciamento de Seleção Múltipla para Baixa em Lote
  const handleToggleSelectEntry = (id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Seleciona ou desseleciona todos os pendentes visíveis
  const pendingVisibleEntries = useMemo(() => {
    return filteredEntries.filter((e) => e.status === 'À RECEBER');
  }, [filteredEntries]);

  const handleSelectAllPendingVisible = () => {
    const pendingIds = pendingVisibleEntries.map((e) => e.id);
    const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedEntryIds.includes(id));
    if (allSelected) {
      setSelectedEntryIds((prev) => prev.filter((id) => !pendingIds.includes(id)));
    } else {
      setSelectedEntryIds((prev) => Array.from(new Set([...prev, ...pendingIds])));
    }
  };

  const selectedTotalValor = useMemo(() => {
    return entries
      .filter((e) => selectedEntryIds.includes(e.id))
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
  }, [entries, selectedEntryIds]);

  // Ações de Deleção
  const handleDeleteEntry = async (id: string, clienteNome: string) => {
    if (!window.confirm(`Deseja realmente excluir este lançamento de "${clienteNome}"?`)) {
      return;
    }
    try {
      const { error } = await supabase.from('financial_entries').delete().eq('id', id);
      if (error) throw error;
      toast('Lançamento excluído com sucesso.', 'success');
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSelectedEntryIds((prev) => prev.filter((item) => item !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir entrada';
      toast(msg, 'error');
    }
  };

  const handleDeleteExpense = async (id: string, desc: string) => {
    if (!window.confirm(`Deseja realmente excluir a saída "${desc}"?`)) {
      return;
    }
    try {
      const { error } = await supabase.from('financial_expenses').delete().eq('id', id);
      if (error) throw error;
      toast('Saída excluída com sucesso.', 'success');
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir saída';
      toast(msg, 'error');
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-[#1E2022] tracking-tight">
              Módulo Financeiro
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              Admin Exclusivo
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gestão de Recebimentos, Projeções Recorrentes em Lote e Baixa de Recebíveis
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchFinancialData}
            title="Atualizar dados"
            className="p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C5A059]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'entradas') {
                setSelectedEntry(null);
                setIsEntryModalOpen(true);
              } else {
                setSelectedExpense(null);
                setIsExpenseModalOpen(true);
              }
            }}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-[#C5A059] hover:bg-[#9E7B35] text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>
              {activeTab === 'entradas' ? 'Novo Recebimento' : 'Nova Saída'}
            </span>
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Recebido (Liquidado) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Total Recebido
            </span>
            <div className="text-xl font-extrabold text-emerald-600 mt-0.5">
              {formatCurrency(totals.totalRecebido)}
            </div>
            <div className="text-[10px] text-gray-400">
              Valores liquidados
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* Total À Receber (Pendente) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider flex items-center space-x-1">
              <span>À Receber (Pendente)</span>
            </span>
            <div className="text-xl font-extrabold text-rose-600 mt-0.5">
              {formatCurrency(totals.totalAReceber)}
            </div>
            <div className="text-[10px] text-gray-400">
              {pendingCount} recebível(is) em aberto
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Total de Saídas */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Total de Saídas
            </span>
            <div className="text-xl font-extrabold text-gray-800 mt-0.5">
              {formatCurrency(totals.totalSaidas)}
            </div>
            <div className="text-[10px] text-gray-400">
              {filteredExpenses.length} pagamento(s)
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center border border-gray-200">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>

        {/* Saldo Líquido */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Saldo Líquido Realizado
            </span>
            <div
              className={`text-xl font-extrabold mt-0.5 ${
                totals.saldoLiquido >= 0 ? 'text-[#1E2022]' : 'text-rose-600'
              }`}
            >
              {formatCurrency(totals.saldoLiquido)}
            </div>
            <div className="text-[10px] text-[#C5A059] font-medium">
              Recebido menos Saídas
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200">
            <Scale className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Controles */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col gap-3">
        {/* Linha 1: Abas Principais e Filtros de Competência / Banco / Cliente */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          {/* Abas */}
          <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('entradas')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'entradas'
                  ? 'bg-white text-[#1E2022] shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Entradas (Recebimentos)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saidas')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'saidas'
                  ? 'bg-white text-[#1E2022] shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Saídas (Pagamentos)
            </button>
          </div>

          {/* Seletores de Filtro */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por Cliente */}
            {activeTab === 'entradas' && (
              <div className="flex items-center space-x-1.5">
                <Building className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">Cliente:</span>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 max-w-[170px] truncate focus:ring-1 focus:ring-[#C5A059]"
                >
                  <option value="Todos">Todos os clientes</option>
                  {uniqueClients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Seletor de Competência */}
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Competência:</span>
              <select
                value={selectedCompetencia}
                onChange={(e) => setSelectedCompetencia(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-mono font-medium focus:ring-1 focus:ring-[#C5A059]"
              >
                <option value="Todas">Todas as competências</option>
                {availableCompetencias.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Banco / Forma de Pagamento */}
            <div className="flex items-center space-x-1.5">
              <Landmark className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">
                {activeTab === 'saidas' ? 'Forma / Banco:' : 'Banco:'}
              </span>
              <select
                value={bancoFilter}
                onChange={(e) => setBancoFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 focus:ring-1 focus:ring-[#C5A059]"
              >
                <option value="Todos">Todos</option>
                {activeTab === 'saidas' ? (
                  EXPENSE_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Itaú">Itaú</option>
                    <option value="Cora">Cora</option>
                  </>
                )}
              </select>
            </div>

            {/* Filtro Status (para Saídas) */}
            {activeTab === 'saidas' && (
              <div className="flex items-center space-x-1.5">
                <span className="text-xs text-gray-500 font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 focus:ring-1 focus:ring-[#C5A059]"
                >
                  <option value="Todos">Todos</option>
                  <option value="A pagar">A pagar ({expensePendingCount})</option>
                  <option value="Pago">Pago</option>
                  <option value="Descontado">Descontado</option>
                  <option value="Permuta">Permuta</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Linha 2: Visão de Cobrança e Ações em Lote para Entradas */}
        {activeTab === 'entradas' && (
          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            {/* Pills de Filtragem Rápida */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
                Visualização:
              </span>
              <button
                type="button"
                onClick={() => setEntryViewFilter('TODOS')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'TODOS'
                    ? 'bg-[#1E2022] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('À RECEBER')}
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'À RECEBER'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <span>À RECEBER</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  entryViewFilter === 'À RECEBER' ? 'bg-white text-rose-700' : 'bg-rose-200 text-rose-800'
                }`}>
                  {pendingCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('RECEBIDO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'RECEBIDO'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                RECEBIDO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PERMUTA')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PERMUTA'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                PERMUTA
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('INDICAÇÃO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'INDICAÇÃO'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                INDICAÇÃO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PREJUÍZO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PREJUÍZO'
                    ? 'bg-red-800 text-white'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                PREJUÍZO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('ISENTO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'ISENTO'
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                ISENTO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PARCELADO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PARCELADO'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                PARCELADO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PROTESTADO')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PROTESTADO'
                    ? 'bg-zinc-800 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-300'
                }`}
              >
                PROTESTADO
              </button>
            </div>

            {/* Barra de Ação de Baixa em Lote */}
            {selectedEntryIds.length > 0 && (
              <div className="flex items-center space-x-2 animate-in fade-in">
                <span className="text-xs text-gray-600">
                  <strong className="text-gray-900">{selectedEntryIds.length}</strong> selecionado(s) •{' '}
                  <strong className="text-emerald-700 font-mono">{formatCurrency(selectedTotalValor)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsBatchSettleModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dar Baixa nos Selecionados</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntryIds([])}
                  className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1"
                >
                  Limpar seleção
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conteúdo da Tabela */}
      {activeTab === 'entradas' ? (
        /* ABA 1: ENTRADAS */
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3 w-8 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAllPendingVisible}
                      title="Selecionar todos os pendentes visíveis"
                      className="p-1 hover:text-gray-900 text-gray-400 transition-colors"
                    >
                      {pendingVisibleEntries.length > 0 &&
                      pendingVisibleEntries.every((e) => selectedEntryIds.includes(e.id)) ? (
                        <CheckSquare className="w-4 h-4 text-[#C5A059]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Conta Contábil</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4 text-center">Status / Ação Rápida</th>
                  <th className="py-3 px-4">Data Recebimento</th>
                  <th className="py-3 px-4">Banco</th>
                  <th className="py-3 px-4">Obs.</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs">Carregando recebimentos...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-400">
                      <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <span>Nenhum lançamento localizado para os filtros selecionados.</span>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => {
                    const clientName = e.client?.razao_social || e.cliente_nome_avulso || 'Não informado';
                    const isSelected = selectedEntryIds.includes(e.id);
                    const isPending = e.status === 'À RECEBER';

                    return (
                      <tr
                        key={e.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-amber-50/70' : 'hover:bg-amber-50/30'
                        }`}
                      >
                        {/* Checkbox de Seleção */}
                        <td className="py-3.5 px-3 text-center">
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => handleToggleSelectEntry(e.id)}
                              className="text-gray-400 hover:text-[#C5A059] transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#C5A059]" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-200">•</span>
                          )}
                        </td>

                        {/* Competência */}
                        <td className="py-3.5 px-4 font-mono font-semibold text-gray-900 whitespace-nowrap">
                          {e.competencia}
                        </td>

                        {/* Cliente */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-900">{clientName}</div>
                          {e.cliente_nome_avulso && !e.client_id && (
                            <span className="text-[10px] text-gray-400 italic">Avulso</span>
                          )}
                        </td>

                        {/* Conta Contábil */}
                        <td className="py-3.5 px-4 text-gray-700 font-medium">
                          {e.conta_contabil}
                        </td>

                        {/* Valor */}
                        <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                          <span
                            className={
                              e.status === 'RECEBIDO'
                                ? 'text-emerald-600'
                                : e.status === 'À RECEBER'
                                ? 'text-rose-600'
                                : 'text-gray-600'
                            }
                          >
                            {formatCurrency(e.valor)}
                          </span>
                        </td>

                        {/* Status com Seletor Rápido In-line e Botão Baixa Rápida em 1 Clique */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center space-x-1.5">
                            <select
                              value={e.status}
                              onChange={(ev) =>
                                handleQuickStatusChange(e, ev.target.value as FinancialEntryStatus)
                              }
                              className={`text-[10px] font-bold py-1 px-2 rounded-full border cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#C5A059] ${
                                e.status === 'RECEBIDO'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : e.status === 'À RECEBER'
                                  ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                  : e.status === 'PERMUTA'
                                  ? 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                  : e.status === 'INDICAÇÃO'
                                  ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                  : e.status === 'PREJUÍZO'
                                  ? 'bg-red-50 text-red-800 border-red-300 hover:bg-red-100'
                                  : e.status === 'ISENTO'
                                  ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                                  : e.status === 'PARCELADO'
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                  : 'bg-zinc-100 text-zinc-800 border-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              <option value="À RECEBER">À RECEBER</option>
                              <option value="RECEBIDO">RECEBIDO</option>
                              <option value="PERMUTA">PERMUTA</option>
                              <option value="INDICAÇÃO">INDICAÇÃO</option>
                              <option value="PREJUÍZO">PREJUÍZO</option>
                              <option value="ISENTO">ISENTO</option>
                              <option value="PARCELADO">PARCELADO</option>
                              <option value="PROTESTADO">PROTESTADO</option>
                            </select>

                            {/* Botão de Atalho "Dar Baixa" em 1 clique quando À RECEBER */}
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEntryToSettle(e);
                                  setSettleModalOpen(true);
                                }}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all"
                                title="Dar baixa rápida e liquidar este recebimento"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Baixa</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Data Recebimento */}
                        <td className="py-3.5 px-4 font-mono whitespace-nowrap text-gray-600">
                          {e.data_recebimento ? (
                            formatDate(e.data_recebimento)
                          ) : (
                            <span className="text-gray-300 italic text-[11px]">-</span>
                          )}
                        </td>

                        {/* Banco */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-gray-800">
                          {e.banco || <span className="text-gray-300 italic text-[11px]">-</span>}
                        </td>

                        {/* Observação com Tooltip */}
                        <td className="py-3.5 px-4 max-w-[140px] truncate" title={e.observacao || ''}>
                          {e.observacao ? (
                            <span className="text-gray-500 cursor-help flex items-center space-x-1">
                              <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{e.observacao}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEntry(e);
                                setIsEntryModalOpen(true);
                              }}
                              className="p-1.5 text-gray-500 hover:text-[#C5A059] rounded-md hover:bg-amber-50 transition-colors"
                              title="Editar entrada"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(e.id, clientName)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                              title="Excluir entrada"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-gray-50/70 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
            <div>
              Total de registros exibidos: <span className="font-semibold text-gray-800">{filteredEntries.length}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-emerald-700 font-semibold">
                Recebido: {formatCurrency(totals.totalRecebido)}
              </span>
              <span className="text-rose-700 font-semibold">
                À Receber: {formatCurrency(totals.totalAReceber)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* ABA 2: SAÍDAS */
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Data Pagamento / Previsão</th>
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Descrição do Pagamento</th>
                  <th className="py-3 px-4">OBS.</th>
                  <th className="py-3 px-4">Conta Contábil</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4 text-center">Status / Ação Rápida</th>
                  <th className="py-3 px-4">Banco</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-6 h-6 border-2 border-[#C5A059] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs">Carregando despesas e pagamentos...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      <ArrowDownRight className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <span>Nenhuma saída localizada para os filtros selecionados.</span>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-amber-50/30 transition-colors">
                      {/* Data Pagamento / Previsão */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {formatDate(exp.data_pagamento_previsao)}
                      </td>

                      {/* Competência */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-gray-900 whitespace-nowrap">
                        {exp.competencia}
                      </td>

                      {/* Descrição do Pagamento */}
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        {exp.descricao_pagamento}
                      </td>

                      {/* OBS */}
                      <td className="py-3.5 px-4 max-w-[140px] truncate" title={exp.observacao || ''}>
                        {exp.observacao ? (
                          <span className="text-gray-500 cursor-help flex items-center space-x-1">
                            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{exp.observacao}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      {/* Conta Contábil */}
                      <td className="py-3.5 px-4 text-gray-600">
                        {exp.conta_contabil}
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 font-mono font-bold text-rose-600 whitespace-nowrap">
                        {formatCurrency(exp.valor)}
                      </td>

                      {/* Status / Ação Rápida */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1.5">
                          <select
                            value={exp.status}
                            onChange={(e) => handleQuickExpenseStatusChange(exp, e.target.value)}
                            className={`text-[10px] font-bold py-1 px-2 rounded-full border cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#C5A059] ${
                              exp.status === 'Pago' || exp.status === 'Descontado'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-bold'
                                : exp.status === 'A pagar'
                                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 font-bold'
                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            <option value="A pagar">A pagar</option>
                            <option value="Pago">Pago</option>
                            <option value="Descontado">Descontado</option>
                            <option value="Permuta">Permuta</option>
                          </select>

                          {/* Botão de Atalho "Dar Baixa" em 1 clique quando "A pagar" */}
                          {exp.status === 'A pagar' && (
                            <button
                              type="button"
                              onClick={() => {
                                setExpenseToSettle(exp);
                                setSettleExpenseModalOpen(true);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
                              title="Dar baixa rápida e marcar como Pago"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Baixa</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Banco */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-gray-800">
                        {exp.banco}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExpense(exp);
                              setIsExpenseModalOpen(true);
                            }}
                            className="p-1.5 text-gray-500 hover:text-[#C5A059] rounded-md hover:bg-amber-50 transition-colors"
                            title="Editar saída"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id, exp.descricao_pagamento)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                            title="Excluir saída"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-gray-50/70 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
            <div>
              Total de registros: <span className="font-semibold text-gray-800">{filteredExpenses.length}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-emerald-700 font-semibold">
                Pago / Descontado: {formatCurrency(totals.totalPago)}
              </span>
              <span className="text-rose-700 font-semibold">
                A pagar: {formatCurrency(totals.totalAPagar)}
              </span>
              <span className="text-gray-700 font-bold border-l pl-3 border-gray-300">
                Total Saídas: {formatCurrency(totals.totalSaidas)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Inclusão / Edição de Entrada */}
      {isEntryModalOpen && (
        <FinancialEntryModal
          isOpen={isEntryModalOpen}
          onClose={() => setIsEntryModalOpen(false)}
          onSuccess={fetchFinancialData}
          entryToEdit={selectedEntry}
          defaultCompetencia={selectedCompetencia === 'Todas' ? 'out/26' : selectedCompetencia}
        />
      )}

      {/* Modal de Inclusão / Edição de Saída */}
      {isExpenseModalOpen && (
        <FinancialExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => setIsExpenseModalOpen(false)}
          onSuccess={fetchFinancialData}
          expenseToEdit={selectedExpense}
          defaultCompetencia={selectedCompetencia === 'Todas' ? 'out/26' : selectedCompetencia}
        />
      )}

      {/* Modal Rápido de Liquidação Individual (Entradas) */}
      {settleModalOpen && (
        <SettleEntryModal
          isOpen={settleModalOpen}
          onClose={() => {
            setSettleModalOpen(false);
            setEntryToSettle(null);
          }}
          onSuccess={fetchFinancialData}
          entry={entryToSettle}
        />
      )}

      {/* Modal Rápido de Liquidação Individual (Saídas) */}
      {settleExpenseModalOpen && (
        <SettleExpenseModal
          isOpen={settleExpenseModalOpen}
          onClose={() => {
            setSettleExpenseModalOpen(false);
            setExpenseToSettle(null);
          }}
          onSuccess={fetchFinancialData}
          expense={expenseToSettle}
        />
      )}

      {/* Modal de Baixa Rápida em Lote (Múltiplas Seleções) */}
      {isBatchSettleModalOpen && (
        <BatchSettleModal
          isOpen={isBatchSettleModalOpen}
          onClose={() => setIsBatchSettleModalOpen(false)}
          onSuccess={() => {
            setSelectedEntryIds([]);
            fetchFinancialData();
          }}
          selectedIds={selectedEntryIds}
          totalValor={selectedTotalValor}
        />
      )}
    </div>
  );
};
