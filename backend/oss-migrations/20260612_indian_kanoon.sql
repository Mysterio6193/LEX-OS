-- Migration to add Indian Kanoon support and deprecate CourtListener
-- Run this on existing databases.

-- Add the legal_research_in column to user_profiles if it does not exist
alter table public.user_profiles add column if not exists legal_research_in boolean not null default true;

-- Update check constraint on user_api_keys.provider
-- We drop the old check constraint first.
alter table public.user_api_keys drop constraint if exists user_api_keys_provider_check;

-- Add the new check constraint allowing 'indiankanoon' instead of 'courtlistener'
alter table public.user_api_keys add constraint user_api_keys_provider_check 
  check (provider in ('claude', 'gemini', 'openai', 'openrouter', 'indiankanoon'));
