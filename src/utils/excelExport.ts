import * as XLSX from 'xlsx';
import type { Client, FinancialEntry, FinancialExpense } from '../types';

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
 * Exporta a lista de Clientes para Excel (.xlsx) respeitando os filtros aplicados
 */
export function exportClientsToExcel(clients: Client[], filterContext?: string) {
  const rows = clients.map((c) => {
    // Formata credenciais extras em texto legível se houver
    const extras = (c.client_credentials || [])
      .map((cr) => `${cr.sistema_nome}: ${cr.login || ''}`)
      .join(' | ');

    return {
      'Nº Domínio': c.numero_pasta || '',
      'Razão Social': c.razao_social || '',
      'Status': c.status || '',
      'CNPJ': c.cnpj || '',
      'CPF': c.cpf || '',
      'Regime Tributário': c.regime_tributario || '',
      'Puro/Híbrido': c.puro_ou_hibrido || '',
      'Fator R': c.fator_r || '',
      'Localidade': c.localidade || '',
      'Início Atividades': formatDate(c.inicio_atividades),
      'Parcelamento Ativo': c.parcelamento_ativo ? 'Sim' : 'Não',
      'SIEG': c.sieg || 'Não',
      'NIRE': c.nire || '',
      'Cód. Acesso Simples': c.codigo_acesso_simples || '',
      'Login Prefeitura': c.login_prefeitura || '',
      'Login Posto Fiscal': c.login_posto_fiscal || '',
      'Sistemas Extras': extras,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Ajuste automático de largura de colunas
  worksheet['!cols'] = [
    { wch: 12 }, // Nº Domínio
    { wch: 40 }, // Razão Social
    { wch: 14 }, // Status
    { wch: 20 }, // CNPJ
    { wch: 16 }, // CPF
    { wch: 20 }, // Regime Tributário
    { wch: 14 }, // Puro/Híbrido
    { wch: 10 }, // Fator R
    { wch: 25 }, // Localidade
    { wch: 18 }, // Início Atividades
    { wch: 18 }, // Parcelamento Ativo
    { wch: 8 },  // SIEG
    { wch: 16 }, // NIRE
    { wch: 20 }, // Cód. Acesso Simples
    { wch: 20 }, // Login Prefeitura
    { wch: 20 }, // Login Posto Fiscal
    { wch: 35 }, // Sistemas Extras
  ];

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
      'Status': e.status || '',
      'Banco': e.banco || '',
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
      'Status': e.status || '',
      'Banco': e.banco || '',
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
