-- ⛔ APAGA DADOS. NÃO FOI EXECUTADO. Rodar apenas com autorização expressa e DEPOIS de um backup.
--
-- Remove por completo o módulo Estoque (migração 0016).
-- O que se perde: TODOS os itens de estoque e o histórico de entradas e saídas cadastrados pelas clínicas.
-- Nenhum dado de paciente, atendimento ou financeiro é tocado.
--
-- Alternativa SEM apagar nada (preferível): voltar o site para a versão anterior.
-- O menu Estoque some, e os dados ficam guardados no banco, sem uso.

begin;
drop function if exists public.estoque_movimentar(uuid, text, numeric, text, date);
drop table if exists public.estoque_movimentos;
drop table if exists public.estoque_itens;
commit;
