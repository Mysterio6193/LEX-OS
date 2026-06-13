-- Court / forum metadata for matters (India litigation).
-- Lets a matter record its forum and cause-title basics so the assistant
-- knows the court, and the Overview surfaces it. Added as nullable columns
-- on the existing projects table.

alter table public.projects
  add column if not exists matter_type text;

alter table public.projects
  add column if not exists court text;

alter table public.projects
  add column if not exists case_number text;

alter table public.projects
  add column if not exists jurisdiction text;

alter table public.projects
  add column if not exists filing_date date;
