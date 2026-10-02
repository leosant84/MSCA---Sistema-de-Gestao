// Constantes e listas de obrigações por regime/tipo de serviço contábil

export type FiscalRegimeType = 'Simples Nacional' | 'Lucro Presumido' | 'Folha de Pagamento';

export const FISCAL_REGIME_OPTIONS: { value: FiscalRegimeType; label: string }[] = [
  { value: 'Simples Nacional', label: 'Simples Nacional' },
  { value: 'Lucro Presumido', label: 'Lucro Presumido' },
  { value: 'Folha de Pagamento', label: 'Folha de Pagamento' },
];

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
