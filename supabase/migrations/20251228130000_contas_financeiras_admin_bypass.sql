alter table public.contas_financeiras enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contas_financeiras'
      and policyname = 'contas_financeiras_select_admin'
  ) then
    create policy "contas_financeiras_select_admin"
    on public.contas_financeiras
    for select
    to authenticated
    using (public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contas_financeiras'
      and policyname = 'contas_financeiras_insert_admin'
  ) then
    create policy "contas_financeiras_insert_admin"
    on public.contas_financeiras
    for insert
    to authenticated
    with check (public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contas_financeiras'
      and policyname = 'contas_financeiras_update_admin'
  ) then
    create policy "contas_financeiras_update_admin"
    on public.contas_financeiras
    for update
    to authenticated
    using (public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contas_financeiras'
      and policyname = 'contas_financeiras_delete_admin'
  ) then
    create policy "contas_financeiras_delete_admin"
    on public.contas_financeiras
    for delete
    to authenticated
    using (public.is_admin());
  end if;
end $$;

