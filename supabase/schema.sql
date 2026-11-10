-- =====================================================================
--  Sistema Contábil · estrutura do banco (Supabase / PostgreSQL)
--  Rode este arquivo inteiro uma vez no Supabase: SQL Editor > New query > Run
--  Pode rodar de novo sem perder dados (usa "if not exists" / "or replace").
--  As obrigações sugeridas são carregadas pelo próprio sistema no primeiro acesso do administrador.
-- =====================================================================

-- ---------- Equipe ----------
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null default '',
  email         text,
  departamento  text not null default 'geral'
                check (departamento in ('admin','fiscal','dp','contabil','geral')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário é convidado/criado no Supabase
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

create or replace function public.e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and departamento = 'admin');
$$;

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  razao_social          text not null,
  nome_fantasia         text,
  cnpj                  text unique,              -- só dígitos (14) ou CPF (11)
  regime                text not null default 'simples'
                        check (regime in ('mei','simples','presumido','real')),
  uf                    text,
  municipio             text,
  inscricao_estadual    text,
  inscricao_municipal   text,
  email                 text,
  email_dp              text,
  email_financeiro      text,
  telefone              text,
  tem_funcionarios      boolean not null default false,
  porte                 text,                     -- mei, me, epp, demais
  atividade             text,                     -- comercio, servico, industria, misto, rural, outro
  codigo                text,                     -- código no sistema da folha
  resp_fiscal          uuid references public.perfis(id) on delete set null,
  resp_dp               uuid references public.perfis(id) on delete set null,
  resp_contabil         uuid references public.perfis(id) on delete set null,
  observacoes           text,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now()
);

-- ---------- Obrigações (modelos que geram as tarefas) ----------
create table if not exists public.obrigacoes (
  id                  uuid primary key default gen_random_uuid(),
  departamento        text not null check (departamento in ('fiscal','dp','contabil')),
  nome                text not null,
  periodicidade       text not null default 'mensal' check (periodicidade in ('mensal','trimestral','anual')),
  mes_ref             int check (mes_ref between 1 and 12),        -- anual: competência em que aparece
  meses_depois        int not null default 1 check (meses_depois between 0 and 12),
  tipo_dia            text not null default 'corrido' check (tipo_dia in ('corrido','util','ultimo_util')),
  dia_vencimento      int  not null default 20 check (dia_vencimento between 1 and 31),
  ajuste              text not null default 'nenhum' check (ajuste in ('antecipa','prorroga','nenhum')),
  regimes             text[] not null default array['mei','simples','presumido','real'],
  exige_funcionarios  boolean not null default false,
  ordem               int not null default 100,
  ativo               boolean not null default true
);

-- ---------- Feriados extras (municipais/estaduais). Os nacionais são calculados pelo sistema. ----------
create table if not exists public.feriados (
  data  date primary key,
  nome  text not null
);

-- ---------- Tarefas do mês (uma por cliente x obrigação x competência) ----------
create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  obrigacao_id   uuid references public.obrigacoes(id) on delete set null,
  departamento   text not null check (departamento in ('fiscal','dp','contabil')),
  competencia    text not null check (competencia ~ '^\d{4}-\d{2}$'),   -- 2026-11
  titulo         text not null,
  vencimento     date,
  status         text not null default 'pendente'
                 check (status in ('pendente','andamento','concluida','nao_aplica')),
  responsavel    uuid references public.perfis(id) on delete set null,
  observacao     text,
  concluida_em   timestamptz,
  concluida_por  uuid references public.perfis(id) on delete set null,
  criado_em      timestamptz not null default now(),
  unique (cliente_id, obrigacao_id, competencia)
);
create index if not exists tarefas_comp on public.tarefas (competencia, departamento);

-- ---------- Documentos (arquivos no Storage) ----------
create table if not exists public.documentos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references public.clientes(id) on delete set null,
  departamento   text check (departamento in ('fiscal','dp','contabil')),
  competencia    text check (competencia ~ '^\d{4}-\d{2}$'),
  tipo           text not null default 'outro',
  nome_arquivo   text not null,
  caminho        text not null unique,             -- caminho no bucket "documentos"
  tamanho        bigint,
  mime           text,
  dados          jsonb,                            -- o que foi lido do arquivo (XML etc.)
  enviado_por    uuid references public.perfis(id) on delete set null,
  enviado_em     timestamptz not null default now()
);
create index if not exists documentos_cli on public.documentos (cliente_id, competencia);
create index if not exists documentos_comp on public.documentos (competencia, departamento);

-- ---------- Notas fiscais lidas dos XML (mesmos campos do Painel Fiscal) ----------
create table if not exists public.notas (
  id                    uuid primary key default gen_random_uuid(),
  documento_id          uuid references public.documentos(id) on delete cascade,
  cliente_id            uuid not null references public.clientes(id) on delete cascade,
  competencia           text,
  data                  date,                 -- emissão
  numero                text,
  serie                 text,
  chave                 text,
  categoria             text,                 -- Venda, Devolução, Compra, CT-e (Frete), Remessa...
  tipo_documento        text,                 -- NF-e, NFC-e, NFS-e, CT-e
  sentido               text check (sentido in ('saida','entrada')),
  emitente_proprio      boolean,
  finalidade            text,
  destinatario          text,                 -- a outra parte da nota
  doc_destinatario      text,
  uf_destino            text,
  produto               text,
  cfop                  text,
  ncm                   text,
  aliquota_icms         text,
  valor_frete           numeric(14,2) default 0,
  valor_icms            numeric(14,2) default 0,
  valor_ipi             numeric(14,2) default 0,
  valor_pis             numeric(14,2) default 0,
  valor_cofins          numeric(14,2) default 0,
  valor_ibs             numeric(14,2) default 0,
  valor_cbs             numeric(14,2) default 0,
  valor_difal           numeric(14,2) default 0,
  valor_fcp_difal       numeric(14,2) default 0,
  valor_total_tributos  numeric(14,2) default 0,
  valor_nf              numeric(14,2) default 0,
  iss                   numeric(14,2) default 0,
  cancelada             boolean not null default false,
  difal_pago            boolean not null default false,
  difal_data_pagamento  date,
  difal_comprovante     uuid references public.documentos(id) on delete set null,
  difal_juros           numeric(14,2) default 0,
  difal_multa           numeric(14,2) default 0,
  criado_em             timestamptz not null default now(),
  unique (cliente_id, chave)
);
create index if not exists notas_cli on public.notas (cliente_id, competencia);
create index if not exists notas_comp on public.notas (competencia);

-- Eventos de cancelamento (podem chegar antes ou depois da nota)
create table if not exists public.cancelamentos (
  chave         text primary key,
  data          date,
  motivo        text,
  documento_id  uuid references public.documentos(id) on delete set null,
  criado_em     timestamptz not null default now()
);

-- Inutilizações de numeração (explicam os "buracos" na aba Notas Faltando)
create table if not exists public.inutilizacoes (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  modelo        text,
  serie         text not null,
  n_ini         int not null,
  n_fin         int not null,
  data          date,
  competencia   text,
  motivo        text,
  documento_id  uuid references public.documentos(id) on delete set null,
  unique (cliente_id, modelo, serie, n_ini, n_fin)
);

-- ---------- Departamento Pessoal ----------
create table if not exists public.funcionarios (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  nome           text not null,
  cpf            text,
  cargo          text,
  admissao       date,
  salario        numeric(12,2),
  situacao       text not null default 'ativo' check (situacao in ('ativo','afastado','desligado')),
  desligamento   date,
  exp_dias_1     int,          -- contrato de experiência: 1º período (ex.: 45). Vazio = sem experiência
  exp_dias_total int,          -- total (ex.: 90)
  ferias_ate     date,         -- férias quitadas até: fim do último período aquisitivo já gozado
  codigo         text,         -- código do funcionário no sistema da folha
  setor          text,
  observacoes    text,
  criado_em      timestamptz not null default now()
);
create index if not exists funcionarios_cli on public.funcionarios (cliente_id);

-- Férias marcadas (mesmo formato das marcações do painel de Férias)
create table if not exists public.ferias_marcacoes (
  id              text primary key,
  cliente_id      uuid references public.clientes(id) on delete cascade,
  funcionario_id  uuid references public.funcionarios(id) on delete cascade,
  inicio          date,
  dias            int,
  abono           int default 0,
  obs             text,
  substitui       text,
  oculta          text,
  atualizado_por  uuid references public.perfis(id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

-- Faltas sem justificativa (reduzem os dias de férias pelo art. 130 da CLT)
create table if not exists public.faltas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete cascade,
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  data            date not null,
  quantidade      int not null default 1,
  fonte           text,
  criado_em       timestamptz not null default now()
);

create table if not exists public.movimentacoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  funcionario_id  uuid references public.funcionarios(id) on delete set null,
  tipo            text not null check (tipo in ('admissao','rescisao','ferias','afastamento','alteracao')),
  nome            text,                    -- nome do funcionário (cópia, para o histórico)
  data_evento     date,                    -- admissão, último dia trabalhado, início das férias...
  prazo           date,
  status          text not null default 'pendente' check (status in ('pendente','andamento','concluida','cancelada')),
  detalhe         jsonb,
  observacao      text,
  criado_por      uuid references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  concluida_em    timestamptz
);
create index if not exists movimentacoes_cli on public.movimentacoes (cliente_id, status);

-- ---------- Histórico ----------
create table if not exists public.historico (
  id          bigint generated always as identity primary key,
  usuario     uuid references public.perfis(id) on delete set null,
  acao        text not null,
  detalhe     text,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  em          timestamptz not null default now()
);

-- ---------- Segurança: só a equipe cadastrada lê e grava; só admin apaga ----------
do $$
declare t text;
begin
  foreach t in array array['perfis','clientes','obrigacoes','feriados','tarefas','documentos','notas','cancelamentos','inutilizacoes','funcionarios','ferias_marcacoes','faltas','movimentacoes','historico'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['clientes','obrigacoes','feriados','tarefas','documentos','notas','cancelamentos','inutilizacoes','funcionarios','ferias_marcacoes','faltas','movimentacoes','historico'] loop
    execute format('drop policy if exists equipe_le on public.%I', t);
    execute format('drop policy if exists equipe_insere on public.%I', t);
    execute format('drop policy if exists equipe_altera on public.%I', t);
    execute format('drop policy if exists admin_apaga on public.%I', t);
    execute format('create policy equipe_le on public.%I for select to authenticated using (public.e_equipe())', t);
    execute format('create policy equipe_insere on public.%I for insert to authenticated with check (public.e_equipe())', t);
    execute format('create policy equipe_altera on public.%I for update to authenticated using (public.e_equipe()) with check (public.e_equipe())', t);
    execute format('create policy admin_apaga on public.%I for delete to authenticated using (public.e_admin())', t);
  end loop;
end $$;

-- quem enviou um documento pode apagá-lo (desfazer importação errada); movimentações podem ser apagadas por quem criou
drop policy if exists autor_apaga on public.documentos;
create policy autor_apaga on public.documentos for delete to authenticated
  using (public.e_equipe() and enviado_por = auth.uid());
drop policy if exists autor_apaga on public.notas;
create policy autor_apaga on public.notas for delete to authenticated
  using (public.e_equipe() and exists (select 1 from public.documentos d where d.id = documento_id and d.enviado_por = auth.uid()));
-- marcações de férias e faltas: qualquer pessoa da equipe pode desfazer
drop policy if exists equipe_apaga on public.ferias_marcacoes;
create policy equipe_apaga on public.ferias_marcacoes for delete to authenticated using (public.e_equipe());
drop policy if exists equipe_apaga on public.faltas;
create policy equipe_apaga on public.faltas for delete to authenticated using (public.e_equipe());
drop policy if exists autor_apaga on public.movimentacoes;
create policy autor_apaga on public.movimentacoes for delete to authenticated
  using (public.e_equipe() and criado_por = auth.uid());

drop policy if exists perfis_le on public.perfis;
drop policy if exists perfis_admin on public.perfis;
drop policy if exists perfis_proprio on public.perfis;
create policy perfis_le on public.perfis for select to authenticated using (public.e_equipe() or id = auth.uid());
create policy perfis_admin on public.perfis for all to authenticated using (public.e_admin()) with check (public.e_admin());
create policy perfis_proprio on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and departamento = (select departamento from public.perfis where id = auth.uid()));

-- ---------- Armazenamento dos arquivos (bucket privado) ----------
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists docs_le on storage.objects;
drop policy if exists docs_envia on storage.objects;
drop policy if exists docs_apaga on storage.objects;
create policy docs_le on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_equipe());
create policy docs_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.e_equipe());
create policy docs_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.e_equipe() and (owner = auth.uid() or public.e_admin()));

-- ---------- Departamento Pessoal: cadastro da empresa (convenção coletiva) ----------
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
