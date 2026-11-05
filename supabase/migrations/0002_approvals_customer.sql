alter table public.approvals add column customer_id uuid references public.customers(id) on delete cascade;
alter table public.approvals add column kind text not null default 'whatsapp_reply' check (kind in ('whatsapp_reply','whatsapp_outreach','action'));
revoke execute on function public.my_company_id() from anon;
