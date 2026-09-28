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
  Clock,
  TrendingUp,
  PieChart,
  Users,
  AlertTriangle,
  CalendarDays,
  ArrowDownLeft,
  FileSpreadsheet
} from 'lucide-react';
import { parseCompetencia, formatCompetencia, isEntryOverdue } from '../utils/competencia';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { FinancialEntryModal } from '../components/FinancialEntryModal';
import { FinancialExpenseModal } from '../components/FinancialExpenseModal';
import { SettleEntryModal } from '../components/SettleEntryModal';
import { SettleExpenseModal } from '../components/SettleExpenseModal';
import { BatchSettleModal } from '../components/BatchSettleModal';
import { EXPENSE_PAYMENT_METHODS } from '../constants/expenseCategories';
import { exportFinancialEntriesToExcel, exportFinancialExpensesToExcel } from '../utils/excelExport';
import type { FinancialEntry, FinancialExpense, FinancialEntryStatus } from '../types';

export const Financial: React.FC = () => {
  const { toast } = useToast();

  // Estados principais
  const [activeTab, setActiveTab] = useState<'entradas' | 'saidas'>('entradas');
  const [loading, setLoading] = useState(true);

  // Dados
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);

  // Inicialização da Competência padrão no Mês Corrente (ex: "set/26")
  const currentMonthCompetencia = useMemo(() => {
    const now = new Date();
    return formatCompetencia(now.getMonth(), now.getFullYear(), true);
  }, []);

  // Filtros Globais: Por padrão já entra filtrado no Mês Corrente
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [selectedCompetencia, setSelectedCompetencia] = useState<string>(() => {
    const now = new Date();
    return formatCompetencia(now.getMonth(), now.getFullYear(), true);
  });
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

  // Carregar dados de Entradas e Saídas (em páginas para superar o limite padrão de 1.000 registros do PostgREST)
  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      // 1. Busca Entradas vinculando dados do cliente em blocos
      const PAGE_SIZE = 1000;
      let allEntries: FinancialEntry[] = [];
      let fromEntry = 0;
      let hasMoreEntries = true;

      while (hasMoreEntries) {
        const { data: pageData, error: pageError } = await supabase
          .from('financial_entries')
          .select(`
            *,
            client:client_id (
              id,
              razao_social
            )
          `)
          .order('competencia', { ascending: false })
          .range(fromEntry, fromEntry + PAGE_SIZE - 1);

        if (pageError) throw pageError;
        if (pageData && pageData.length > 0) {
          allEntries = allEntries.concat(pageData as FinancialEntry[]);
        }
        if (!pageData || pageData.length < PAGE_SIZE) {
          hasMoreEntries = false;
        } else {
          fromEntry += PAGE_SIZE;
        }
      }
      setEntries(allEntries);

      // 2. Busca Saídas em blocos
      let allExpenses: FinancialExpense[] = [];
      let fromExpense = 0;
      let hasMoreExpenses = true;

      while (hasMoreExpenses) {
        const { data: pageExpenses, error: pageExpError } = await supabase
          .from('financial_expenses')
          .select('*')
          .order('data_pagamento_previsao', { ascending: false })
          .range(fromExpense, fromExpense + PAGE_SIZE - 1);

        if (pageExpError) throw pageExpError;
        if (pageExpenses && pageExpenses.length > 0) {
          allExpenses = allExpenses.concat(pageExpenses as FinancialExpense[]);
        }
        if (!pageExpenses || pageExpenses.length < PAGE_SIZE) {
          hasMoreExpenses = false;
        } else {
          fromExpense += PAGE_SIZE;
        }
      }
      setExpenses(allExpenses);
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

  // Contagem de pendentes para badge e filtro
  const pendingCount = useMemo(() => {
    return entries.filter((e) => {
      const s = (e.status || '').trim().toUpperCase();
      return s === 'À RECEBER' || s === 'A RECEBER';
    }).length;
  }, [entries]);

  const expensePendingCount = useMemo(() => {
    return expenses.filter((e) => {
      let matchYear = true;
      if (selectedYear !== 'Todos') {
        const { year } = parseCompetencia(e.competencia || '');
        matchYear = String(year) === selectedYear;
      }
      const matchComp = selectedCompetencia === 'Todas' || e.competencia === selectedCompetencia;
      const matchBanco = bancoFilter === 'Todos' || e.banco === bancoFilter;
      const normStatus = (e.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isPending = normStatus === 'A PAGAR';
      return matchYear && matchComp && matchBanco && isPending;
    }).length;
  }, [expenses, selectedYear, selectedCompetencia, bancoFilter]);

  // Lista de clientes únicos para filtro
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const name = e.client?.razao_social || e.cliente_nome_avulso;
      if (name) map.set(name, name);
    });
    return Array.from(map.values()).sort();
  }, [entries]);

  // Filtragem e Ordenação Crescente de Entradas por Competência
  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => {
        const clientName = e.client?.razao_social || e.cliente_nome_avulso || '';
        const matchClient = clientFilter === 'Todos' || clientName === clientFilter;
        
        let matchYear = true;
        if (selectedYear !== 'Todos') {
          const { year } = parseCompetencia(e.competencia || '');
          matchYear = String(year) === selectedYear;
        }

        const matchComp = selectedCompetencia === 'Todas' || e.competencia === selectedCompetencia;
        const matchBanco = bancoFilter === 'Todos' || (e.banco || '') === bancoFilter;

        // Filtro por Pill rápida de status (ou select)
        let matchStatus = true;
        if (entryViewFilter !== 'TODOS') {
          matchStatus = e.status === entryViewFilter;
        } else if (statusFilter !== 'Todos') {
          matchStatus = e.status === statusFilter;
        }

        return matchClient && matchYear && matchComp && matchBanco && matchStatus;
      })
      .sort((a, b) => {
        // Ordenação crescente por competência (ano e mês)
        const compA = parseCompetencia(a.competencia || '');
        const compB = parseCompetencia(b.competencia || '');
        const keyA = compA.year * 100 + compA.month;
        const keyB = compB.year * 100 + compB.month;
        if (keyA !== keyB) return keyA - keyB;

        // Desempate por nome do cliente
        const nameA = a.client?.razao_social || a.cliente_nome_avulso || '';
        const nameB = b.client?.razao_social || b.cliente_nome_avulso || '';
        return nameA.localeCompare(nameB, 'pt-BR');
      });
  }, [entries, entryViewFilter, selectedYear, selectedCompetencia, bancoFilter, clientFilter, statusFilter]);

  // Filtragem e Ordenação Crescente de Saídas por Data de Pagamento / Previsão
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        let matchYear = true;
        if (selectedYear !== 'Todos') {
          const { year } = parseCompetencia(e.competencia || '');
          matchYear = String(year) === selectedYear;
        }

        const matchComp = selectedCompetencia === 'Todas' || e.competencia === selectedCompetencia;
        const matchBanco = bancoFilter === 'Todos' || e.banco === bancoFilter;

        let matchStatus = true;
        if (statusFilter !== 'Todos') {
          const normFilter = statusFilter.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const normExpStatus = (e.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

          if (normFilter.startsWith('A PAGAR')) {
            matchStatus = normExpStatus === 'A PAGAR';
          } else if (normFilter === 'PAGO') {
            matchStatus = normExpStatus === 'PAGO' || normExpStatus === 'DESCONTADO';
          } else {
            matchStatus = normExpStatus === normFilter;
          }
        }

        return matchYear && matchComp && matchBanco && matchStatus;
      })
      .sort((a, b) => {
        // Ordenação prioritária por Data de Pagamento / Previsão (crescente)
        const dateA = a.data_pagamento_previsao || '9999-99-99';
        const dateB = b.data_pagamento_previsao || '9999-99-99';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        // Desempate por competência (ano e mês)
        const compA = parseCompetencia(a.competencia || '');
        const compB = parseCompetencia(b.competencia || '');
        const keyA = compA.year * 100 + compA.month;
        const keyB = compB.year * 100 + compB.month;
        if (keyA !== keyB) return keyA - keyB;

        // Desempate final por descrição do pagamento
        return (a.descricao_pagamento || '').localeCompare(b.descricao_pagamento || '');
      });
  }, [expenses, selectedYear, selectedCompetencia, bancoFilter, statusFilter]);

  // Totais Calculados para os Cards de Resumo (Estritamente fixados na competência do Mês Corrente)
  const currentMonthTotals = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Filtra lançamentos de entrada pertencentes ao mês corrente
    const currentMonthEntries = entries.filter((e) => {
      if (!e.competencia) return false;
      const { month, year } = parseCompetencia(e.competencia);
      return month === currentMonth && year === currentYear;
    });

    // Filtra lançamentos de despesa pertencentes ao mês corrente
    const currentMonthExpenses = expenses.filter((e) => {
      if (!e.competencia) return false;
      const { month, year } = parseCompetencia(e.competencia);
      return month === currentMonth && year === currentYear;
    });

    const totalRecebido = currentMonthEntries
      .filter((e) => e.status === 'RECEBIDO')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalAReceber = currentMonthEntries
      .filter((e) => e.status === 'À RECEBER')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const aReceberCount = currentMonthEntries
      .filter((e) => e.status === 'À RECEBER').length;

    const totalPago = currentMonthExpenses
      .filter((e) => e.status === 'Pago' || e.status === 'Descontado' || e.status === 'PAGO')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const pagoCount = currentMonthExpenses
      .filter((e) => e.status === 'Pago' || e.status === 'Descontado' || e.status === 'PAGO').length;

    const totalAPagar = currentMonthExpenses
      .filter((e) => e.status === 'A pagar' || e.status === 'À PAGAR')
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const aPagarCount = currentMonthExpenses
      .filter((e) => e.status === 'A pagar' || e.status === 'À PAGAR').length;

    const saldoLiquido = totalRecebido - totalPago;

    return {
      totalRecebido,
      totalAReceber,
      aReceberCount,
      totalPago,
      pagoCount,
      totalAPagar,
      aPagarCount,
      saldoLiquido,
      monthLabel: formatCompetencia(currentMonth, currentYear, true),
    };
  }, [entries, expenses]);

  // Totais Calculados para a visualização atual (filtros ativos da tabela)
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
      .filter((e) => {
        const norm = (e.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return norm === 'PAGO' || norm === 'DESCONTADO';
      })
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const totalAPagar = filteredExpenses
      .filter((e) => {
        const norm = (e.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return norm === 'A PAGAR';
      })
      .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

    const saldoLiquido = totalRecebido - totalPago;

    return { totalRecebido, totalAReceber, totalSaidas, totalPago, totalAPagar, saldoLiquido };
  }, [filteredEntries, filteredExpenses]);

  // Cálculos do Dashboard Analítico
  const analyticsData = useMemo(() => {
    // 1. Evolução Receitas x Despesas: Últimos 6 meses a partir do mês anterior ao corrente, em ordem crescente
    // Exemplo: se hoje é set/26 (mês 8), os 6 meses anteriores são mar/26, abr/26, mai/26, jun/26, jul/26, ago/26
    const today = new Date();
    const last6MonthsSlots: { key: string; label: string; month: number; year: number }[] = [];
    
    // Gera de 6 meses atrás até 1 mês atrás (i = 6 down to 1), garantindo ordem cronológica crescente
    for (let i = 6; i >= 1; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      last6MonthsSlots.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: formatCompetencia(m, y, true), // Ex: 'mar/26', 'abr/26', etc.
        month: m,
        year: y,
      });
    }

    const evolucaoMap = new Map<
      string,
      {
        comp: string;
        receitaRecebida: number;
        receitaAReceber: number;
        despesaPaga: number;
        despesaAPagar: number;
        totalReceita: number;
        totalDespesa: number;
      }
    >();

    last6MonthsSlots.forEach((slot) => {
      evolucaoMap.set(`${slot.year}-${slot.month}`, {
        comp: slot.label,
        receitaRecebida: 0,
        receitaAReceber: 0,
        despesaPaga: 0,
        despesaAPagar: 0,
        totalReceita: 0,
        totalDespesa: 0,
      });
    });

    // Alimenta com entradas
    entries.forEach((e) => {
      if (!e.competencia) return;
      const { month, year } = parseCompetencia(e.competencia);
      const slotKey = `${year}-${month}`;
      const current = evolucaoMap.get(slotKey);
      if (current) {
        const val = Number(e.valor || 0);
        if (e.status === 'RECEBIDO') {
          current.receitaRecebida += val;
          current.totalReceita += val;
        } else if (e.status === 'À RECEBER') {
          current.receitaAReceber += val;
          current.totalReceita += val;
        }
      }
    });

    // Alimenta com saídas
    expenses.forEach((ex) => {
      if (!ex.competencia || ex.status === 'Cancelado') return;
      const { month, year } = parseCompetencia(ex.competencia);
      const slotKey = `${year}-${month}`;
      const current = evolucaoMap.get(slotKey);
      if (current) {
        const val = Number(ex.valor || 0);
        if (ex.status === 'Pago' || ex.status === 'Descontado' || ex.status === 'PAGO') {
          current.despesaPaga += val;
          current.totalDespesa += val;
        } else if (ex.status === 'A pagar' || ex.status === 'À PAGAR') {
          current.despesaAPagar += val;
          current.totalDespesa += val;
        }
      }
    });

    // Lista final estritamente na ordem cronológica crescente dos últimos 6 meses (do mês -6 até o mês -1)
    const evolucaoList = last6MonthsSlots.map((slot) => {
      const data = evolucaoMap.get(`${slot.year}-${slot.month}`);
      return (
        data || {
          comp: slot.label,
          receitaRecebida: 0,
          receitaAReceber: 0,
          despesaPaga: 0,
          despesaAPagar: 0,
          totalReceita: 0,
          totalDespesa: 0,
        }
      );
    });

    const maxEvolucao = Math.max(
      ...evolucaoList.map((item) => Math.max(item.totalReceita, item.totalDespesa)),
      1
    );

    // 2. Distribuição dos Gastos por Categoria Contábil (Fixado estritamente no Mês Corrente)
    const gastosMap = new Map<string, number>();
    expenses
      .filter((ex) => {
        if (!ex.competencia || ex.status === 'Cancelado') return false;
        const { month, year } = parseCompetencia(ex.competencia);
        return month === today.getMonth() && year === today.getFullYear();
      })
      .forEach((ex) => {
        const cat = ex.conta_contabil || 'Outras Despesas';
        gastosMap.set(cat, (gastosMap.get(cat) || 0) + Number(ex.valor || 0));
      });

    const totalGastosFiltrados = Array.from(gastosMap.values()).reduce((a, b) => a + b, 0);
    const distribuicaoGastos = Array.from(gastosMap.entries())
      .map(([categoria, valor]) => ({
        categoria,
        valor,
        percent: totalGastosFiltrados > 0 ? (valor / totalGastosFiltrados) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5); // Top 5 categorias

    // 3. Principais Clientes: Considera exclusivamente os valores RECEBIDOS de TODO o histórico (entries)
    const clientesMap = new Map<string, { nome: string; total: number; titulos: number }>();
    entries
      .filter((e) => e.status === 'RECEBIDO')
      .forEach((e) => {
        const nome = e.client?.razao_social || e.cliente_nome_avulso;
        if (!nome) return;
        const curr = clientesMap.get(nome) || { nome, total: 0, titulos: 0 };
        curr.total += Number(e.valor || 0);
        curr.titulos += 1;
        clientesMap.set(nome, curr);
      });

    const totalFaturadoClientes = Array.from(clientesMap.values()).reduce((a, b) => a + b.total, 0);
    const principaisClientes = Array.from(clientesMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const maxClienteTotal = Math.max(...principaisClientes.map((c) => c.total), 1);

    // 4. Inadimplência e Top 5 Clientes Mais Inadimplentes
    // Considera inadimplente quem possui competência anterior ao mês corrente em aberto
    const pendentes = entries.filter((e) => isEntryOverdue(e));
    const valorEmAtraso = pendentes.reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
    const totalGeralReceber = entries.reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
    
    // Taxa percentual de inadimplência sobre a carteira
    const taxaInadimplencia = totalGeralReceber > 0 
      ? ((valorEmAtraso / totalGeralReceber) * 100) 
      : 0;

    // Top 5 clientes mais inadimplentes
    const inadimplentesMap = new Map<string, { nome: string; total: number; titulos: number }>();
    pendentes.forEach((e) => {
      const nome = e.client?.razao_social || e.cliente_nome_avulso || 'Cliente Não Identificado';
      const curr = inadimplentesMap.get(nome) || { nome, total: 0, titulos: 0 };
      curr.total += Number(e.valor || 0);
      curr.titulos += 1;
      inadimplentesMap.set(nome, curr);
    });

    const topInadimplentes = Array.from(inadimplentesMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const maxInadimplenteTotal = Math.max(...topInadimplentes.map((c) => c.total), 1);

    return {
      evolucaoList,
      maxEvolucao,
      distribuicaoGastos,
      totalGastosFiltrados,
      principaisClientes,
      totalFaturadoClientes,
      maxClienteTotal,
      valorEmAtraso,
      totalTitulosAtraso: pendentes.length,
      taxaInadimplencia,
      topInadimplentes,
      maxInadimplenteTotal,
    };
  }, [entries, expenses]);

  // Agenda de Próximos Compromissos Financeiros: Apenas a PRÓXIMA data de obrigações de saída
  const agendaCommitments = useMemo(() => {
    interface AgendaItem {
      id: string;
      tipo: 'PAGAR';
      titulo: string;
      detalhe: string;
      dataObj: Date;
      dataFormatted: string;
      dateKey: string;
      valor: number;
      status: string;
      diasDiferenca: number;
    }

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Coleta todas as saídas futuras pendentes (status 'A pagar' e data >= hoje)
    const futureExpenses: AgendaItem[] = [];

    expenses
      .filter((ex) => {
        const norm = (ex.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return norm === 'A PAGAR';
      })
      .forEach((ex) => {
        let dueDate = new Date();
        if (ex.data_pagamento_previsao) {
          const [y, m, d] = ex.data_pagamento_previsao.split('-').map(Number);
          if (y && m && d) {
            dueDate = new Date(y, m - 1, d, 23, 59, 59);
          }
        }
        // Desconsidera datas passadas / antigas
        if (dueDate.getTime() < todayMidnight.getTime()) return;

        const diffDays = Math.ceil((dueDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        const dayStr = String(dueDate.getDate()).padStart(2, '0');
        const monthStr = String(dueDate.getMonth() + 1).padStart(2, '0');
        const yearStr = dueDate.getFullYear();
        const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

        futureExpenses.push({
          id: `expense-${ex.id}`,
          tipo: 'PAGAR',
          titulo: ex.descricao_pagamento,
          detalhe: `${ex.conta_contabil} • Banco: ${ex.banco}`,
          dataObj: dueDate,
          dataFormatted: `${dayStr}/${monthStr}/${yearStr}`,
          dateKey,
          valor: Number(ex.valor || 0),
          status: ex.status,
          diasDiferenca: diffDays,
        });
      });

    // Ordena as obrigações de saída da mais próxima para frente
    futureExpenses.sort((a, b) => a.dataObj.getTime() - b.dataObj.getTime());

    // Identifica a data mais próxima
    if (futureExpenses.length === 0) {
      return {
        items: [],
        totalCount: 0,
        totalPagarAgenda: 0,
        proximaData: null as string | null,
        diasDiferenca: 0,
      };
    }

    const proximaDataKey = futureExpenses[0].dateKey;
    const proximaDataFormatted = futureExpenses[0].dataFormatted;
    const diasDiferenca = futureExpenses[0].diasDiferenca;

    // Filtra todas as obrigações que vencem exatamente nessa data mais próxima
    const nearestDateExpenses = futureExpenses.filter((item) => item.dateKey === proximaDataKey);

    const totalPagarAgenda = nearestDateExpenses.reduce((acc, curr) => acc + curr.valor, 0);

    return {
      items: nearestDateExpenses,
      totalCount: nearestDateExpenses.length,
      totalPagarAgenda,
      proximaData: proximaDataFormatted,
      diasDiferenca,
    };
  }, [expenses]);

  // Lista de anos disponíveis com base em todas as competências
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    entries.forEach((e) => {
      if (e.competencia) {
        const { year } = parseCompetencia(e.competencia);
        years.add(String(year));
      }
    });
    expenses.forEach((e) => {
      if (e.competencia) {
        const { year } = parseCompetencia(e.competencia);
        years.add(String(year));
      }
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [entries, expenses]);

  // Lista de competências disponíveis para escolha (filtráveis pelo ano selecionado se houver)
  const availableCompetencias = useMemo(() => {
    const comps = new Set<string>();
    comps.add(currentMonthCompetencia);
    entries.forEach((e) => {
      if (e.competencia) {
        if (selectedYear === 'Todos') {
          comps.add(e.competencia);
        } else {
          const { year } = parseCompetencia(e.competencia);
          if (String(year) === selectedYear) comps.add(e.competencia);
        }
      }
    });
    expenses.forEach((e) => {
      if (e.competencia) {
        if (selectedYear === 'Todos') {
          comps.add(e.competencia);
        } else {
          const { year } = parseCompetencia(e.competencia);
          if (String(year) === selectedYear) comps.add(e.competencia);
        }
      }
    });

    return Array.from(comps).sort((a, b) => {
      const compA = parseCompetencia(a);
      const compB = parseCompetencia(b);
      const keyA = compA.year * 100 + compA.month;
      const keyB = compB.year * 100 + compB.month;
      return keyB - keyA; // Decrescente no dropdown para acesso rápido às mais recentes
    });
  }, [entries, expenses, currentMonthCompetencia, selectedYear]);

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
    <div className="space-y-6">
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
              setSelectedEntry(null);
              setIsEntryModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Entrada</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedExpense(null);
              setIsExpenseModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Saída</span>
          </button>
        </div>
      </div>

      {/* Cards de Resumo - Apenas Mês Corrente */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* 1. Recebido */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
              <span>Recebido</span>
              <span className="text-[9px] font-normal text-emerald-600 lowercase bg-emerald-50 px-1 rounded">({currentMonthTotals.monthLabel})</span>
            </span>
            <div className="text-lg font-extrabold text-emerald-600 mt-1">
              {formatCurrency(currentMonthTotals.totalRecebido)}
            </div>
            <div className="text-[10px] text-gray-400">
              Valores liquidados
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>

        {/* 2. À Receber */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center space-x-1">
              <span>À Receber</span>
              <span className="text-[9px] font-normal text-amber-700 lowercase bg-amber-50 px-1 rounded">({currentMonthTotals.monthLabel})</span>
            </span>
            <div className="text-lg font-extrabold text-amber-600 mt-1">
              {formatCurrency(currentMonthTotals.totalAReceber)}
            </div>
            <div className="text-[10px] text-gray-400">
              {currentMonthTotals.aReceberCount} pendência(s)
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* 3. Pago */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center space-x-1">
              <span>Pago</span>
              <span className="text-[9px] font-normal text-gray-600 lowercase bg-gray-100 px-1 rounded">({currentMonthTotals.monthLabel})</span>
            </span>
            <div className="text-lg font-extrabold text-stone-800 mt-1">
              {formatCurrency(currentMonthTotals.totalPago)}
            </div>
            <div className="text-[10px] text-gray-400">
              {currentMonthTotals.pagoCount} despesa(s) paga(s)
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center border border-stone-200 shrink-0">
            <ArrowDownRight className="w-4 h-4" />
          </div>
        </div>

        {/* 4. A Pagar */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider flex items-center space-x-1">
              <span>A Pagar</span>
              <span className="text-[9px] font-normal text-rose-700 lowercase bg-rose-50 px-1 rounded">({currentMonthTotals.monthLabel})</span>
            </span>
            <div className="text-lg font-extrabold text-rose-600 mt-1">
              {formatCurrency(currentMonthTotals.totalAPagar)}
            </div>
            <div className="text-[10px] text-gray-400">
              {currentMonthTotals.aPagarCount} conta(s) a pagar
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
        </div>

        {/* 5. Saldo Líquido */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
              <span>Saldo Líquido</span>
              <span className="text-[9px] font-normal text-[#C5A059] lowercase bg-amber-50 px-1 rounded">({currentMonthTotals.monthLabel})</span>
            </span>
            <div
              className={`text-lg font-extrabold mt-1 ${
                currentMonthTotals.saldoLiquido >= 0 ? 'text-[#1E2022]' : 'text-rose-600'
              }`}
            >
              {formatCurrency(currentMonthTotals.saldoLiquido)}
            </div>
            <div className="text-[10px] text-[#C5A059] font-medium">
              Recebido menos Pago
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#C5A059] flex items-center justify-center border border-amber-200 shrink-0">
            <Scale className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* DASHBOARD ANALÍTICO (Abaixo dos Cards) */}
      <div className="space-y-4">
        {/* Linha 1 do Dashboard: 2 Colunas (Evolução 6 meses e Distribuição de Gastos em Pizza/Rosca) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Bloco 1: Evolução Receita vs Despesa (Gráfico de Colunas Verticais dos Últimos 6 Meses) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900">Evolução Receita x Despesa</h3>
                  <p className="text-[10px] text-gray-400">Comparativo dos últimos 6 meses</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-[10px]">
                {/* Receita Recebida (Sólida) */}
                <span className="flex items-center space-x-1" title="Receita liquidada / recebida">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block shadow-2xs"></span>
                  <span className="text-gray-700 font-medium">Recebido</span>
                </span>
                {/* Receita A Receber (Vazada) */}
                <span className="flex items-center space-x-1" title="Receita pendente / a receber">
                  <span className="w-2.5 h-2.5 rounded-xs border-2 border-dashed border-emerald-500 bg-emerald-50 inline-block"></span>
                  <span className="text-gray-600 font-medium">A Receber</span>
                </span>
                {/* Despesa Paga (Sólida) */}
                <span className="flex items-center space-x-1" title="Despesa liquidada / paga">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#C5A059] inline-block shadow-2xs"></span>
                  <span className="text-gray-700 font-medium">Pago</span>
                </span>
                {/* Despesa A Pagar (Vazada) */}
                <span className="flex items-center space-x-1" title="Despesa pendente / a pagar">
                  <span className="w-2.5 h-2.5 rounded-xs border-2 border-dashed border-[#C5A059] bg-amber-50 inline-block"></span>
                  <span className="text-gray-600 font-medium">A Pagar</span>
                </span>
              </div>
            </div>

            {/* Gráfico de Colunas Verticais */}
            <div className="my-4 w-full min-w-0">
              {analyticsData.evolucaoList.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  Nenhum dado com competência registrada.
                </div>
              ) : (
                <div className="h-52 w-full flex items-end justify-between gap-1 sm:gap-2 pt-6 px-1 border-b border-gray-100 min-w-0">
                  {analyticsData.evolucaoList.map((item, idx) => {
                    const hReceitaTotal = Math.max(
                      item.totalReceita > 0 ? 6 : 0,
                      Math.round((item.totalReceita / analyticsData.maxEvolucao) * 100)
                    );
                    const pctRecebido =
                      item.totalReceita > 0 ? (item.receitaRecebida / item.totalReceita) * 100 : 0;
                    const pctAReceber =
                      item.totalReceita > 0 ? (item.receitaAReceber / item.totalReceita) * 100 : 0;

                    const hDespesaTotal = Math.max(
                      item.totalDespesa > 0 ? 6 : 0,
                      Math.round((item.totalDespesa / analyticsData.maxEvolucao) * 100)
                    );
                    const pctPago =
                      item.totalDespesa > 0 ? (item.despesaPaga / item.totalDespesa) * 100 : 0;
                    const pctAPagar =
                      item.totalDespesa > 0 ? (item.despesaAPagar / item.totalDespesa) * 100 : 0;

                    return (
                      <div key={idx} className="flex-1 min-w-0 flex flex-col items-center h-full justify-end group relative">
                        {/* Tooltip detalhado posicionado absolutamente para não empurrar colunas */}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-center whitespace-nowrap pointer-events-none bg-white p-1.5 rounded-lg border border-gray-100 shadow-lg z-20">
                          <span className="text-emerald-700 block font-bold">
                            Rec: {formatCurrency(item.totalReceita)}
                          </span>
                          <span className="text-emerald-600 block text-[8px]">
                            • Rec.: {formatCurrency(item.receitaRecebida)} | À Rec.: {formatCurrency(item.receitaAReceber)}
                          </span>
                          <span className="text-[#A67C2E] block font-bold mt-0.5">
                            Desp: {formatCurrency(item.totalDespesa)}
                          </span>
                          <span className="text-amber-700 block text-[8px]">
                            • Paga: {formatCurrency(item.despesaPaga)} | À Pagar: {formatCurrency(item.despesaAPagar)}
                          </span>
                        </div>

                        {/* Par de colunas empilhadas lado a lado */}
                        <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-36">
                          {/* Coluna Receita: Empilhada (Topo: A Receber vazado, Base: Recebido sólido) */}
                          <div
                            style={{ height: `${hReceitaTotal}%` }}
                            className="w-full max-w-[14px] sm:max-w-[18px] flex flex-col justify-end rounded-t-sm overflow-hidden transition-all duration-500 cursor-pointer shadow-xs"
                            title={`Receita (${item.comp}) Total: ${formatCurrency(item.totalReceita)} | Recebido: ${formatCurrency(item.receitaRecebida)} | A Receber: ${formatCurrency(item.receitaAReceber)}`}
                          >
                            {/* Topo: A Receber (Vazada/Dashed) */}
                            {pctAReceber > 0 && (
                              <div
                                style={{ height: `${pctAReceber}%` }}
                                className="w-full bg-emerald-50 border border-dashed border-emerald-500 hover:bg-emerald-100/70 transition-colors shrink-0"
                              />
                            )}
                            {/* Base: Recebido (Sólida) */}
                            {pctRecebido > 0 && (
                              <div
                                style={{ height: `${pctRecebido}%` }}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 transition-colors shrink-0"
                              />
                            )}
                          </div>

                          {/* Coluna Despesa: Empilhada (Topo: A Pagar vazado, Base: Pago sólido) */}
                          <div
                            style={{ height: `${hDespesaTotal}%` }}
                            className="w-full max-w-[14px] sm:max-w-[18px] flex flex-col justify-end rounded-t-sm overflow-hidden transition-all duration-500 cursor-pointer shadow-xs"
                            title={`Despesa (${item.comp}) Total: ${formatCurrency(item.totalDespesa)} | Pago: ${formatCurrency(item.despesaPaga)} | A Pagar: ${formatCurrency(item.despesaAPagar)}`}
                          >
                            {/* Topo: A Pagar (Vazada/Dashed) */}
                            {pctAPagar > 0 && (
                              <div
                                style={{ height: `${pctAPagar}%` }}
                                className="w-full bg-amber-50 border border-dashed border-[#C5A059] hover:bg-amber-100/70 transition-colors shrink-0"
                              />
                            )}
                            {/* Base: Pago (Sólida) */}
                            {pctPago > 0 && (
                              <div
                                style={{ height: `${pctPago}%` }}
                                className="w-full bg-[#C5A059] hover:bg-[#b08e4c] transition-colors shrink-0"
                              />
                            )}
                          </div>
                        </div>

                        {/* Legenda do Mês/Competência */}
                        <span className="text-[10px] text-gray-500 font-semibold mt-2 truncate w-full text-center">
                          {item.comp}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span>Período: Últimos 6 meses</span>
              <span className="font-medium text-gray-600">
                Pico: {formatCurrency(analyticsData.maxEvolucao)}
              </span>
            </div>
          </div>

          {/* Bloco 2: Distribuição dos Gastos (Gráfico de Rosca/Pizza por Categorias) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-[#C5A059]">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900">Distribuição de Gastos</h3>
                  <p className="text-[10px] text-gray-400">
                    Mês corrente ({currentMonthTotals.monthLabel})
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-gray-800">
                {formatCurrency(analyticsData.totalGastosFiltrados)}
              </span>
            </div>

            {/* Gráfico Donut / Rosca em SVG + Lista de Legenda */}
            {analyticsData.distribuicaoGastos.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                Nenhuma despesa para o mês corrente.
              </div>
            ) : (
              <div className="my-4 flex flex-col sm:flex-row items-center justify-center gap-6">
                {/* SVG Donut Chart */}
                <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      className="text-gray-100"
                      strokeWidth="16"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    {(() => {
                      const colors = ['#C5A059', '#3B82F6', '#8B5CF6', '#10B981', '#F43F5E'];
                      const circumference = 2 * Math.PI * 38; // ~238.76
                      let accumulatedOffset = 0;

                      return analyticsData.distribuicaoGastos.map((cat, idx) => {
                        const sliceLength = (cat.percent / 100) * circumference;
                        const strokeDasharray = `${sliceLength} ${circumference - sliceLength}`;
                        const strokeDashoffset = -accumulatedOffset;
                        accumulatedOffset += sliceLength;

                        return (
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="38"
                            stroke={colors[idx % colors.length]}
                            strokeWidth="16"
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            fill="transparent"
                            className="transition-all duration-700 hover:opacity-85 cursor-pointer"
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Centro do Donut */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Gastos</span>
                    <span className="text-xs font-black text-gray-800">100%</span>
                  </div>
                </div>

                {/* Legenda com Cores e Valores */}
                <div className="flex-1 w-full space-y-2">
                  {analyticsData.distribuicaoGastos.map((cat, idx) => {
                    const bgColors = ['bg-[#C5A059]', 'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-rose-500'];
                    const dotColor = bgColors[idx % bgColors.length];

                    return (
                      <div key={idx} className="flex items-center justify-between text-xs group">
                        <div className="flex items-center space-x-2 truncate max-w-[180px]">
                          <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                          <span className="text-gray-700 font-medium truncate" title={cat.categoria}>
                            {cat.categoria}
                          </span>
                        </div>
                        <div className="text-right shrink-0 space-x-1.5">
                          <span className="font-bold text-gray-900">{formatCurrency(cat.valor)}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">({cat.percent.toFixed(1)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span>Top {analyticsData.distribuicaoGastos.length} categorias</span>
              <span className="text-gray-500">Mês corrente ({currentMonthTotals.monthLabel})</span>
            </div>
          </div>

        </div>

        {/* Linha 2 do Dashboard: 2 Colunas (Principais Clientes em Barras Horizontais e Top 5 Inadimplentes) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Bloco 3: Principais Clientes (Gráfico de Barras Horizontais) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900">Principais Clientes</h3>
                  <p className="text-[10px] text-gray-400">Total recebido no histórico completo</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">
                {formatCurrency(analyticsData.totalFaturadoClientes)}
              </span>
            </div>

            {/* Gráfico de Barras Horizontais */}
            <div className="my-4 space-y-3.5">
              {analyticsData.principaisClientes.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  Nenhum recebível liquidado no histórico.
                </div>
              ) : (
                analyticsData.principaisClientes.map((c, idx) => {
                  const barWidth = Math.max(8, Math.round((c.total / analyticsData.maxClienteTotal) * 100));

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2 truncate max-w-[220px]">
                          <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-gray-800 truncate" title={c.nome}>
                            {c.nome}
                          </span>
                        </div>
                        <div className="text-right shrink-0 space-x-2">
                          <span className="font-bold text-gray-900">{formatCurrency(c.total)}</span>
                          <span className="text-[10px] text-gray-400 font-medium">({c.titulos} rec.)</span>
                        </div>
                      </div>
                      {/* Barra Horizontal */}
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500 shadow-xs"
                          title={`${c.nome}: ${formatCurrency(c.total)}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span>Top 5 Maiores Clientes</span>
              <span className="text-gray-500 font-medium">Todo histórico recebido</span>
            </div>
          </div>

          {/* Bloco 4: Inadimplência - Top 5 Clientes Mais Inadimplentes com Total e % Discretos */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900">Inadimplência</h3>
                  <p className="text-[10px] text-gray-400">Top 5 clientes com títulos em aberto</p>
                </div>
              </div>

              {/* Informações discretas de Total e % de Inadimplência no Cabeçalho */}
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <div className="text-xs font-black text-rose-600">
                    {formatCurrency(analyticsData.valorEmAtraso)}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {analyticsData.totalTitulosAtraso} título(s) pendente(s)
                  </div>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
                  {analyticsData.taxaInadimplencia.toFixed(1).replace('.', ',')}% índice
                </span>
              </div>
            </div>

            {/* Lista dos Top 5 Clientes Mais Inadimplentes com Barras Horizontais */}
            <div className="my-4 space-y-3.5">
              {analyticsData.topInadimplentes.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-600 font-medium flex flex-col items-center justify-center space-y-1">
                  <span>Nenhum cliente inadimplente no momento!</span>
                  <span className="text-[10px] text-gray-400 font-normal">Todos os títulos estão liquidados.</span>
                </div>
              ) : (
                analyticsData.topInadimplentes.map((c, idx) => {
                  const barWidth = Math.max(8, Math.round((c.total / analyticsData.maxInadimplenteTotal) * 100));

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2 truncate max-w-[220px]">
                          <span className="w-4 h-4 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-gray-800 truncate" title={c.nome}>
                            {c.nome}
                          </span>
                        </div>
                        <div className="text-right shrink-0 space-x-2">
                          <span className="font-bold text-rose-600">{formatCurrency(c.total)}</span>
                          <span className="text-[10px] text-gray-400 font-medium">({c.titulos} pend.)</span>
                        </div>
                      </div>
                      {/* Barra Horizontal Vermelha */}
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className="bg-gradient-to-r from-rose-500 to-rose-600 h-full rounded-full transition-all duration-500 shadow-xs"
                          title={`${c.nome}: ${formatCurrency(c.total)}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center space-x-1 text-gray-500">
                <span>Top 5 mais inadimplentes</span>
              </span>
              <span className="text-[10px] text-gray-400">
                Índice sobre carteira geral
              </span>
            </div>
          </div>

        </div>

        {/* Linha 3 do Dashboard: Agenda Financeira (Próximos compromissos a pagar e a receber) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-gray-100 gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-[#C5A059] border border-amber-200/60">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                  <span>Agenda Financeira</span>
                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    {agendaCommitments.totalCount} obrigação(ões) na próxima data
                  </span>
                </h3>
                <p className="text-[11px] text-gray-400">
                  {agendaCommitments.proximaData ? (
                    <>
                      Próximo vencimento de saídas em <strong className="text-gray-700">{agendaCommitments.proximaData}</strong> ({agendaCommitments.diasDiferenca === 0 ? 'Hoje' : `em ${agendaCommitments.diasDiferenca} dia(s)`})
                    </>
                  ) : (
                    'Nenhuma obrigação de saída pendente'
                  )}
                </p>
              </div>
            </div>

            {/* Totalizador da Próxima Data */}
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1.5 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-gray-600 font-medium">Total a Pagar na Data:</span>
                <span className="font-bold text-rose-700 font-mono text-sm">
                  {formatCurrency(agendaCommitments.totalPagarAgenda)}
                </span>
              </div>
            </div>
          </div>

          {/* Lista de Itens da Agenda (Obrigações de Saída da Próxima Data) */}
          <div className="mt-3.5 divide-y divide-gray-100">
            {agendaCommitments.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Nenhuma obrigação financeira futura a pagar localizada.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {agendaCommitments.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border flex items-center justify-between transition-all bg-rose-50/20 border-rose-100/80 hover:bg-rose-50/50"
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-rose-100/80 text-rose-700">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-gray-900 truncate" title={item.titulo}>
                            {item.titulo}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">
                          {item.detalhe}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs font-bold font-mono text-rose-700">
                        - {formatCurrency(item.valor)}
                      </div>
                      <div className="text-[10px] font-medium text-gray-400 mt-0.5">
                        Venc: <strong className="text-gray-700">{item.dataFormatted}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

            {/* Seletor de Ano */}
            <div className="flex items-center space-x-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Ano:</span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setSelectedCompetencia('Todas');
                }}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-semibold focus:ring-1 focus:ring-[#C5A059]"
              >
                <option value="Todos">Todos os anos</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

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
                    <option value="C6">C6</option>
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

            {/* Botão Discreto de Exportar Excel */}
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'entradas') {
                  if (filteredEntries.length === 0) {
                    toast('Nenhum recebimento encontrado com os filtros atuais.', 'info');
                    return;
                  }
                  const filterDesc = [
                    selectedCompetencia !== 'Todas' ? selectedCompetencia : '',
                    bancoFilter !== 'Todos' ? bancoFilter : '',
                    clientFilter !== 'Todos' ? clientFilter : '',
                    entryViewFilter !== 'TODOS' ? entryViewFilter : ''
                  ].filter(Boolean).join('_');
                  exportFinancialEntriesToExcel(filteredEntries, filterDesc);
                  toast(`Exportando ${filteredEntries.length} recebimento(s) para Excel...`, 'success');
                } else {
                  if (filteredExpenses.length === 0) {
                    toast('Nenhuma saída encontrada com os filtros atuais.', 'info');
                    return;
                  }
                  const filterDesc = [
                    selectedCompetencia !== 'Todas' ? selectedCompetencia : '',
                    bancoFilter !== 'Todos' ? bancoFilter : '',
                    statusFilter !== 'Todos' ? statusFilter : ''
                  ].filter(Boolean).join('_');
                  exportFinancialExpensesToExcel(filteredExpenses, filterDesc);
                  toast(`Exportando ${filteredExpenses.length} saída(s) para Excel...`, 'success');
                }
              }}
              title={activeTab === 'entradas' ? 'Baixar recebimentos filtrados em Excel' : 'Baixar saídas filtradas em Excel'}
              className="p-2 rounded-lg border border-gray-200 hover:border-emerald-300 bg-white hover:bg-emerald-50 text-gray-500 hover:text-emerald-700 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
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
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'TODOS'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                Todos ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('À RECEBER')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'À RECEBER'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                <span>À RECEBER</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  entryViewFilter === 'À RECEBER' ? 'bg-white/20 text-white' : 'bg-slate-200 text-stone-700'
                }`}>
                  {pendingCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('RECEBIDO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'RECEBIDO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                RECEBIDO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PERMUTA')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PERMUTA'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                PERMUTA
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('INDICAÇÃO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'INDICAÇÃO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                INDICAÇÃO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PREJUÍZO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PREJUÍZO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                PREJUÍZO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('ISENTO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'ISENTO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                ISENTO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PARCELADO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PARCELADO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
                }`}
              >
                PARCELADO
              </button>
              <button
                type="button"
                onClick={() => setEntryViewFilter('PROTESTADO')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  entryViewFilter === 'PROTESTADO'
                    ? 'bg-stone-800 text-white shadow-xs'
                    : 'bg-slate-100 text-stone-600 hover:bg-slate-200/80 border border-slate-200/60'
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
                          {(() => {
                            const norm = (exp.status || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                            const isPaid = norm === 'PAGO' || norm === 'DESCONTADO';
                            const isPending = norm === 'A PAGAR';
                            return (
                              <>
                                <select
                                  value={isPending ? 'A pagar' : isPaid ? (norm === 'DESCONTADO' ? 'Descontado' : 'Pago') : exp.status}
                                  onChange={(e) => handleQuickExpenseStatusChange(exp, e.target.value)}
                                  className={`text-[10px] font-bold py-1 px-2 rounded-full border cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#C5A059] ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-bold'
                                      : isPending
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
                                {isPending && (
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
                              </>
                            );
                          })()}
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
          defaultCompetencia={selectedCompetencia === 'Todas' ? currentMonthCompetencia : selectedCompetencia}
        />
      )}

      {/* Modal de Inclusão / Edição de Saída */}
      {isExpenseModalOpen && (
        <FinancialExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => setIsExpenseModalOpen(false)}
          onSuccess={fetchFinancialData}
          expenseToEdit={selectedExpense}
          defaultCompetencia={selectedCompetencia === 'Todas' ? currentMonthCompetencia : selectedCompetencia}
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
