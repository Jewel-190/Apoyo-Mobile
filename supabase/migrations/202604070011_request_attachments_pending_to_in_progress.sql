-- Change request_attachments initial/default status from 'pending' to 'in progress'.

begin;

-- Drop old check first so status migration is allowed.
alter table public.request_attachments
  drop constraint if exists request_attachments_status_chk;

-- Migrate existing rows.
update public.request_attachments
set status = 'in progress'
where status = 'pending';

-- Rebuild status check with new allowed values.

alter table public.request_attachments
  add constraint request_attachments_status_chk
  check (
    status = any (
      array[
        'in progress'::text,
        'approved'::text,
        'action_required'::text,
        'resubmitted'::text
      ]
    )
  );

-- Set new default for all future uploads.
alter table public.request_attachments
  alter column status set default 'in progress';

commit;
