-- Documentation copy of Admin 202608212000.
-- Applicants must read the interview briefing on mobile. Do not db-push from this repo.

begin;

set search_path = public;

update public.settings
set
  visibility = 'authenticated',
  description = 'Interview scheduling briefing shown in Admin For Approval → Scheduling and on the applicant app.'
where scope = 'admin'
  and key = 'interview-scheduling';

commit;
