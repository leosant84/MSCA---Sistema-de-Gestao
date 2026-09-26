// Categorias e subcontas contábeis de Saídas (Despesas) baseadas na operação e planilhas contábeis
// Estruturadas por Macro-Categorias com suas respectivas subopções em ordem alfabética

export interface ExpenseCategoryGroup {
  grupo: string;
  contas: string[];
}

export const EXPENSE_CATEGORIES_DATA: ExpenseCategoryGroup[] = [
  {
    grupo: 'DESPESAS ADMINISTRATIVAS & OPERACIONAIS',
    contas: [
      'Aluguel',
      'Assinaturas & Softwares',
      'Cartório & Certidões',
      'Condomínio / IPTU',
      'Consultorias & Honorários Terceiros',
      'Correios & Encomendas',
      'Energia Elétrica',
      'Gás',
      'Internet & Telefonia',
      'Limpeza & Conservação',
      'Manutenção & Reformas',
      'Material de Escritório',
      'Móveis & Equipamentos',
      'Segurança & Monitoramento',
    ],
  },
  {
    grupo: 'DESPESAS COM PESSOAL & BENEFÍCIOS',
    contas: [
      '13º Salário',
      'Adiantamento Salarial',
      'Benefícios / VT / VR',
      'FGTS',
      'Férias',
      'Fretado / Transporte',
      'INSS Patronal / Folha',
      'Pró-labore',
      'Salários / Folha de Pagamento',
    ],
  },
  {
    grupo: 'IMPOSTOS & CONTRIBUIÇÕES',
    contas: [
      'DAS - Simples Nacional',
      'Demais Tributos Federais',
      'Impostos Municipais (ISS)',
      'Taxas de Licença & Fiscalização',
      'Tributos Estaduais (ICMS)',
    ],
  },
  {
    grupo: 'DESPESAS FINANCEIRAS & BANCÁRIAS',
    contas: [
      'Empréstimos / Financiamentos',
      'Juros & Multas',
      'Parcelamento Cartão de Crédito',
      'Tarifas & Taxas Bancárias',
    ],
  },
  {
    grupo: 'INVESTIMENTOS & FUTURO',
    contas: [
      'Aplicações & Investimentos',
      'Cursos & Capacitações',
      'Marketing & Publicidade',
      'Previdência Privada',
      'Reserva de Emergência',
    ],
  },
  {
    grupo: 'OUTRAS DESPESAS',
    contas: [
      'Combustível & Estacionamento',
      'Despesas com Viagens',
      'Despesas Diversas / Eventuais',
      'Doações & Patrocínios',
      'Reembolsos a Sócios / Terceiros',
    ],
  },
].map((g) => ({
  grupo: g.grupo,
  contas: [...g.contas].sort((a, b) => a.localeCompare(b, 'pt-BR')),
})).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR'));

// Formas de Pagamento permitidas no controle de saídas
export const EXPENSE_PAYMENT_METHODS = [
  'Itaú (c/c)',
  'Cora (c/c)',
  'Cartão de Crédito',
  'Boleto',
] as const;

export type ExpensePaymentMethod = typeof EXPENSE_PAYMENT_METHODS[number];
