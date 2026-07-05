-- Tabela dedicada para lembretes de reunião (AceleraGO /diagnostico).
-- Isolada do schema do CRM. Só a service key (backend) acessa; RLS bloqueia o resto.
-- Rode este SQL no painel do Supabase (SQL Editor) do projeto da AceleraGO.

create table if not exists public.agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text,
  telefone             text not null,
  reuniao_at           timestamptz not null,
  calendly_event_uri   text,
  lembrete_2h_enviado  boolean not null default false,
  lembrete_2h_em       timestamptz,
  criado_em            timestamptz not null default now()
);

-- Índice para o verificador achar rápido as reuniões que ainda não receberam lembrete.
create index if not exists idx_agendamentos_pendentes
  on public.agendamentos (reuniao_at)
  where lembrete_2h_enviado = false;

-- Segurança: habilita RLS sem policies públicas.
-- A service key usada pelo backend ignora RLS; qualquer acesso anônimo fica bloqueado.
alter table public.agendamentos enable row level security;
