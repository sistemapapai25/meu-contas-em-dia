drop policy if exists "Authenticated upload Comprovantes" on storage.objects;
create policy "Authenticated upload Comprovantes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'Comprovantes'
    and (owner = auth.uid() or public.is_admin())
  );

drop policy if exists "Authenticated update Comprovantes" on storage.objects;
create policy "Authenticated update Comprovantes" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'Comprovantes'
    and (owner = auth.uid() or public.is_admin())
  )
  with check (
    bucket_id = 'Comprovantes'
    and (owner = auth.uid() or public.is_admin())
  );

drop policy if exists "Authenticated delete Comprovantes" on storage.objects;
create policy "Authenticated delete Comprovantes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'Comprovantes'
    and (owner = auth.uid() or public.is_admin())
  );

