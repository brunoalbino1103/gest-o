-- =====================================================================
-- Atualização 04 · Portal do cliente
-- Rode DEPOIS da atualizacao-03. Pode rodar mais de uma vez sem problema.
--
-- Como funciona o acesso do cliente:
--   1) No sistema (Cadastros > Portal do cliente) cadastre o e-mail do cliente e a empresa dele.
--   2) No Supabase: Authentication > Users > Add user, com ESSE MESMO e-mail e uma senha.
--   3) O cliente entra no mesmo endereço do sistema e vê SÓ o portal da empresa dele.
-- Um e-mail cadastrado no portal NUNCA vira usuário da equipe.
-- =====================================================================

create table if not exists public.portal_acessos (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  nome           text,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  usuario_id     uuid unique references auth.users(id) on delete set null,
  ativo          boolean not null default true,
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists portal_acessos_email on public.portal_acessos (lower(email));

-- empresa do cliente logado (null para a equipe)
create or replace function public.cliente_do_portal() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from public.portal_acessos where usuario_id = auth.uid() and ativo limit 1;
$$;

-- novo usuário: se o e-mail é de um acesso do portal, liga ao portal e NÃO cria perfil da equipe
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.portal_acessos where lower(email) = lower(new.email)) then
    update public.portal_acessos set usuario_id = new.id where lower(email) = lower(new.email);
    return new;
  end if;
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

-- acesso cadastrado depois de o usuário já existir: liga na hora (só se não for alguém da equipe)
create or replace function public.ligar_acesso_portal() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.usuario_id is null then
    select u.id into new.usuario_id from auth.users u
     where lower(u.email) = lower(new.email) and not exists (select 1 from public.perfis p where p.id = u.id) limit 1;
  end if;
  return new;
end $$;
drop trigger if exists ao_gravar_acesso on public.portal_acessos;
create trigger ao_gravar_acesso before insert or update of email on public.portal_acessos
  for each row execute function public.ligar_acesso_portal();

-- documentos: o que o cliente vê, o que ele mandou e o protocolo (aberto / pago)
alter table public.documentos add column if not exists visivel_cliente boolean not null default false;
alter table public.documentos add column if not exists origem text not null default 'escritorio';
alter table public.documentos add column if not exists enviado_portal uuid references auth.users(id) on delete set null;
alter table public.documentos add column if not exists visto_em timestamptz;
alter table public.documentos add column if not exists pago_em timestamptz;

-- pedidos do cliente (admissão, rescisão, férias, alteração, outros)
create table if not exists public.solicitacoes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  tipo           text not null,
  titulo         text,
  dados          jsonb,
  status         text not null default 'nova' check (status in ('nova','andamento','concluida','recusada')),
  resposta       text,
  criado_por     uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists solicitacoes_cli on public.solicitacoes (cliente_id, status);

-- o cliente marca "abri" ou "paguei" sem poder mexer em mais nada do documento
create or replace function public.portal_marcar(doc uuid, campo text) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := public.cliente_do_portal();
begin
  if c is null then raise exception 'sem permissão'; end if;
  if campo = 'visto' then
    update public.documentos set visto_em = coalesce(visto_em, now()) where id = doc and cliente_id = c and visivel_cliente;
  elsif campo = 'pago' then
    update public.documentos set pago_em = now(), visto_em = coalesce(visto_em, now()) where id = doc and cliente_id = c and visivel_cliente;
  end if;
end $$;
revoke all on function public.portal_marcar(uuid, text) from public;
grant execute on function public.portal_marcar(uuid, text) to authenticated;

-- ---------- permissões (RLS) ----------
alter table public.portal_acessos enable row level security;
alter table public.solicitacoes enable row level security;

drop policy if exists equipe_tudo on public.portal_acessos;
drop policy if exists proprio_le on public.portal_acessos;
create policy equipe_tudo on public.portal_acessos for all to authenticated using (public.e_equipe()) with check (public.e_equipe());
create policy proprio_le on public.portal_acessos for select to authenticated using (usuario_id = auth.uid());

drop policy if exists equipe_tudo on public.solicitacoes;
drop policy if exists cliente_le on public.solicitacoes;
drop policy if exists cliente_cria on public.solicitacoes;
create policy equipe_tudo on public.solicitacoes for all to authenticated using (public.e_equipe()) with check (public.e_equipe());
create policy cliente_le on public.solicitacoes for select to authenticated using (cliente_id = public.cliente_do_portal());
create policy cliente_cria on public.solicitacoes for insert to authenticated
  with check (cliente_id = public.cliente_do_portal() and status = 'nova' and resposta is null);

-- o cliente lê a própria empresa e os colaboradores dela (para escolher nos pedidos)
drop policy if exists portal_le on public.clientes;
create policy portal_le on public.clientes for select to authenticated using (id = public.cliente_do_portal());
drop policy if exists portal_le on public.funcionarios;
create policy portal_le on public.funcionarios for select to authenticated using (cliente_id = public.cliente_do_portal());

-- documentos: vê os publicados para ele e os que ele mesmo mandou; envia só para a própria empresa
drop policy if exists portal_le on public.documentos;
drop policy if exists portal_envia on public.documentos;
create policy portal_le on public.documentos for select to authenticated
  using (cliente_id = public.cliente_do_portal() and (visivel_cliente or origem = 'cliente'));
create policy portal_envia on public.documentos for insert to authenticated
  with check (cliente_id = public.cliente_do_portal() and origem = 'cliente' and not visivel_cliente and enviado_por is null);

-- arquivos no Storage: mesma regra
drop policy if exists portal_le on storage.objects;
drop policy if exists portal_envia on storage.objects;
create policy portal_le on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and exists (select 1 from public.documentos d where d.caminho = name
         and d.cliente_id = public.cliente_do_portal() and (d.visivel_cliente or d.origem = 'cliente')));
create policy portal_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.cliente_do_portal() is not null
              and split_part(name, '/', 1) = public.cliente_do_portal()::text);
