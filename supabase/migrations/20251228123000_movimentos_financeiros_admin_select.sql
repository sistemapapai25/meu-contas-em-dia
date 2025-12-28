do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'movimentos_financeiros'
      and policyname = 'movimentos_financeiros_select_admin'
  ) then
    create policy "movimentos_financeiros_select_admin"
    on public.movimentos_financeiros
    for select
    to authenticated
    using (public.is_admin());
  end if;
end $$;

