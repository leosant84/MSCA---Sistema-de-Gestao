-- ==============================================================================
-- MSCA - Sistema de Gestão: Módulo de Auditoria e Logs de Alterações (Audit Trail)
-- Execute este script no SQL Editor do Supabase
-- ==============================================================================

-- 1. Criação da tabela de auditoria audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'ACCESS_DENIED'
    entity TEXT NOT NULL, -- 'CLIENT', 'CREDENTIAL', 'FINANCIAL_ENTRY', 'FINANCIAL_EXPENSE', 'SECURITY'
    entity_id UUID,
    entity_name TEXT,     -- Ex: Razão Social do cliente ou descrição do registro
    changes JSONB,        -- Registro das alterações: {"campo": {"old": "X", "new": "Y"}}
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para buscas rápidas e relatórios filtrados
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs (entity_id);

-- 2. Habilitação de Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Exclui políticas antigas se existirem
DROP POLICY IF EXISTS "Admin pode consultar audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;

-- Políticas de RLS:
-- 2.1. Apenas Administradores podem consultar logs
CREATE POLICY "Admin pode consultar audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 2.2. Usuários autenticados podem inserir logs (usado também por triggers ou pelo app ao registrar tentativas)
CREATE POLICY "audit_logs_insert_authenticated"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Função de Trigger genérica e segura para auditoria automática no banco de dados
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_uid UUID;
    cur_email TEXT;
    cur_name TEXT;
    ent_type TEXT;
    ent_id UUID;
    ent_name TEXT;
    diff_json JSONB := '{}'::jsonb;
    key TEXT;
    old_val JSONB;
    new_val JSONB;
    sensitive_keys TEXT[] := ARRAY['senha', 'senha_prefeitura', 'senha_posto_fiscal', 'codigo_acesso_simples'];
BEGIN
    current_uid := auth.uid();
    
    -- Identifica o usuário da sessão
    IF current_uid IS NOT NULL THEN
        SELECT email, COALESCE(full_name, email)
        INTO cur_email, cur_name
        FROM public.profiles
        WHERE id = current_uid;
    END IF;

    -- Define o tipo de entidade com base na tabela disparada
    CASE TG_TABLE_NAME
        WHEN 'clients' THEN
            ent_type := 'CLIENT';
        WHEN 'client_credentials' THEN
            ent_type := 'CREDENTIAL';
        WHEN 'financial_entries' THEN
            ent_type := 'FINANCIAL_ENTRY';
        WHEN 'financial_expenses' THEN
            ent_type := 'FINANCIAL_EXPENSE';
        ELSE
            ent_type := UPPER(TG_TABLE_NAME);
    END CASE;

    -- Processa o tipo de operação
    IF (TG_OP = 'INSERT') THEN
        ent_id := NEW.id;
        
        IF TG_TABLE_NAME = 'clients' THEN
            ent_name := NEW.razao_social;
        ELSIF TG_TABLE_NAME = 'client_credentials' THEN
            ent_name := NEW.sistema_nome;
        ELSIF TG_TABLE_NAME = 'financial_entries' THEN
            ent_name := COALESCE(NEW.cliente_nome_avulso, NEW.conta_contabil);
        ELSIF TG_TABLE_NAME = 'financial_expenses' THEN
            ent_name := NEW.descricao_pagamento;
        END IF;

        -- Registra campos novos (mascarando senhas)
        FOR key, new_val IN SELECT * FROM jsonb_each(to_jsonb(NEW)) LOOP
            IF key = ANY(sensitive_keys) AND new_val IS NOT NULL AND new_val::text <> 'null' THEN
                diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object('new', '****** [MODIFICADA / PROTEGIDA]'));
            ELSE
                diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object('new', new_val));
            END IF;
        END LOOP;

        INSERT INTO public.audit_logs (
            user_id, user_email, user_name, action, entity, entity_id, entity_name, changes
        ) VALUES (
            current_uid, cur_email, cur_name, 'INSERT', ent_type, ent_id, ent_name, diff_json
        );

        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        ent_id := NEW.id;
        
        IF TG_TABLE_NAME = 'clients' THEN
            ent_name := NEW.razao_social;
        ELSIF TG_TABLE_NAME = 'client_credentials' THEN
            ent_name := NEW.sistema_nome;
        ELSIF TG_TABLE_NAME = 'financial_entries' THEN
            ent_name := COALESCE(NEW.cliente_nome_avulso, NEW.conta_contabil);
        ELSIF TG_TABLE_NAME = 'financial_expenses' THEN
            ent_name := NEW.descricao_pagamento;
        END IF;

        -- Compara cada campo entre OLD e NEW
        FOR key, new_val IN SELECT * FROM jsonb_each(to_jsonb(NEW)) LOOP
            old_val := to_jsonb(OLD)->key;
            -- Se houve alteração de valor e não for campo irrelevante como updated_at
            IF old_val IS DISTINCT FROM new_val AND key NOT IN ('updated_at') THEN
                IF key = ANY(sensitive_keys) THEN
                    diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object(
                        'old', '****** [VALOR ANTERIOR PROTEGIDO]',
                        'new', '****** [VALOR ATUALIZADO PROTEGIDO]'
                    ));
                ELSE
                    diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object('old', old_val, 'new', new_val));
                END IF;
            END IF;
        END LOOP;

        -- Grava apenas se houve de fato alteração relevante
        IF diff_json <> '{}'::jsonb THEN
            INSERT INTO public.audit_logs (
                user_id, user_email, user_name, action, entity, entity_id, entity_name, changes
            ) VALUES (
                current_uid, cur_email, cur_name, 'UPDATE', ent_type, ent_id, ent_name, diff_json
            );
        END IF;

        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        ent_id := OLD.id;
        
        IF TG_TABLE_NAME = 'clients' THEN
            ent_name := OLD.razao_social;
        ELSIF TG_TABLE_NAME = 'client_credentials' THEN
            ent_name := OLD.sistema_nome;
        ELSIF TG_TABLE_NAME = 'financial_entries' THEN
            ent_name := COALESCE(OLD.cliente_nome_avulso, OLD.conta_contabil);
        ELSIF TG_TABLE_NAME = 'financial_expenses' THEN
            ent_name := OLD.descricao_pagamento;
        END IF;

        -- Registra valores que foram removidos (protegendo senhas)
        FOR key, old_val IN SELECT * FROM jsonb_each(to_jsonb(OLD)) LOOP
            IF key = ANY(sensitive_keys) AND old_val IS NOT NULL THEN
                diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object('old', '****** [REMOVIDA]'));
            ELSE
                diff_json := jsonb_set(diff_json, ARRAY[key], jsonb_build_object('old', old_val));
            END IF;
        END LOOP;

        INSERT INTO public.audit_logs (
            user_id, user_email, user_name, action, entity, entity_id, entity_name, changes
        ) VALUES (
            current_uid, cur_email, cur_name, 'DELETE', ent_type, ent_id, ent_name, diff_json
        );

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

-- 4. Criação dos Triggers nas tabelas sensíveis
DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_client_credentials ON public.client_credentials;
CREATE TRIGGER trg_audit_client_credentials
    AFTER INSERT OR UPDATE OR DELETE ON public.client_credentials
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_financial_entries ON public.financial_entries;
CREATE TRIGGER trg_audit_financial_entries
    AFTER INSERT OR UPDATE OR DELETE ON public.financial_entries
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_financial_expenses ON public.financial_expenses;
CREATE TRIGGER trg_audit_financial_expenses
    AFTER INSERT OR UPDATE OR DELETE ON public.financial_expenses
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
