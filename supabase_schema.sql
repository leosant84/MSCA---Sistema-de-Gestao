-- ==============================================================================
-- MSCA - Sistema de Gestão: Modelagem de Banco de Dados e Políticas RLS (Supabase)
-- ==============================================================================

-- 1. ENUMS E EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'colaborador');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 2. TABELAS PRINCIPAIS
-- ==============================================================================

-- 2.1. Perfis de Usuários (RBAC integrado com auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'colaborador',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2. Clientes (Estrutura operacional contábil)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'Ativo',
    inicio_atividades DATE,
    sieg TEXT,
    cnpj VARCHAR(14),
    nire TEXT,
    cpf VARCHAR(11),
    regime_tributario TEXT,
    puro_ou_hibrido TEXT,
    codigo_acesso_simples TEXT,
    numero_pasta TEXT,
    razao_social TEXT NOT NULL,
    localidade TEXT,
    fator_r TEXT,
    login_prefeitura TEXT,
    senha_prefeitura TEXT,
    login_posto_fiscal TEXT,
    senha_posto_fiscal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3. Credenciais e Acessos Extras do Cliente
CREATE TABLE IF NOT EXISTS public.client_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    sistema_nome TEXT NOT NULL,
    login TEXT,
    senha TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4. Categorias Financeiras Dinâmicas (Contas Contábeis)
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.5. Financeiro: Entradas (Receitas / Projeções)
CREATE TABLE IF NOT EXISTS public.financial_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_recebimento DATE, -- Opcional no estado "À RECEBER" ou "PERMUTA"
    competencia VARCHAR(10) NOT NULL, -- Ex: "out/26" ou "10/2026"
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    cliente_nome_avulso TEXT,
    conta_contabil TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'À RECEBER', -- 'À RECEBER', 'RECEBIDO', 'PERMUTA'
    banco TEXT, -- Opcional no estado "À RECEBER" ou "PERMUTA"
    observacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.6. Financeiro: Saídas (Despesas)
CREATE TABLE IF NOT EXISTS public.financial_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_pagamento_previsao DATE NOT NULL,
    competencia VARCHAR(10) NOT NULL,
    descricao_pagamento TEXT NOT NULL,
    observacao TEXT,
    conta_contabil TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pago', -- 'Pago', 'Previsto', 'Cancelado'
    banco TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. ÍNDICES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_clients_razao_social ON public.clients (razao_social);
CREATE INDEX IF NOT EXISTS idx_clients_cnpj ON public.clients (cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);
CREATE INDEX IF NOT EXISTS idx_client_credentials_client_id ON public.client_credentials (client_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_competencia ON public.financial_entries (competencia);
CREATE INDEX IF NOT EXISTS idx_financial_entries_status ON public.financial_entries (status);
CREATE INDEX IF NOT EXISTS idx_financial_entries_data_recebimento ON public.financial_entries (data_recebimento);
CREATE INDEX IF NOT EXISTS idx_financial_entries_client_id ON public.financial_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_financial_expenses_competencia ON public.financial_expenses (competencia);
CREATE INDEX IF NOT EXISTS idx_financial_expenses_data_pagamento ON public.financial_expenses (data_pagamento_previsao);

-- ==============================================================================
-- 4. TRIGGERS E FUNÇÕES AUXILIARES
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'colaborador'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$;

-- ==============================================================================
-- 5. SEGURANÇA E ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expenses ENABLE ROW LEVEL SECURITY;

-- Policies Profiles
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (
    public.is_admin() OR (
        id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    )
);

-- Policies Clients
CREATE POLICY "clients_select_authenticated" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert_authenticated" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update_authenticated" ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clients_delete_admin" ON public.clients FOR DELETE TO authenticated USING (public.is_admin());

-- Policies Client Credentials
CREATE POLICY "credentials_select_authenticated" ON public.client_credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "credentials_insert_authenticated" ON public.client_credentials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "credentials_update_authenticated" ON public.client_credentials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "credentials_delete_admin" ON public.client_credentials FOR DELETE TO authenticated USING (public.is_admin());

-- Policies Financial Categories (Leitura para autenticados, Escrita para Admin)
CREATE POLICY "categories_select_authenticated" ON public.financial_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_all_admin" ON public.financial_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Policies Financial Entries & Expenses (Apenas Admin)
CREATE POLICY "financial_entries_admin_policy" ON public.financial_entries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "financial_expenses_admin_policy" ON public.financial_expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==============================================================================
-- 6. CARGA INICIAL (SEED) DE CATEGORIAS CONTÁBEIS
-- ==============================================================================
INSERT INTO public.financial_categories (nome, tipo)
VALUES
    ('Honorários', 'entrada'),
    ('13º Honorários', 'entrada'),
    ('Aberturas de empresa', 'entrada'),
    ('Encerramento de empresa', 'entrada'),
    ('Alterações Contratuais', 'entrada'),
    ('Certificado Digital', 'entrada'),
    ('Demais receitas', 'entrada'),
    ('Devoluções', 'entrada'),
    ('Empréstimos', 'entrada')
ON CONFLICT (nome) DO NOTHING;
