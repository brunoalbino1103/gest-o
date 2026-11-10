-- =====================================================================
--  Atualização 03 · Departamento Pessoal completo
--  (ficha do colaborador, histórico, eventos, SST, rubricas para exportar o ponto)
--  Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run (se pedir, "Run and enable RLS")
-- =====================================================================

-- ficha completa do colaborador
alter table public.funcionarios add column if not exists rg               text;
alter table public.funcionarios add column if not exists pis              text;
alter table public.funcionarios add column if not exists ctps             text;
alter table public.funcionarios add column if not exists data_nascimento  date;
alter table public.funcionarios add column if not exists sexo             text;
alter table public.funcionarios add column if not exists estado_civil     text;
alter table public.funcionarios add column if not exists escolaridade     text;
alter table public.funcionarios add column if not exists endereco         text;
alter table public.funcionarios add column if not exists cidade           text;
alter table public.funcionarios add column if not exists uf               text;
alter table public.funcionarios add column if not exists cep              text;
alter table public.funcionarios add column if not exists telefone         text;
alter table public.funcionarios add column if not exists email            text;
alter table public.funcionarios add column if not exists banco            text;
alter table public.funcionarios add column if not exists agencia          text;
alter table public.funcionarios add column if not exists conta            text;
alter table public.funcionarios add column if not exists pix              text;
alter table public.funcionarios add column if not exists tipo_contrato    text;   -- indeterminado, experiencia, temporario, aprendiz, estagio, intermitente
alter table public.funcionarios add column if not exists jornada          text;   -- ex.: 44h semanais
alter table public.funcionarios add column if not exists horario          text;   -- ex.: seg a sex 08:00-17:00
alter table public.funcionarios add column if not exists dependentes      jsonb;  -- [{nome, parentesco, nascimento, cpf, ir, salario_familia}]

-- histórico do colaborador (admissão, reajustes, cargo, férias, afastamentos, advertências, ASO, desligamento...)
create table if not exists public.funcionario_eventos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete cascade,
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  data            date not null,
  tipo            text not null,
  descricao       text,
  valor           numeric(14,2),
  vencimento      date,                 -- ex.: próximo ASO, fim do afastamento
  detalhe         jsonb,
  documento_id    uuid references public.documentos(id) on delete set null,
  criado_por      uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now()
);
create index if not exists funcionario_eventos_func on public.funcionario_eventos (funcionario_id, data);

-- documentos da empresa com validade (PGR, PCMSO, LTCAT, convenção, alvarás...)
create table if not exists public.empresa_documentos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  tipo           text not null,
  descricao      text,
  emissao        date,
  validade       date,
  responsavel    text,
  documento_id   uuid references public.documentos(id) on delete set null,
  atualizado_em  timestamptz not null default now()
);

-- rubricas do Domínio por empresa (para exportar o ponto e lançamentos para a folha)
alter table public.dp_empresas add column if not exists rubricas jsonb;

do $$
declare t text;
begin
  foreach t in array array['funcionario_eventos','empresa_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists equipe_le on public.%I', t);
    execute format('drop policy if exists equipe_insere on public.%I', t);
    execute format('drop policy if exists equipe_altera on public.%I', t);
    execute format('drop policy if exists equipe_apaga on public.%I', t);
    execute format('create policy equipe_le on public.%I for select to authenticated using (public.e_equipe())', t);
    execute format('create policy equipe_insere on public.%I for insert to authenticated with check (public.e_equipe())', t);
    execute format('create policy equipe_altera on public.%I for update to authenticated using (public.e_equipe()) with check (public.e_equipe())', t);
    execute format('create policy equipe_apaga on public.%I for delete to authenticated using (public.e_equipe())', t);
  end loop;
end $$;

-- deduções do INSS no resumo da folha (para conferir o DARF)
alter table public.folha_resumos add column if not exists sal_familia     numeric(14,2);
alter table public.folha_resumos add column if not exists sal_maternidade numeric(14,2);

-- parâmetros gerais (tabelas de INSS/IRRF do ano, etc.)
create table if not exists public.parametros (
  chave          text primary key,
  valor          jsonb,
  atualizado_em  timestamptz not null default now()
);
alter table public.parametros enable row level security;
drop policy if exists equipe_le on public.parametros;
drop policy if exists admin_grava on public.parametros;
create policy equipe_le on public.parametros for select to authenticated using (public.e_equipe());
create policy admin_grava on public.parametros for all to authenticated using (public.e_admin()) with check (public.e_admin());
