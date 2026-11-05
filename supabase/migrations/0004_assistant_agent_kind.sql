alter table public.assistant_messages add column agent_kind text check (agent_kind in ('marketing','sales','finance','crm','support'));
create index assistant_messages_company_agent on public.assistant_messages(company_id, agent_kind, created_at);
