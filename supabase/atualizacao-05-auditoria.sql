-- =====================================================================
-- Atualização 05 · Auditoria
-- Rode DEPOIS da atualizacao-04. Pode rodar mais de uma vez sem problema.
--
-- Tudo o que for criado, alterado ou excluído em qualquer tabela do sistema
-- fica registrado aqui: quem fez, quando, em qual empresa e o que mudou.
-- Ninguém (nem o administrador pelo sistema) consegue alterar ou apagar a auditoria.
-- Só administradores consultam.
-- =====================================================================

create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  em           timestamptz not null default now(),
  usuario      uuid,                 -- quem fez (equipe ou cliente do portal)
  email        text,
  tabela       text not null,        -- onde aconteceu (ou 'acao' para ações como entrar, abrir arquivo)
  acao         text not null,        -- criou / alterou / excluiu / ou o nome da ação
  registro_id  text,
  cliente_id   uuid,
  descricao    text,                 -- texto curto para a tela
  antes        jsonb,
  depois       jsonb
);
create index if not exists auditoria_em on public.auditoria (em desc);
create index if not exists auditoria_cli on public.auditoria (cliente_id, em desc);
create index if not exists auditoria_usu on public.auditoria (usuario, em desc);

-- função que grava cada mudança (roda com permissão própria; o usuário não grava direto)
create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_reg jsonb := coalesce(v_new, v_old);
  v_leve boolean := tg_table_name in ('notas','folha_itens','ponto_cartoes','cancelamentos','inutilizacoes','tarefas');
  v_desc text;
begin
  -- alteração que não mudou nada (só a data de atualização): não registra
  if tg_op = 'UPDATE' and (v_old - 'atualizado_em') = (v_new - 'atualizado_em') then return null; end if;
  v_desc := coalesce(v_reg->>'nome', v_reg->>'nome_arquivo', v_reg->>'razao_social', v_reg->>'titulo', v_reg->>'email', v_reg->>'tipo', v_reg->>'descricao');
  insert into public.auditoria (usuario, email, tabela, acao, registro_id, cliente_id, descricao, antes, depois)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    tg_table_name,
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
    coalesce(v_reg->>'id', v_reg->>'chave', v_reg->>'cliente_id', v_reg->>'data'),
    case when tg_table_name = 'clientes' then (v_reg->>'id')::uuid
         when v_reg ? 'cliente_id' and v_reg->>'cliente_id' ~ '^[0-9a-f-]{36}$' then (v_reg->>'cliente_id')::uuid end,
    left(v_desc, 200),
    -- tabelas com muitas linhas (notas, itens da folha...) guardam só o essencial
    case when v_leve then null else v_old end,
    case when v_leve then null else v_new end
  );
  return null;
end $$;

-- liga a auditoria em todas as tabelas do sistema (menos ela mesma e o histórico)
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename not in ('auditoria','historico') loop
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;

-- ações que não mudam dados (entrar, sair, abrir/baixar arquivo, preparar e-mail...): o sistema chama esta função
create or replace function public.registrar_acao(p_acao text, p_descricao text, p_cliente uuid default null, p_detalhe jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario, email, tabela, acao, cliente_id, descricao, depois)
  select auth.uid(), (select email from auth.users where id = auth.uid()), 'acao', left(p_acao, 80), p_cliente, left(p_descricao, 300), p_detalhe
  where auth.uid() is not null;
$$;
revoke all on function public.registrar_acao(text, text, uuid, jsonb) from public;
grant execute on function public.registrar_acao(text, text, uuid, jsonb) to authenticated;

-- permissões: só administradores leem; ninguém insere, altera ou apaga direto
alter table public.auditoria enable row level security;
drop policy if exists admin_le on public.auditoria;
create policy admin_le on public.auditoria for select to authenticated using (public.e_admin());
revoke insert, update, delete on public.auditoria from authenticated, anon;
