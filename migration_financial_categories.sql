-- ==============================================================================
-- MSCA - Migração: Categorias Financeiras e Ajustes de Nullable
-- Execute este script no SQL Editor do Supabase se o schema base já foi criado
-- ==============================================================================

-- 1. Cria tabela de categorias financeiras dinâmicas
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ativa RLS
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para categorias
CREATE POLICY "categories_select_authenticated" 
    ON public.financial_categories FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "categories_all_admin" 
    ON public.financial_categories FOR ALL 
    TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- 2. Torna data_recebimento e banco opcionais para permitir o estado "À RECEBER" e "PERMUTA"
ALTER TABLE public.financial_entries ALTER COLUMN data_recebimento DROP NOT NULL;
ALTER TABLE public.financial_entries ALTER COLUMN banco DROP NOT NULL;

-- 3. Carga inicial (Seed) de categorias padrão da contabilidade
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
