-- Private Gemini assistant conversations. Users can read and delete only their own.

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_conversations_owner_idx
  on public.assistant_conversations (profile_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy assistant_conversations_select on public.assistant_conversations
  for select to authenticated
  using (profile_id = auth.uid() and institution_id = public.my_institution());

create policy assistant_conversations_delete on public.assistant_conversations
  for delete to authenticated
  using (profile_id = auth.uid() and institution_id = public.my_institution());

create policy assistant_messages_select on public.assistant_messages
  for select to authenticated
  using (profile_id = auth.uid() and institution_id = public.my_institution());

grant select, delete on public.assistant_conversations to authenticated;
grant select on public.assistant_messages to authenticated;
