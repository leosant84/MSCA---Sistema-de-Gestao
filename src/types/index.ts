export type UserRole = 'admin' | 'colaborador';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface ClientCredential {
  id: string;
  client_id: string;
  sistema_nome: string;
  login?: string | null;
  senha?: string | null;
  created_at?: string;
}

export interface Client {
  id: string;
  status: string;
  inicio_atividades?: string | null;
  sieg?: string | null;
  cnpj?: string | null;
  nire?: string | null;
  cpf?: string | null;
  regime_tributario?: string | null;
  puro_ou_hibrido?: string | null;
  codigo_acesso_simples?: string | null;
  numero_pasta?: string | null;
  razao_social: string;
  localidade?: string | null;
  fator_r?: string | null;
  login_prefeitura?: string | null;
  senha_prefeitura?: string | null;
  login_posto_fiscal?: string | null;
  senha_posto_fiscal?: string | null;
  created_at?: string;
  updated_at?: string;
  client_credentials?: ClientCredential[];
}

export interface FinancialCategory {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida';
  created_at?: string;
}

export type FinancialEntryStatus =
  | 'À RECEBER'
  | 'RECEBIDO'
  | 'PERMUTA'
  | 'INDICAÇÃO'
  | 'PREJUÍZO'
  | 'ISENTO'
  | 'PARCELADO'
  | 'PROTESTADO';

export type FinancialExpenseStatus = 'A pagar' | 'Pago' | 'Permuta' | 'Descontado';

export interface FinancialEntry {
  id: string;
  data_recebimento?: string | null;
  competencia: string; // Ex: 'out/26' ou '10/2026'
  client_id?: string | null;
  cliente_nome_avulso?: string | null;
  conta_contabil: string;
  valor: number;
  status: FinancialEntryStatus | string;
  banco?: string | null;
  observacao?: string | null;
  created_at?: string;
  client?: {
    id: string;
    razao_social: string;
  } | null;
}

export interface FinancialExpense {
  id: string;
  data_pagamento_previsao: string;
  competencia: string;
  descricao_pagamento: string;
  observacao?: string | null;
  conta_contabil: string;
  valor: number;
  status: FinancialExpenseStatus | string;
  banco: string;
  created_at?: string;
}

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'ACCESS_DENIED' | 'BATCH_INSERT';
export type AuditEntity =
  | 'CLIENT'
  | 'CREDENTIAL'
  | 'FINANCIAL_ENTRY'
  | 'FINANCIAL_EXPENSE'
  | 'SECURITY';

export interface AuditFieldChange {
  old?: unknown;
  new?: unknown;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  action: AuditAction | string;
  entity: AuditEntity | string;
  entity_id?: string | null;
  entity_name?: string | null;
  changes?: Record<string, AuditFieldChange> | null;
  ip_address?: string | null;
  created_at: string;
}
