-- Estoque da clínica: materiais e medicamentos (luvas, seringas, remédios, limpeza…), com quantidade
-- mínima, validade e histórico de entradas e saídas.
--
-- Quem faz o quê:
--  * toda a equipe vê o estoque e registra entradas (chegou) e saídas (usou);
--  * dono e recepção cadastram, editam, arquivam itens e fazem a conferência (ajuste do total contado);
--  * a quantidade só muda por estoque_movimentar(), que grava cada mudança no histórico;
--  * ninguém apaga itens nem o histórico pelo site (item sai da lista ao ser arquivado).

create table if not exists public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  categoria text check (char_length(coalesce(categoria, '')) <= 60),
  unidade text not null default 'un' check (char_length(btrim(unidade)) between 1 and 20),
  quantidade numeric(12, 2) not null default 0 check (quantidade >= 0 and quantidade < 100000000),
  minimo numeric(12, 2) not null default 0 check (minimo >= 0 and minimo < 100000000),
  validade date,
  custo_unitario numeric(12, 2) check (custo_unitario is null or (custo_unitario >= 0 and custo_unitario < 1000000000)),
  fornecedor text check (char_length(coalesce(fornecedor, '')) <= 120),
  observacoes text check (char_length(coalesce(observacoes, '')) <= 1000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists estoque_itens_company on public.estoque_itens(company_id, ativo);
-- Dois itens ativos com o mesmo nome na mesma clínica confundem a contagem
create unique index if not exists estoque_itens_nome_unico on public.estoque_itens(company_id, lower(btrim(nome))) where ativo;

create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null references public.estoque_itens(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  -- entrada/saída: quanto entrou ou saiu; ajuste: o total contado na conferência
  quantidade numeric(12, 2) not null check (quantidade >= 0 and quantidade < 100000000),
  saldo numeric(12, 2) not null check (saldo >= 0),
  motivo text check (char_length(coalesce(motivo, '')) <= 300),
  validade date,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists estoque_movimentos_item on public.estoque_movimentos(item_id, criado_em desc);
create index if not exists estoque_movimentos_company on public.estoque_movimentos(company_id, criado_em desc);

-- Permissões: leitura para a equipe; itens com colunas liberadas (a quantidade fica de fora);
-- histórico só pela função.
alter table public.estoque_itens enable row level security;
alter table public.estoque_movimentos enable row level security;
revoke all on public.estoque_itens, public.estoque_movimentos from anon, authenticated;
grant select on public.estoque_itens, public.estoque_movimentos to authenticated;
grant insert (company_id, nome, categoria, unidade, minimo, validade, custo_unitario, fornecedor, observacoes)
  on public.estoque_itens to authenticated;
grant update (nome, categoria, unidade, minimo, validade, custo_unitario, fornecedor, observacoes, ativo, atualizado_em)
  on public.estoque_itens to authenticated;

create policy "equipe ve o estoque" on public.estoque_itens for select to authenticated
  using (company_id = (select public.my_company_id()));
create policy "dono e recepcao cadastram itens" on public.estoque_itens for insert to authenticated
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));
create policy "dono e recepcao editam itens" on public.estoque_itens for update to authenticated
  using (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'))
  with check (company_id = (select public.my_company_id()) and (select public.meu_papel()) in ('dono', 'recepcao'));
create policy "equipe ve o historico do estoque" on public.estoque_movimentos for select to authenticated
  using (company_id = (select public.my_company_id()));

-- Entrada, saída ou conferência. Atualiza a quantidade e grava o histórico na mesma operação.
create or replace function public.estoque_movimentar(
  p_item uuid, p_tipo text, p_quantidade numeric, p_motivo text default null, p_validade date default null
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := public.my_company_id();
  v_papel text := public.meu_papel();
  v_item public.estoque_itens%rowtype;
  v_novo numeric(12, 2);
  v_qtd numeric(12, 2) := round(p_quantidade, 2);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_company is null or auth.uid() is null then
    raise exception 'Sem acesso a este estoque.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimento inválido.' using errcode = '22023';
  end if;
  if p_tipo = 'ajuste' and v_papel not in ('dono', 'recepcao') then
    raise exception 'Só o dono e a recepção fazem a conferência do estoque.' using errcode = '42501';
  end if;
  if v_qtd is null or v_qtd < 0 or v_qtd >= 100000000 then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;
  if p_tipo <> 'ajuste' and v_qtd = 0 then
    raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_motivo, '')) > 300 then
    raise exception 'Motivo muito longo (máximo de 300 caracteres).' using errcode = '22023';
  end if;

  select * into v_item from public.estoque_itens where id = p_item and company_id = v_company for update;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;
  if not v_item.ativo then
    raise exception 'Este item está arquivado. Reative-o para movimentar.' using errcode = '22023';
  end if;

  v_novo := case p_tipo
    when 'entrada' then v_item.quantidade + v_qtd
    when 'saida' then v_item.quantidade - v_qtd
    else v_qtd
  end;
  if v_novo < 0 then
    raise exception 'Saída maior que o estoque: há só % %.',
      replace(trim_scale(v_item.quantidade)::text, '.', ','), v_item.unidade using errcode = '23514';
  end if;
  if v_novo >= 100000000 then
    raise exception 'Quantidade muito alta.' using errcode = '22023';
  end if;

  update public.estoque_itens set
    quantidade = v_novo,
    -- Validade do que chegou: se o estoque estava zerado, vale a nova; senão, fica a mais próxima
    validade = case
      when p_tipo = 'entrada' and p_validade is not null then
        case when v_item.quantidade = 0 or v_item.validade is null then p_validade else least(v_item.validade, p_validade) end
      else v_item.validade
    end,
    atualizado_em = now()
  where id = v_item.id;

  insert into public.estoque_movimentos (company_id, item_id, tipo, quantidade, saldo, motivo, validade, criado_por)
  values (v_company, v_item.id, p_tipo, v_qtd, v_novo, v_motivo, case when p_tipo = 'entrada' then p_validade end, auth.uid());

  return v_novo;
end $$;
revoke execute on function public.estoque_movimentar(uuid, text, numeric, text, date) from public, anon;
grant execute on function public.estoque_movimentar(uuid, text, numeric, text, date) to authenticated;
