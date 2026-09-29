-- ==============================================================================
-- MSCA - Migration: Sistema de Notificações e Workflow de Aprovação
-- 1. Criação da tabela de notificações (notifications)
-- 2. Políticas de RLS para notificações
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_role TEXT,              -- 'admin' | 'colaborador' | NULL
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sender_name TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,               -- 'APURACAO_100_PERCENT' | 'APURACAO_NEEDS_REVIEW' | 'APURACAO_APPROVED' | 'GENERAL'
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    client_name TEXT,
    competencia VARCHAR(10),
    regime TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON public.notifications(recipient_role, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Usuários autenticados podem ver suas notificações" ON public.notifications;
CREATE POLICY "Usuários autenticados podem ver suas notificações"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (
        recipient_id = auth.uid() 
        OR recipient_role IS NULL 
        OR (recipient_role = 'admin' AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        ))
        OR (recipient_role = 'colaborador')
    );

DROP POLICY IF EXISTS "Usuários autenticados podem inserir notificações" ON public.notifications;
CREATE POLICY "Usuários autenticados podem inserir notificações"
    ON public.notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar notificações" ON public.notifications;
CREATE POLICY "Usuários autenticados podem atualizar notificações"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
