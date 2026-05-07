-- Allow attachment-level resubmission workflow for Action Required cases.
alter table public.request_attachments
  drop constraint if exists request_attachments_status_chk;

alter table public.request_attachments
  add constraint request_attachments_status_chk
  check (
    status = any (
      array[
        'pending'::text,
        'approved'::text,
        'action_required'::text,
        'resubmitted'::text
      ]
    )
  );
