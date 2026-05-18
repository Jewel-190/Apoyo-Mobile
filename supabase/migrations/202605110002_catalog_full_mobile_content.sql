-- Full catalog content migrated from legacy mobile copy (Home grid + serviceRequirements.ts).
-- Idempotent: updates services/requirements; replaces tips for the eight seeded services only.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Service-level copy (display name, card description, reminders — always refresh)
-- ---------------------------------------------------------------------------

update public.assistance_services s
set
  display_name = v.display_name,
  description_html = v.description_html,
  reminder_text = v.reminder_text,
  updated_at = now()
from (
  values
    ('hospital'::text, 'Hospitalization Expense'::text,
      '<p>Urgent medical aid for expenses during hospital confinement.</p>'::text,
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'::text),
    ('treatment', 'Treatment & Procedures',
      '<p>Urgent medical aid for outpatient treatments and procedures.</p>',
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'),
    ('operations', 'Medical Operations',
      '<p>Emergency funding for dialysis, chemotherapy, and medical operations.</p>',
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'),
    ('emergency-finance', 'Emergency Financial Relief',
      '<p>Urgent monetary aid for critical and immediate financial crises.</p>',
      'Requests must be filed by the concerned individual or an immediate family member residing in the same household, and supporting documents must be complete upon submission.'),
    ('burial-money', 'Monetary Burial Aid',
      '<p>Urgent monetary aid for immediate burial service expenses.</p>',
      'For burial assistance, the request must be processed by an immediate family member, and documents must be consistent with the deceased''s records.'),
    ('burial-site', 'Burial Site Assistance',
      '<p>Urgent aid for securing funeral burial plots.</p>',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.'),
    ('cremation', 'Cremation Assistance',
      '<p>Urgent aid for immediate and essential cremation services.</p>',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.'),
    ('columbarium', 'Columbarium Allocation',
      '<p>Urgent aid for securing essential columbarium niche space.</p>',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.')
) as v(service_key, display_name, description_html, reminder_text)
where s.service_key = v.service_key;

-- Extended intro copy for intermediate detail screens (financial / burial-site / cremation).
update public.assistance_services s
set web_intro_html = v.web_intro_html, updated_at = now()
from (
  values
    (
      'emergency-finance'::text,
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p><p><strong>Who may avail:</strong> Individuals and families with inadequate resources.</p><p>Applicants must choose the type of financial assistance before proceeding.</p>'::text
    ),
    (
      'burial-site',
      '<h3>Panteon de Dasmariñas Public Cemetery</h3><p>Provides essential burial and cremation services for city residents. It offers a dignified public cemetery for families seeking a final resting place. This facility ensures accessible and organized options for those in need of assistance.</p><p><strong>Burial Assistance Coverage</strong> options include Funeral Wake Services where applicable.</p>'
    ),
    (
      'cremation',
      '<h3>Panteon de Dasmariñas Public Cemetery</h3><p>Provides essential burial and cremation services for city residents. It offers a dignified public cemetery for families seeking a final resting place. This facility ensures accessible and organized options for those in need of assistance.</p><p><strong>Burial Assistance Coverage</strong> may include Funeral Wake Services and Niche Allocation where applicable.</p>'
    )
) as v(service_key, web_intro_html)
where s.service_key = v.service_key;

-- ---------------------------------------------------------------------------
-- 2) Requirement titles + help_html (expandable detail text on Home modal)
-- ---------------------------------------------------------------------------

update public.assistance_requirements r
set
  title = v.title,
  help_html = v.help_html,
  updated_at = now()
from public.assistance_services s,
(
  values
    -- hospital
    ('hospital'::text, 'letter'::text, 'Personal Letter'::text,
      '<p>A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.</p>'::text),
    ('hospital', 'voterId', 'Patient''s Voters ID / Certificate',
      '<p>Patient must be legitimate registered voters of the City of Dasmariñas.</p>'),
    ('hospital', 'barangay', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('hospital', 'indigency', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('hospital', 'birthCert', 'Patient''s Valid ID',
      '<p>Valid ID or Birth Certificate of the patient and requestor.</p>'),
    ('hospital', 'abstract', 'Medical Abstract', ''),
    ('hospital', 'bill', 'Partial Hospital Bill', ''),
    ('hospital', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- treatment
    ('treatment', 'letter', 'Personal Letter',
      '<p>A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.</p>'),
    ('treatment', 'voterId', 'Patient''s Voters ID / Certificate',
      '<p>Patient must be legitimate registered voters of the City of Dasmariñas.</p>'),
    ('treatment', 'barangay', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('treatment', 'indigency', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('treatment', 'birthCert', 'Patient''s Valid ID',
      '<p>Valid ID or Birth Certificate of the patient and requestor.</p>'),
    ('treatment', 'medCert', 'Medical Certificate',
      '<p>Latest medical certificate indicating diagnosis and recommended management/treatment.</p>'),
    ('treatment', 'rx', 'Doctor''s Prescription',
      '<p>Official prescription for medicines/procedures needed, signed by the attending physician.</p>'),
    ('treatment', 'lab', 'Laboratory Request',
      '<p>Laboratory request or result relevant to the patient''s case (if applicable).</p>'),
    ('treatment', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- operations
    ('operations', 'letter', 'Personal Letter',
      '<p>A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.</p>'),
    ('operations', 'voterId', 'Patient''s Voters ID / Certificate',
      '<p>Patient must be legitimate registered voters of the City of Dasmariñas.</p>'),
    ('operations', 'barangay', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('operations', 'indigency', 'Patient''s Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('operations', 'birthCert', 'Patient''s Valid ID',
      '<p>Valid ID or Birth Certificate of the patient and requestor.</p>'),
    ('operations', 'medCert', 'Medical Certificate',
      '<p>Latest medical certificate indicating diagnosis and recommended management/treatment.</p>'),
    ('operations', 'prescription', 'Doctor''s Prescription',
      '<p>Official prescription for medicines/procedures needed, signed by the attending physician.</p>'),
    ('operations', 'quotation', 'Quotation of Expenses',
      '<p>Itemized quotation/billing statement (dialysis/chemo/procedure) from hospital/clinic.</p>'),
    ('operations', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- emergency-finance
    ('emergency-finance', 'letter', 'Personal Letter',
      '<p>A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.</p>'),
    ('emergency-finance', 'voterId', 'Applicant''s Voters ID / Certificate',
      '<p>Applicant must be a legitimate registered voter of the City of Dasmariñas.</p>'),
    ('emergency-finance', 'barangay', 'Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('emergency-finance', 'indigency', 'Endorsement & Indigency Certificate',
      '<p>Endorsement and Certificate of Indigency issued by the Barangay Captain.</p>'),
    ('emergency-finance', 'validId', 'Valid ID',
      '<p>Valid ID or Birth Certificate of the applicant and requestor (if representative).</p>'),
    ('emergency-finance', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- burial-money
    ('burial-money', 'letter', 'Letter of Request to the Mayor',
      '<p>Formal request letter addressed to the City Mayor stating the type of burial monetary assistance needed.</p>'),
    ('burial-money', 'voterId', 'Patient''s Voter''s ID / Certificate',
      '<p>Proof that the applicant or deceased is connected to a registered voter of the City of Dasmariñas.</p>'),
    ('burial-money', 'birthCert', 'Valid ID / Birth Certificate',
      '<p>Valid government-issued ID or birth certificate of the deceased and requestor.</p>'),
    ('burial-money', 'barangay', 'Barangay Endorsement',
      '<p>Barangay-issued endorsement supporting the burial assistance request.</p>'),
    ('burial-money', 'indigency', 'Certificate of Indigency',
      '<p>Certification proving financial incapacity, issued by the barangay or local social welfare office.</p>'),
    ('burial-money', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- burial-site
    ('burial-site', 'deathCert', 'Death Certificate',
      '<p>Certified copy of the death certificate of the deceased.</p>'),
    ('burial-site', 'validId', 'Valid ID of Deceased',
      '<p>Any valid government-issued ID of the deceased.</p>'),
    ('burial-site', 'barangay', 'Barangay Endorsement of the Deceased',
      '<p>Barangay endorsement confirming residency and request for burial site support.</p>'),
    ('burial-site', 'indigency', 'Indigency Certificate of the Deceased',
      '<p>Indigency certificate proving financial need for burial site assistance.</p>'),
    ('burial-site', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- cremation
    ('cremation', 'deathCert', 'Death Certificate',
      '<p>Certified copy of the death certificate of the deceased.</p>'),
    ('cremation', 'validId', 'Valid ID of Deceased',
      '<p>Any valid government-issued ID of the deceased.</p>'),
    ('cremation', 'barangay', 'Barangay Endorsement of the Deceased',
      '<p>Barangay endorsement confirming request for cremation assistance.</p>'),
    ('cremation', 'indigency', 'Indigency Certificate of the Deceased',
      '<p>Indigency certificate proving financial need for cremation support.</p>'),
    ('cremation', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>'),
    -- columbarium
    ('columbarium', 'deathCert', 'Death Certificate',
      '<p>Certified copy of the death certificate of the deceased.</p>'),
    ('columbarium', 'validId', 'Valid ID of Deceased',
      '<p>Any valid government-issued ID of the deceased.</p>'),
    ('columbarium', 'cremationCert', 'Certificate of Cremation',
      '<p>Official cremation certificate issued by the crematorium.</p>'),
    ('columbarium', 'barangay', 'Barangay Endorsement of the Deceased',
      '<p>Barangay endorsement confirming request for columbarium support.</p>'),
    ('columbarium', 'indigency', 'Indigency Certificate of the Deceased',
      '<p>Indigency certificate proving financial need for columbarium allocation.</p>'),
    ('columbarium', 'attachment', 'Additional attachment',
      '<p>Optional supporting document. Use clear photos or PDF.</p>')
) as v(service_key, slot_key, title, help_html)
where s.id = r.service_id
  and s.service_key = v.service_key
  and r.slot_key = v.slot_key;

-- Normalize empty help_html to NULL (optional body)
update public.assistance_requirements r
set help_html = null
where trim(coalesce(help_html, '')) = '';

-- ---------------------------------------------------------------------------
-- 3) Replace requirement tips for eight services (text from REQUIREMENT_TIPS_BY_SERVICE)
-- ---------------------------------------------------------------------------

delete from public.assistance_requirement_tips t
where exists (
    select 1
    from public.assistance_requirements r
    join public.assistance_services s on s.id = r.service_id
    where t.requirement_id = r.id
      and s.service_key in (
        'hospital',
        'treatment',
        'operations',
        'emergency-finance',
        'burial-money',
        'burial-site',
        'cremation',
        'columbarium'
      )
  );

-- Hospital
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('hospital'::text, 'letter'::text, 1::int, 'Format for Personal Letter'::text,
      'Include date, full name, contact details, reason for assistance, brief hospitalization details, requested amount, and signature.'::text),
    ('hospital', 'letter', 2, 'Sample Document',
      'Use a clear and formal letter addressed to the City Mayor.'),
    ('hospital', 'voterId', 1, 'Where to Get It',
      'Go to the COMELEC Office (Office of the Election Officer) in your city.'),
    ('hospital', 'voterId', 2, 'What to Bring',
      'Bring a valid government ID, request form, and authorization letter if claiming on behalf of another person.'),
    ('hospital', 'voterId', 3, 'How to Get It',
      'Have your record checked, pay any required fee, submit receipt and form, then claim the certificate.'),
    ('hospital', 'voterId', 4, 'Sample Document',
      'Reference: voter certificate sample shown in the mobile app.'),
    ('hospital', 'barangay', 1, 'Barangay Endorsement Tips',
      'Request this at your Barangay Hall, bring valid ID and supporting medical documents, and ensure signed/sealed issuance.'),
    ('hospital', 'indigency', 1, 'Certificate of Indigency Tips',
      'Get this from Barangay Hall or CSWDO, bring proof of residency and valid ID, then claim the signed certificate.'),
    ('hospital', 'birthCert', 1, 'Accepted IDs',
      'Accepted IDs include PhilID/ePhilID, Passport, Driver''s License, UMID, PRC, Postal ID, Voter''s ID/Certificate, SSS/GSIS, Senior Citizen ID, PWD ID, TIN, and PhilHealth.'),
    ('hospital', 'birthCert', 2, 'Sample Document',
      'Reference: sample ID document shown in the mobile app.'),
    ('hospital', 'abstract', 1, 'Where to Get It',
      'Go to the Medical Records Department of the hospital where the patient was admitted.'),
    ('hospital', 'abstract', 2, 'What to Bring',
      'Bring a valid ID, hospital card, and authorization letter with IDs if claiming for someone else.'),
    ('hospital', 'abstract', 3, 'How to Get It',
      'Fill out the request form, pay the processing fee, and return on the scheduled claim date.'),
    ('hospital', 'abstract', 4, 'Sample Document',
      'Reference: clinical abstract sample shown in the mobile app.'),
    ('hospital', 'bill', 1, 'Where to Get It',
      'Request this from the Billing Section of the hospital where confinement happened.'),
    ('hospital', 'bill', 2, 'What to Bring',
      'Prepare valid ID, hospital card, and authorization requirements when claiming for another person.'),
    ('hospital', 'bill', 3, 'How to Get It',
      'Ask for a Statement of Account or finalized bill, settle any required payments, then claim the printed bill.'),
    ('hospital', 'bill', 4, 'Sample Document',
      'Reference: hospital bill sample shown in the mobile app.'),
    ('hospital', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Treatment
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('treatment'::text, 'letter'::text, 1::int, 'Format for Personal Letter'::text,
      'State your treatment/procedure request, patient details, diagnosis summary, and contact information.'::text),
    ('treatment', 'letter', 2, 'Sample Document',
      'Reference: sample letter shown in the mobile app.'),
    ('treatment', 'voterId', 1, 'How to Get Voter''s Certificate',
      'Request this at the local COMELEC office and bring a valid ID for verification.'),
    ('treatment', 'voterId', 2, 'Sample Document',
      'Reference: voter certificate sample shown in the mobile app.'),
    ('treatment', 'barangay', 1, 'Barangay Endorsement',
      'Ask your barangay for an endorsement letter supporting your treatment request.'),
    ('treatment', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('treatment', 'indigency', 1, 'Certificate of Indigency',
      'Secure an indigency certificate from the barangay or CSWDO for financial need verification.'),
    ('treatment', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('treatment', 'birthCert', 1, 'Accepted IDs',
      'Any government-issued ID may be used. If unavailable, submit a birth certificate.'),
    ('treatment', 'medCert', 1, 'Medical Certificate',
      'Request an updated certificate with diagnosis and recommended treatment from your attending physician.'),
    ('treatment', 'rx', 1, 'Doctor''s Prescription',
      'Submit a signed and dated prescription reflecting current treatment needs.'),
    ('treatment', 'lab', 1, 'Laboratory Request',
      'Provide lab requests/results relevant to the treatment to support medical necessity.'),
    ('treatment', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Operations
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('operations'::text, 'letter'::text, 1::int, 'Format for Personal Letter'::text,
      'Specify the operation, estimated cost, and assistance amount requested in your letter.'::text),
    ('operations', 'letter', 2, 'Sample Document',
      'Reference: sample letter shown in the mobile app.'),
    ('operations', 'voterId', 1, 'How to Get Voter''s Certificate',
      'Request this at COMELEC and make sure the name matches your submitted IDs.'),
    ('operations', 'voterId', 2, 'Sample Document',
      'Reference: voter certificate sample shown in the mobile app.'),
    ('operations', 'barangay', 1, 'Barangay Endorsement',
      'Request endorsement from your barangay and ensure it clearly states operation assistance.'),
    ('operations', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('operations', 'indigency', 1, 'Certificate of Indigency',
      'Obtain an indigency certificate for financial assessment.'),
    ('operations', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('operations', 'birthCert', 1, 'Accepted IDs',
      'Use any valid government ID or a birth certificate when applicable.'),
    ('operations', 'medCert', 1, 'Medical Certificate',
      'Include diagnosis and recommendation for surgery, chemotherapy, dialysis, or related procedure.'),
    ('operations', 'prescription', 1, 'Doctor''s Prescription',
      'Provide current prescription and treatment plan signed by the physician.'),
    ('operations', 'quotation', 1, 'Quotation of Expenses',
      'Submit an itemized quotation from the hospital/clinic that matches the required operation.'),
    ('operations', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Emergency finance
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('emergency-finance'::text, 'letter'::text, 1::int, 'Format for Personal Letter'::text,
      'Describe the emergency situation, requested amount, and immediate use of funds.'::text),
    ('emergency-finance', 'letter', 2, 'Sample Document',
      'Reference: sample letter shown in the mobile app.'),
    ('emergency-finance', 'voterId', 1, 'How to Get Voter''s Certificate',
      'Claim this from COMELEC with a valid ID and correct personal details.'),
    ('emergency-finance', 'voterId', 2, 'Sample Document',
      'Reference: voter certificate sample shown in the mobile app.'),
    ('emergency-finance', 'barangay', 1, 'Barangay Endorsement',
      'Secure barangay endorsement that references your emergency financial need.'),
    ('emergency-finance', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('emergency-finance', 'indigency', 1, 'Certificate of Indigency',
      'Provide proof of financial hardship via barangay or social welfare indigency certification.'),
    ('emergency-finance', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('emergency-finance', 'validId', 1, 'Accepted IDs',
      'Submit any valid government-issued ID. Birth certificate is accepted when needed.'),
    ('emergency-finance', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Burial monetary
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('burial-money'::text, 'letter'::text, 1::int, 'Format for Personal Letter'::text,
      'State the deceased''s name, date of death, and specific burial monetary aid being requested.'::text),
    ('burial-money', 'letter', 2, 'Sample Document',
      'Reference: sample letter shown in the mobile app.'),
    ('burial-money', 'voterId', 1, 'How to Get Voter''s Certificate',
      'Request from COMELEC and ensure details are consistent with other documents.'),
    ('burial-money', 'voterId', 2, 'Sample Document',
      'Reference: voter certificate sample shown in the mobile app.'),
    ('burial-money', 'birthCert', 1, 'Accepted Document',
      'You may submit a valid ID or birth certificate of the deceased/requestor.'),
    ('burial-money', 'barangay', 1, 'Barangay Endorsement',
      'Request endorsement at the barangay hall and verify signature and seal.'),
    ('burial-money', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('burial-money', 'indigency', 1, 'Certificate of Indigency',
      'Get this from barangay or CSWDO after financial assessment.'),
    ('burial-money', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('burial-money', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Burial site
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('burial-site'::text, 'deathCert'::text, 1::int, 'Where to Get It'::text,
      'Request a certified death certificate from the Local Civil Registrar.'::text),
    ('burial-site', 'deathCert', 2, 'Sample Document',
      'Reference: death certificate sample shown in the mobile app.'),
    ('burial-site', 'validId', 1, 'Accepted IDs',
      'Submit any valid government-issued ID of the deceased.'),
    ('burial-site', 'barangay', 1, 'Barangay Endorsement',
      'Request endorsement from your barangay for burial site assistance.'),
    ('burial-site', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('burial-site', 'indigency', 1, 'Certificate of Indigency',
      'Submit indigency certification from barangay or local social welfare office.'),
    ('burial-site', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('burial-site', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Cremation
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('cremation'::text, 'deathCert'::text, 1::int, 'Where to Get It'::text,
      'Request a certified death certificate from the Local Civil Registrar.'::text),
    ('cremation', 'deathCert', 2, 'Sample Document',
      'Reference: death certificate sample shown in the mobile app.'),
    ('cremation', 'validId', 1, 'Accepted IDs',
      'Submit any valid government-issued ID of the deceased.'),
    ('cremation', 'barangay', 1, 'Barangay Endorsement',
      'Request endorsement from your barangay for cremation assistance.'),
    ('cremation', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('cremation', 'indigency', 1, 'Certificate of Indigency',
      'Submit indigency certification from barangay or local social welfare office.'),
    ('cremation', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('cremation', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

-- Columbarium
insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, x.sort_order, x.title, x.description
from public.assistance_requirements r
join public.assistance_services s on s.id = r.service_id
join (
  values
    ('columbarium'::text, 'deathCert'::text, 1::int, 'Where to Get It'::text,
      'Request a certified death certificate from the Local Civil Registrar.'::text),
    ('columbarium', 'deathCert', 2, 'Sample Document',
      'Reference: death certificate sample shown in the mobile app.'),
    ('columbarium', 'validId', 1, 'Accepted IDs',
      'Submit any valid government-issued ID of the deceased.'),
    ('columbarium', 'cremationCert', 1, 'Certificate of Cremation',
      'Request a certified cremation certificate from the crematorium that handled the service.'),
    ('columbarium', 'cremationCert', 2, 'Sample Document',
      'Reference: cremation certificate sample shown in the mobile app.'),
    ('columbarium', 'barangay', 1, 'Barangay Endorsement',
      'Request endorsement from your barangay for columbarium allocation support.'),
    ('columbarium', 'barangay', 2, 'Sample Document',
      'Reference: endorsement sample shown in the mobile app.'),
    ('columbarium', 'indigency', 1, 'Certificate of Indigency',
      'Submit indigency certification from barangay or local social welfare office.'),
    ('columbarium', 'indigency', 2, 'Sample Document',
      'Reference: indigency certificate sample shown in the mobile app.'),
    ('columbarium', 'attachment', 1, 'Tips',
      'Upload a clear photo or PDF when submitting this requirement.')
) as x(service_key, slot_key, sort_order, title, description)
  on s.service_key = x.service_key and r.slot_key = x.slot_key;

commit;
