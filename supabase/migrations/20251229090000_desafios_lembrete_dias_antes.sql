do $$ begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'desafios'
      and column_name = 'lembrete_dias_antes'
  ) then
    alter table public.desafios
      add column lembrete_dias_antes integer[] not null default array[0, 1];
  end if;
end $$;

