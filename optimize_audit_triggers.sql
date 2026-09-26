-- ==============================================================================
-- MSCA - Otimização de Logs de Auditoria para Lançamentos Financeiros em Lote
-- Execute este script no SQL Editor do Supabase para unificar logs e evitar sobrecarga
-- ==============================================================================

-- 1. Triggers nas tabelas de Clientes e Credenciais continuam registrando INSERT, UPDATE e DELETE
-- (Mantém integridade absoluta das alterações de clientes e senhas)
DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_client_credentials ON public.client_credentials;
CREATE TRIGGER trg_audit_client_credentials
    AFTER INSERT OR UPDATE OR DELETE ON public.client_credentials
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- 2. Nas tabelas financeiras, o trigger do PostgreSQL passa a monitorar apenas UPDATE e DELETE
-- O INSERT individual ou em lote (recorrência) agora é registrado de forma consolidada e inteligente
-- pelo sistema (1 único registro para as N parcelas com valor total, competências e detalhes),
-- evitando gerar dezenas de linhas desnecessárias no banco de dados.
DROP TRIGGER IF EXISTS trg_audit_financial_entries ON public.financial_entries;
CREATE TRIGGER trg_audit_financial_entries
    AFTER UPDATE OR DELETE ON public.financial_entries
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_financial_expenses ON public.financial_expenses;
CREATE TRIGGER trg_audit_financial_expenses
    AFTER UPDATE OR DELETE ON public.financial_expenses
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
