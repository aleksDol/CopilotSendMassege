-- Add LeadRadar cold first-touch playbook (outreach only)
ALTER TABLE "lead_settings"
  ADD COLUMN IF NOT EXISTS "cold_first_touch_playbook" TEXT;

