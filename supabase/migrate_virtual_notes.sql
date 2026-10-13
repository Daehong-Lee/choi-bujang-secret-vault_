-- 2~3단계: 가상 메모를 학습용 테이블에 보관하고 로그인 사용자의 소유자 ID를 저장합니다.
-- 실제 비밀값이나 실제 학생 자료를 포함하지 않습니다.

create table if not exists public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  resource_type text not null default 'memo' check (resource_type in ('memo', 'announcement')),
  title text not null,
  body text not null
);

-- 기존 2단계 테이블을 3단계 API 계약(UUID id/body)에 맞춥니다.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'learning_notes'
      and column_name = 'content'
  ) then
    alter table public.learning_notes rename column content to body;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'learning_notes'
      and column_name = 'id'
      and data_type <> 'uuid'
  ) then
    alter table public.learning_notes alter column id drop identity if exists;
    alter table public.learning_notes alter column id drop default;
    alter table public.learning_notes alter column id type uuid using gen_random_uuid();
    alter table public.learning_notes alter column id set default gen_random_uuid();
  end if;
end
$$;


-- 8단계: 기존 메모는 그대로 메모로 유지하고, 공지와는 자원 유형으로 구분합니다.
-- 기존 주소와 UUID는 변경하지 않습니다.
alter table public.learning_notes
  add column if not exists resource_type text not null default 'memo';
update public.learning_notes set resource_type = 'memo' where resource_type is null;
alter table public.learning_notes
  alter column resource_type set default 'memo',
  alter column resource_type set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
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

-- 브라우저의 anon/authenticated 역할에는 직접 자료 권한을 주지 않습니다.
-- 서버 API만 SUPABASE_SECRET_KEY로 접근합니다.
revoke all on table public.learning_notes from anon, authenticated;

-- 기존 2단계의 가상 메모 네 건을 유지합니다.
insert into public.learning_notes (owner_id, title, body)
values
  (null, '과제', '실습용 가상 과제 기록'),
  (null, '포트폴리오', '실습용 가상 포트폴리오 기록'),
  (null, '아침 리추얼', '실습용 가상 리추얼 기록'),
  (null, '훈련 행정 자료', '실습용 가상 행정 기록');
