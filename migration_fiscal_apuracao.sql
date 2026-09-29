-- ==============================================================================
-- MSCA - Migration: Apuração Fiscal e Contábil
-- 1. Campos de obrigações e tipo de serviço no cadastro de clientes
-- 2. Tabela de registros mensais de apuração (fiscal_records)
-- ==============================================================================

-- 1. Adicionar campos na tabela clients se ainda não existirem
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS tipo_servico TEXT DEFAULT 'Simples Nacional';

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS obrigacoes_habilitadas JSONB DEFAULT '[]'::jsonb;

-- 2. Criar tabela de registros de apuração fiscal mensal
CREATE TABLE IF NOT EXISTS public.fiscal_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    competencia VARCHAR(10) NOT NULL, -- Ex: "09/2026" ou "set/26"
    regime TEXT NOT NULL,             -- "Simples Nacional" | "Lucro Presumido" | "Folha de Pagamento"
    obrigacao TEXT NOT NULL,          -- Nome da obrigação (ex: "GUIA INSS")
    valor TEXT DEFAULT '',            -- Valor digitado (ex: "OK", número de guia, obs)
    status TEXT DEFAULT 'PENDENTE',   -- "OK" ou "PENDENTE"
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_fiscal_client_comp_obrigacao UNIQUE (client_id, competencia, obrigacao)
);

-- Índices para performance nas consultas da apuração mensal
CREATE INDEX IF NOT EXISTS idx_fiscal_records_comp_regime ON public.fiscal_records(competencia, regime);
CREATE INDEX IF NOT EXISTS idx_fiscal_records_client ON public.fiscal_records(client_id);

-- Habilitar RLS
ALTER TABLE public.fiscal_records ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: Todos os usuários autenticados podem consultar e editar apurações
DROP POLICY IF EXISTS "Todos autenticados podem ver fiscal_records" ON public.fiscal_records;
CREATE POLICY "Todos autenticados podem ver fiscal_records"
    ON public.fiscal_records
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Todos autenticados podem inserir fiscal_records" ON public.fiscal_records;
CREATE POLICY "Todos autenticados podem inserir fiscal_records"
    ON public.fiscal_records
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Todos autenticados podem atualizar fiscal_records" ON public.fiscal_records;
CREATE POLICY "Todos autenticados podem atualizar fiscal_records"
    ON public.fiscal_records
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins podem deletar fiscal_records" ON public.fiscal_records;
CREATE POLICY "Admins podem deletar fiscal_records"
    ON public.fiscal_records
    FOR DELETE
    TO authenticated
    USING (true);
