import * as XLSX from 'xlsx';
import type { Client, FinancialEntry, FinancialExpense } from '../types';
import { hasClientFolha } from '../constants/fiscalObligations';

/**
 * Função utilitária para acionar o download do buffer gerado no navegador
 */
function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

/**
 * Formata data no formato DD/MM/AAAA ou MM/AAAA
 */
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    if (parts.length === 2) {
      return `${parts[1]}/${parts[0]}`;
    }
  }
  return clean;
}

/**
 * Normaliza e padroniza status com a primeira letra maiúscula e as demais minúsculas (ex: "Ativo", "Inativo", "Recebido", "Pendente")
 */
function formatStatusTitleCase(statusStr?: string | null): string {
  if (!statusStr) return '';
  const clean = statusStr.trim();
  if (!clean) return '';
  // Trata palavras compostas ou com sublinhado/espaço se houver (ex: EM_ABERTO -> Em Aberto)
  return clean
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Normaliza exibição de banco para Itaú (c/c) e Cora (c/c)
 */
function normalizeBanco(bancoStr?: string | null): string {
  if (!bancoStr) return '';
  const clean = bancoStr.trim();
  const lower = clean.toLowerCase();
  if (lower === 'itau' || lower === 'itaú' || lower.startsWith('itaú (c/c)') || lower.startsWith('itau (c/c)')) {
    return 'Itaú (c/c)';
  }
  if (lower === 'cora' || lower.startsWith('cora (c/c)')) {
    return 'Cora (c/c)';
  }
  return clean;
}

export interface ClientExportFieldOption {
  key: string;
  label: string;
  defaultChecked?: boolean;
}

export const AVAILABLE_CLIENT_EXPORT_FIELDS: ClientExportFieldOption[] = [
  { key: 'status', label: 'Status', defaultChecked: true },
  { key: 'numero_pasta', label: 'Nº Domínio', defaultChecked: true },
  { key: 'razao_social', label: 'Razão Social / Nome', defaultChecked: true },
  { key: 'cnpj', label: 'CNPJ', defaultChecked: true },
  { key: 'cpf', label: 'CPF', defaultChecked: true },
  { key: 'regime_tributario', label: 'Regime Tributário', defaultChecked: true },
  { key: 'folha_pagamento', label: 'Folha de Pagamento', defaultChecked: true },
  { key: 'puro_ou_hibrido', label: 'Puro ou Híbrido', defaultChecked: true },
  { key: 'fator_r', label: 'Fator R', defaultChecked: true },
  { key: 'localidade', label: 'Localidade', defaultChecked: true },
  { key: 'parcelamento_ativo', label: 'Parcelamento Ativo', defaultChecked: true },
];

/**
 * Exporta a lista de Clientes para Excel (.xlsx) respeitando os campos selecionados e filtros aplicados
 */
export function exportClientsToExcel(
  clients: Client[],
  filterContext?: string,
  selectedFieldKeys?: string[]
) {
  // Se não informar lista, usa todos os campos disponíveis
  const rawKeys = selectedFieldKeys && selectedFieldKeys.length > 0
    ? selectedFieldKeys
    : AVAILABLE_CLIENT_EXPORT_FIELDS.map((f) => f.key);

  // Garante obrigatoriamente que 'status', se selecionado, seja posicionado como a primeira coluna
  const fieldKeys = rawKeys.includes('status')
    ? ['status', ...rawKeys.filter((k) => k !== 'status')]
    : rawKeys;

  const columnWidthsMap: Record<string, number> = {
    'status': 14,
    'numero_pasta': 14,
    'razao_social': 42,
    'cnpj': 22,
    'cpf': 18,
    'regime_tributario': 24,
    'folha_pagamento': 20,
    'puro_ou_hibrido': 16,
    'fator_r': 12,
    'localidade': 26,
    'parcelamento_ativo': 20,
  };

  const rows = clients.map((c) => {
    const row: Record<string, string> = {};

    // Status posicionado obrigatoriamente como primeira coluna
    if (fieldKeys.includes('status')) {
      row['Status'] = formatStatusTitleCase(c.status);
    }
    if (fieldKeys.includes('numero_pasta')) {
      row['Nº Domínio'] = c.numero_pasta || '';
    }
    if (fieldKeys.includes('razao_social')) {
      row['Razão Social'] = c.razao_social || '';
    }
    if (fieldKeys.includes('cnpj')) {
      row['CNPJ'] = c.cnpj || '';
    }
    if (fieldKeys.includes('cpf')) {
      row['CPF'] = c.cpf || '';
    }
    if (fieldKeys.includes('regime_tributario')) {
      row['Regime Tributário'] = c.regime_tributario || '';
    }
    if (fieldKeys.includes('folha_pagamento')) {
      row['Folha de Pagamento'] = hasClientFolha(c) ? 'Sim' : 'Não';
    }
    if (fieldKeys.includes('puro_ou_hibrido')) {
      row['Puro/Híbrido'] = c.puro_ou_hibrido || '';
    }
    if (fieldKeys.includes('fator_r')) {
      row['Fator R'] = c.fator_r || '';
    }
    if (fieldKeys.includes('localidade')) {
      row['Localidade'] = c.localidade || '';
    }
    if (fieldKeys.includes('parcelamento_ativo')) {
      row['Parcelamento Ativo'] = c.parcelamento_ativo ? 'Sim' : 'Não';
    }

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Ajusta larguras das colunas baseado nas chaves selecionadas
  worksheet['!cols'] = fieldKeys.map((k) => ({
    wch: columnWidthsMap[k] || 18,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

  const timestamp = new Date().toISOString().slice(0, 10);
  const suffix = filterContext ? `_${filterContext.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
  downloadWorkbook(workbook, `relatorio_clientes${suffix}_${timestamp}.xlsx`);
}

/**
 * Exporta lançamentos de Entradas (Recebimentos) para Excel (.xlsx) respeitando filtros
 */
export function exportFinancialEntriesToExcel(
  entries: FinancialEntry[],
  filtersDescription?: string
) {
  const rows = entries.map((e) => {
    const clientName = e.client?.razao_social || e.cliente_nome_avulso || 'Não informado';
    return {
      'Competência': e.competencia || '',
      'Cliente': clientName,
      'Conta Contábil / Categoria': e.conta_contabil || '',
      'Valor (R$)': Number(e.valor || 0),
      'Status': formatStatusTitleCase(e.status),
      'Banco': normalizeBanco(e.banco),
      'Data Recebimento': formatDate(e.data_recebimento),
      'Observação': e.observacao || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 14 }, // Competência
    { wch: 40 }, // Cliente
    { wch: 28 }, // Conta Contábil
    { wch: 16 }, // Valor
    { wch: 16 }, // Status
    { wch: 16 }, // Banco
    { wch: 18 }, // Data Recebimento
    { wch: 35 }, // Observação
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recebimentos');

  const timestamp = new Date().toISOString().slice(0, 10);
  const suffix = filtersDescription ? `_${filtersDescription.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
  downloadWorkbook(workbook, `relatorio_financeiro_recebimentos${suffix}_${timestamp}.xlsx`);
}

/**
 * Exporta lançamentos de Saídas (Despesas) para Excel (.xlsx) respeitando filtros
 */
export function exportFinancialExpensesToExcel(
  expenses: FinancialExpense[],
  filtersDescription?: string
) {
  const rows = expenses.map((e) => {
    return {
      'Competência': e.competencia || '',
      'Descrição / Fornecedor': e.descricao_pagamento || '',
      'Conta Contábil / Categoria': e.conta_contabil || '',
      'Valor (R$)': Number(e.valor || 0),
      'Status': formatStatusTitleCase(e.status),
      'Banco': normalizeBanco(e.banco),
      'Previsão / Pagamento': formatDate(e.data_pagamento_previsao),
      'Observação': e.observacao || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 14 }, // Competência
    { wch: 40 }, // Descrição
    { wch: 28 }, // Conta Contábil
    { wch: 16 }, // Valor
    { wch: 16 }, // Status
    { wch: 16 }, // Banco
    { wch: 20 }, // Previsão
    { wch: 35 }, // Observação
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Saídas');

  const timestamp = new Date().toISOString().slice(0, 10);
  const suffix = filtersDescription ? `_${filtersDescription.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
  downloadWorkbook(workbook, `relatorio_financeiro_saidas${suffix}_${timestamp}.xlsx`);
}
