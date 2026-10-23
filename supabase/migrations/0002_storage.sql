-- Private bucket for complaint photographs.
-- Object path convention: <institution_id>/<complaint_id|drafts>/<uuid>.<ext>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-attachments',
  'complaint-attachments',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Upload only into your own institution's prefix.
create policy complaint_attachments_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'complaint-attachments'
    and (storage.foldername(name))[1] = public.my_institution()::text
    and public.is_active_member()
  );

-- Read objects belonging to your institution. Complaint-level visibility is
-- enforced through signed-URL issuance in the app layer.
create policy complaint_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'complaint-attachments'
    and (storage.foldername(name))[1] = public.my_institution()::text
  );

create policy complaint_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'complaint-attachments'
    and (storage.foldername(name))[1] = public.my_institution()::text
    and (owner = auth.uid() or public.my_role() = 'admin')
  );
