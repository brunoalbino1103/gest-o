-- =====================================================================
--  Atualização 02 · Importação automática (o que é lido de dentro dos arquivos)
--  Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run (se pedir, "Run and enable RLS")
--  Pode rodar de novo sem problema.
-- =====================================================================

-- colaboradores: mais dados vindos da folha
alter table public.funcionarios add column if not exists cbo          text;
alter table public.funcionarios add column if not exists vinculo      text;
alter table public.funcionarios add column if not exists horas_mes    numeric(6,2);
alter table public.funcionarios add column if not exists contribuinte boolean not null default false;   -- pró-labore / sócio

-- períodos de férias lidos da Programação de Férias (valem mais que o cálculo pela admissão)
create table if not exists public.ferias_periodos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete cascade,
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  inicio          date not null,
  fim             date,
  dias_direito    numeric(5,2),
  dias_gozados    numeric(5,2),
  dias_restantes  numeric(5,2),
  limite          date,
  faltas          numeric(5,2),
  data_base       date,
  documento_id    uuid references public.documentos(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  unique (funcionario_id, inicio)
);

-- totais da folha do mês (Resumo da folha)
create table if not exists public.folha_resumos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  competencia    text not null,
  proventos      numeric(14,2), descontos numeric(14,2), liquido numeric(14,2),
  fgts           numeric(14,2), inss numeric(14,2), irrf numeric(14,2),
  empregados     int, contribuintes int, admissoes int, demitidos int,
  rubricas       jsonb,
  documento_id   uuid references public.documentos(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (cliente_id, competencia)
);

-- folha de cada colaborador no mês (Extrato mensal, Holerites, Líquidos)
create table if not exists public.folha_itens (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  competencia     text not null,
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  salario         numeric(12,2), proventos numeric(12,2), descontos numeric(12,2), liquido numeric(12,2), fgts numeric(12,2),
  eventos         jsonb,
  documento_id    uuid references public.documentos(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  unique (cliente_id, competencia, funcionario_id)
);

-- guias lidas (FGTS, DARF, DAS, sindical): valor e vencimento
create table if not exists public.guias (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  tipo           text not null,
  competencia    text not null,
  vencimento     date,
  valor          numeric(14,2),
  numero         text,
  detalhe        jsonb,
  pago           boolean not null default false,
  documento_id   uuid references public.documentos(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (cliente_id, tipo, competencia)
);

-- cartões de ponto lidos (batidas de cada dia), base do painel de Ponto
create table if not exists public.ponto_cartoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  competencia     text,
  periodo_ini     date not null,
  periodo_fim     date,
  dias            jsonb,
  documento_id    uuid references public.documentos(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  unique (funcionario_id, periodo_ini)
);

do $$
declare t text;
begin
  foreach t in array array['ferias_periodos','folha_resumos','folha_itens','guias','ponto_cartoes'] loop
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
