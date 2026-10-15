-- Step 8 targeted repair: keep memo/announcement resource zones available.
-- Safe to run more than once. Does not delete or rewrite existing memo IDs/content.
alter table public.learning_notes
  add column if not exists resource_type text not null default 'memo';

update public.learning_notes
set resource_type = 'memo'
where resource_type is null;

alter table public.learning_notes
  alter column resource_type set default 'memo',
  alter column resource_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.learning_notes'::regclass
      and conname = 'learning_notes_resource_type_check'
  ) then
    alter table public.learning_notes
      add constraint learning_notes_resource_type_check
      check (resource_type in ('memo', 'announcement'));
  end if;
end
$$;

alter table public.learning_notes enable row level security;
revoke all on table public.learning_notes from anon, authenticated;
