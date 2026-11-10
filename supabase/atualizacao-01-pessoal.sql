-- =====================================================================
--  Atualização 01 · Departamento Pessoal (porte, atividade, convenção coletiva)
--  Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run
--  Pode rodar de novo sem problema.
-- =====================================================================

alter table public.clientes add column if not exists porte     text;   -- mei, me, epp, demais
alter table public.clientes add column if not exists atividade text;   -- comercio, servico, industria, misto, rural, outro
alter table public.clientes add column if not exists codigo    text;   -- código da empresa no sistema da folha (ex.: 242)

-- Cadastro de cada empresa no DP: convenção coletiva e regras do dia a dia
create table if not exists public.dp_empresas (
  cliente_id                 uuid primary key references public.clientes(id) on delete cascade,
  sindicato                  text,
  cct_registro               text,
  cct_vigencia_ini           date,
  cct_vigencia_fim           date,
  data_base_mes              int check (data_base_mes between 1 and 12),
  piso_salarial              numeric(12,2),
  contribuicao_assistencial  text,
  jornada_semanal            numeric(5,2),
  horario_padrao             text,
  he_dia_util                numeric(5,2),
  he_domingo                 numeric(5,2),
  adicional_noturno          numeric(5,2),
  vr_dia                     numeric(10,2),
  vt_dia                     numeric(10,2),
  observacoes                text,
  atualizado_em              timestamptz not null default now()
);

alter table public.dp_empresas enable row level security;
drop policy if exists equipe_le on public.dp_empresas;
drop policy if exists equipe_insere on public.dp_empresas;
drop policy if exists equipe_altera on public.dp_empresas;
drop policy if exists admin_apaga on public.dp_empresas;
create policy equipe_le on public.dp_empresas for select to authenticated using (public.e_equipe());
create policy equipe_insere on public.dp_empresas for insert to authenticated with check (public.e_equipe());
create policy equipe_altera on public.dp_empresas for update to authenticated using (public.e_equipe()) with check (public.e_equipe());
create policy admin_apaga on public.dp_empresas for delete to authenticated using (public.e_admin());
