-- ⛔ APAGA DADOS. NÃO FOI EXECUTADO. Rodar apenas com autorização expressa e DEPOIS de um backup.
--
-- Remove por completo as notificações no celular (migração 0017).
-- O que se perde: a lista de aparelhos em que as pessoas ativaram as notificações (push_inscricoes)
-- e o par de chaves de envio (push_chaves). Nenhum dado de paciente, atendimento ou financeiro é tocado.
-- Para usar de novo depois, cada pessoa só precisa ativar as notificações outra vez.
--
-- Alternativa SEM apagar nada (preferível): voltar o site e a API para a versão anterior.
-- As tabelas ficam paradas, sem uso, e nada é enviado.

begin;
drop function if exists public.push_chaves_obter();
drop function if exists public.push_chaves_criar(text, text);
drop table if exists public.push_chaves;
drop function if exists public.push_inscrever(text, text, text, boolean, boolean, text);
drop table if exists public.push_inscricoes;
commit;
