-- Seed data for development and the pilot. Safe to run more than once.
-- Legal documents are registered as DRAFTS (review_status = not_started).
-- docs/legal-review/README.md is the status register; update both together.

insert into public.legal_documents (code, version, title, body_url, review_status, required_for)
values
  ('customer_terms',          '0.1', 'Customer Terms of Use',                       '/legal/customer-terms',          'not_started', '{customer}'),
  ('technician_terms',        '0.1', 'Technician Terms of Use',                     '/legal/technician-terms',        'not_started', '{technician}'),
  ('company_terms',           '0.1', 'Service Company Terms of Use',                '/legal/company-terms',           'not_started', '{company_admin,company_technician}'),
  ('marketplace_description', '0.1', 'Marketplace Service Description',             '/legal/marketplace',             'not_started', '{customer,technician,company_admin,company_technician}'),
  ('privacy_policy',          '0.1', 'Privacy Policy',                              '/legal/privacy',                 'not_started', '{customer,technician,company_admin,company_technician,support_agent,platform_admin}'),
  ('acceptable_use',          '0.1', 'Acceptable Use Policy',                       '/legal/acceptable-use',          'not_started', '{customer,technician,company_admin,company_technician}'),
  ('prohibited_activities',   '0.1', 'Prohibited Activities Policy',                '/legal/prohibited-activities',   'not_started', '{customer,technician,company_admin,company_technician}'),
  ('grievance_policy',        '0.1', 'Grievance and Complaint Policy',              '/legal/grievance',               'not_started', '{}'),
  ('estimate_terms',          '0.1', 'Service Estimate and Approval Terms',         '/legal/estimate-terms',          'not_started', '{customer,technician,company_admin,company_technician}'),
  ('parts_terms',             '0.1', 'Spare-Parts Coordination Terms',              '/legal/parts-terms',             'not_started', '{customer,technician,company_admin,company_technician}'),
  ('provider_relationship',   '0.1', 'Independent Provider Relationship Statement', '/legal/provider-relationship',   'not_started', '{technician,company_admin,company_technician}'),
  ('platform_disclaimer',     '0.1', 'Platform Disclaimer',                         '/legal/disclaimer',              'not_started', '{}')
on conflict (code, version) do nothing;
