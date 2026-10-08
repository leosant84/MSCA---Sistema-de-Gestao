// Constantes e listas de obrigações por regime/tipo de serviço contábil

export type FiscalRegimeType = 'Simples Nacional' | 'Lucro Presumido' | 'Folha de Pagamento';

export type ClientTaxRegime = 'Simples Nacional' | 'Lucro Presumido';

export const CLIENT_TAX_REGIMES: { value: ClientTaxRegime; label: string }[] = [
  { value: 'Simples Nacional', label: 'Simples Nacional' },
  { value: 'Lucro Presumido', label: 'Lucro Presumido' },
];

export const FISCAL_REGIME_OPTIONS: { value: FiscalRegimeType; label: string }[] = [
  { value: 'Simples Nacional', label: 'Simples Nacional' },
  { value: 'Lucro Presumido', label: 'Lucro Presumido' },
  { value: 'Folha de Pagamento', label: 'Folha de Pagamento' },
];

export const FOLHA_PAGAMENTO_OBLIGATIONS: string[] = [
  'ADIANTAMENTO',
  'CALCULO FOPAG',
  'GUIA INSS',
  'GUIA FGTS',
  'CONTR. ASSISTENCIAL',
  'RECIBO VALE TRANSPORTE',
  'RECIBO CESTA BÁSICA',
];

export const normalizeRegime = (val?: string | null): ClientTaxRegime => {
  if (!val) return 'Simples Nacional';
  const clean = val.trim().toUpperCase();
  if (clean.includes('PRESUMIDO')) {
    return 'Lucro Presumido';
  }
  return 'Simples Nacional';
};

/**
 * Checa se um cliente possui o módulo/flag de Folha de Pagamento ativado
 */
export const hasClientFolha = (client?: {
  id?: string;
  folha_pagamento?: string | boolean | null;
  tipo_servico?: string | null;
  regime_tributario?: string | null;
  obrigacoes_habilitadas?: string[] | null;
} | null): boolean => {
  if (!client) return false;

  // 1. Flag direta de folha_pagamento
  if (client.folha_pagamento !== undefined && client.folha_pagamento !== null) {
    const folhaStr = String(client.folha_pagamento).trim().toUpperCase();
    if (folhaStr === 'SIM' || folhaStr === 'TRUE') return true;
    if (folhaStr === 'NÃO' || folhaStr === 'NAO' || folhaStr === 'FALSE') return false;
  }

  // 2. Se possuir obrigações de folha já marcadas no perfil
  const obs = client.obrigacoes_habilitadas;
  if (Array.isArray(obs) && obs.length > 0) {
    const folhaCheck = [
      'ADIANTAMENTO',
      'CALCULO FOPAG',
      'GUIA FGTS',
      'CONTR. ASSISTENCIAL',
      'RECIBO VALE TRANSPORTE',
      'RECIBO CESTA BÁSICA',
    ];
    if (obs.some((o) => folhaCheck.includes((o || '').trim().toUpperCase()))) {
      return true;
    }
  }

  // 3. Legado: tipo_servico ou regime anterior marcado como Folha de Pagamento
  const tipoServico = (client.tipo_servico || '').trim().toUpperCase();
  const regTrib = (client.regime_tributario || '').trim().toUpperCase();
  if (tipoServico.includes('FOLHA') || regTrib.includes('FOLHA')) {
    return true;
  }

  return false;
};

export const FISCAL_OBLIGATIONS: Record<FiscalRegimeType, string[]> = {
  'Simples Nacional': [
    'PRO LAB / INSS',
    'GUIA DE ISS',
    "BAIXAR OS XML'S",
    'IMPORTAR DOMINIO',
    'GERAR OS DAS',
    'Parc. Ativo',
  ],
  'Lucro Presumido': [
    'GUIA DE ISS TOMADOS',
    'GUIA DE ISS PRESTADOS',
    "BAIXAR OS XML'S",
    'IMPORTAR DOMINIO',
    'GUIA DE ICMS',
    'GUIA PIS',
    'GUIA COFINS',
    'GUIAS - PARC. IRPJ',
    'GUIAS - PARC. CSLL',
    'REINF',
    'DCTFweb',
    'Parc. Ativo',
    'DCTF',
    'EFD CONTR.',
    'EFD ICMS',
  ],
  'Folha de Pagamento': [
    'ADIANTAMENTO',
    'CALCULO FOPAG',
    'GUIA INSS',
    'GUIA FGTS',
    'CONTR. ASSISTENCIAL',
    'RECIBO VALE TRANSPORTE',
    'RECIBO CESTA BÁSICA',
  ],
};
