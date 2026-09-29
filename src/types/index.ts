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
  parcelamento_ativo?: boolean | null;
  tipo_servico?: string | null;
  obrigacoes_habilitadas?: string[] | null;
  created_at?: string;
  updated_at?: string;
  client_credentials?: ClientCredential[];
}

export interface FiscalRecord {
  id: string;
  client_id: string;
  competencia: string;
  regime: string;
  obrigacao: string;
  valor: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export type ApuracaoValidationStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVIEW';

export interface ClientApuracaoValidation {
  id: string;
  client_id: string;
  competencia: string;
  regime: string;
  status: ApuracaoValidationStatus;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  pending_obligations?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export type NotificationType =
  | 'APURACAO_100_PERCENT'
  | 'APURACAO_NEEDS_REVIEW'
  | 'APURACAO_APPROVED'
  | 'GENERAL';

export interface AppNotification {
  id: string;
  recipient_id?: string | null; // Se nulo, pode ser para todos os ADMs ou broadcast
  recipient_role?: UserRole | null; // 'admin' ou 'colaborador'
  sender_id?: string | null;
  sender_name?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  client_id?: string | null;
  client_name?: string | null;
  competencia?: string | null;
  regime?: string | null;
  read: boolean;
  link?: string | null;
  created_at: string;
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

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'ACCESS_DENIED' | 'BATCH_INSERT' | 'PASSWORD_CHANGE';
export type AuditEntity =
  | 'CLIENT'
  | 'CREDENTIAL'
  | 'FINANCIAL_ENTRY'
  | 'FINANCIAL_EXPENSE'
  | 'SECURITY'
  | 'USER';

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
