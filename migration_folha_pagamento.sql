-- ==============================================================================
-- MSCA - Migration: Folha de Pagamento como Módulo/Flag do Cliente
-- 1. Adiciona coluna folha_pagamento na tabela clients ('Sim' | 'Não')
-- 2. Atualiza clientes existentes que possuem rotina de Folha de Pagamento
-- 3. Assegura que regime_tributario seja estritamente 'Simples Nacional' ou 'Lucro Presumido'
-- ==============================================================================

-- 1. Adicionar coluna folha_pagamento com valor padrão 'Não'
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS folha_pagamento TEXT DEFAULT 'Não';

-- 2. Marcar folha_pagamento = 'Sim' para clientes que possuíam 'Folha de Pagamento' como tipo_servico ou regime
UPDATE public.clients
SET folha_pagamento = 'Sim'
WHERE (UPPER(COALESCE(tipo_servico, '')) LIKE '%FOLHA%' 
   OR UPPER(COALESCE(regime_tributario, '')) LIKE '%FOLHA%')
  AND (folha_pagamento IS NULL OR folha_pagamento = 'Não');

-- 3. Marcar folha_pagamento = 'Sim' para clientes que já possuem obrigações de folha cadastradas
UPDATE public.clients
SET folha_pagamento = 'Sim'
WHERE (obrigacoes_habilitadas::text ILIKE '%CALCULO FOPAG%'
    OR obrigacoes_habilitadas::text ILIKE '%GUIA FGTS%'
    OR obrigacoes_habilitadas::text ILIKE '%ADIANTAMENTO%'
    OR obrigacoes_habilitadas::text ILIKE '%RECIBO VALE TRANSPORTE%'
    OR obrigacoes_habilitadas::text ILIKE '%RECIBO CESTA BÁSICA%')
  AND (folha_pagamento IS NULL OR folha_pagamento = 'Não');

-- 4. Marcar folha_pagamento = 'Sim' para os clientes oficiais do escopo de Folha de Pagamento
UPDATE public.clients
SET folha_pagamento = 'Sim'
WHERE id IN (
  'fc21dd64-b4e3-4e55-be8a-6d577bddc5ae',
  '2f52014c-e523-4687-aa75-28dd6e44a7f7',
  '817d7e5c-60d7-473c-8dd9-d3de659586ad',
  '2b3eefa6-102e-484d-8047-74c6235e4de1',
  'e9892b5b-d88f-4e18-b08c-0aa2fee80da3',
  '2f3de94d-799a-41e3-9367-d903d40d45fb',
  'b4acb3e4-0380-4aa3-9ac1-a415294f66a8'
);

-- 5. Normalizar regime_tributario e tipo_servico de clientes que estavam salvos como 'Folha de Pagamento'
-- Caso seja BIO LIFE SURGICAL ou similar, definir para 'Simples Nacional'
UPDATE public.clients
SET regime_tributario = 'Simples Nacional',
    tipo_servico = 'Simples Nacional'
WHERE UPPER(COALESCE(regime_tributario, '')) LIKE '%FOLHA%';

UPDATE public.clients
SET tipo_servico = regime_tributario
WHERE UPPER(COALESCE(tipo_servico, '')) LIKE '%FOLHA%'
  AND regime_tributario IS NOT NULL;

