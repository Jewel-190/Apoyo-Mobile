-- Enable authenticated users to manage their own files in request-documents.
-- File key format is expected to be: <auth.uid>/<request_uid>/<filename>

drop policy if exists "Users can upload own request documents" on storage.objects;
drop policy if exists "Users can read own request documents" on storage.objects;
drop policy if exists "Users can update own request documents" on storage.objects;
drop policy if exists "Users can delete own request documents" on storage.objects;

create policy "Users can upload own request documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own request documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own request documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'request-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'request-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own request documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
