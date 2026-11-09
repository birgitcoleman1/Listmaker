# Listmaker

Mobile-first CRM rebuilt against the user's supplied Supabase schema. React/Vite frontend, Supabase Auth and tenant RLS, private business-card storage, browser OCR, and Netlify scheduled follow-up sequences.

## Status

The original local folder and GitHub repository were empty. This is replacement application code, not recovered original code. The initial SQL supplied in the recovery chat has already been run: **do not rerun it**.

## Run locally

Use Node 22 and `npm ci`. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or a Supabase publishable key). Run `npm run dev`. `npm test` runs the unit tests; `npm run build` produces `dist/`.

The frontend shows a configuration screen if the public environment variables are missing. It never falls back to fake contacts. Create an account, confirm the email if required, sign in, and create a workspace. Existing memberships load automatically. Workspace creation uses the existing atomic `create_organization` RPC.

## Existing database upgrades

Review and run these additive migrations once, in order, through Supabase SQL Editor:

1. `supabase/migrations/202611070001_workflow_execution.sql` — privileged enrollment and job claiming, immutable active workflow steps, and viewer write restrictions.
2. `supabase/migrations/202611070002_spreadsheet_fields.sql` — source, location, outreach/relationship status, referrals, scope-of-work, extra emails, and tenant-protected import provenance.

Do not drop tables or rerun the initial schema. These upgrades have not been applied to the live database by this task. The SQL Editor runs with privileged access; choose the correct project before executing.

## Spreadsheet import

Private data exports and generated SQL live in ignored `private-imports/`, never in the public repository. Follow the README in that folder. Select the target workspace explicitly. Imported source rows are preserved, and repeat imports skip already recorded rows. Imported data never starts email automation. Review grouped contacts and variants before enrollment. The Import records screen displays the original cells and mapping status.

## Netlify deployment

1. Import `birgitcoleman1/Listmaker` into Netlify, branch `main`.
2. Use build command `npm run build`, publish directory `dist`, Node 22. `netlify.toml` includes the functions directory, SPA redirect, and the scheduled runner.
3. Set public build variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Set server-only variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_SERVER_TOKEN` for Functions. Never prefix these with `VITE_`, add them to source control, or put them in the frontend.
5. In Supabase Auth URL Configuration, set the Netlify production URL as Site URL and add allowed local/production redirect URLs. Configure production email delivery and confirmation settings.
6. Deploy, then verify signup, confirmation, login, workspace creation, contact capture, camera/OCR on a real mobile device, and tenant isolation with two separate accounts.

## Follow-up sequences

Create email templates (plain text, supporting `{{first_name}}` and `{{last_name}}`), create a workflow for category A, B or C, add ordered email/wait/task steps, and enable it. `delay_days` is cumulative from enrollment: 2 then 3 means day 2 and day 5. Enable exactly one workflow per category. Contacts are enrolled explicitly with **Start category workflow**; repeated clicks reuse the active enrollment. A/B/C category reminders use the existing category `reminder_days` setting.

A trusted operator must verify a sender/domain in Postmark, then provision one `sending_identities` row for the tenant with `verified=true`, `sending_enabled=true`, and the matching `from_email`. Client writes to sender identities remain revoked. Use a Postmark server token for the corresponding sender. Send only contacts you have reviewed and have permission to email.

Netlify runs `workflow-runner` every five minutes on published deploys. PostgreSQL claims due jobs with row locks; earlier unfinished/failed steps block later steps. Disabling a workflow stops an enrollment when its next job is processed. Stop enrollment cancels pending jobs; a message already being sent can still complete. Editing steps requires stopping active enrollments first.

Failed or interrupted jobs are **not retried automatically**. This avoids resending an email after an uncertain provider response. Investigate failed/processing jobs and the Postmark message log before manual recovery. A job may remain `processing` after a process crash, and a `queued` email may have an uncertain delivery outcome. Provider acceptance is recorded as `sent`, not `delivered`. Delivery/bounce and inbound-reply webhooks are not implemented. Automatic stop-on-reply is not implemented; stop a sequence manually when a reply arrives.

## Limits requiring live validation

No Supabase credentials or Postmark account were supplied to the build. Production authentication, storage, cross-tenant RLS, real OCR accuracy, function execution, and email delivery must be verified on the configured project. OCR runs in-browser and downloads its recognition assets; review every extracted field before saving. Multi-person imported rows must be separated manually before mailing. Invitations, account recovery UI, billing, team administration UI, and automatic reply classification are not included in this initial rebuild. Trusted administrators manage team membership through Supabase until an audited invitation flow is added.

Official references: [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/) and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Mobile capture and OCR

The mobile bottom navigation keeps Scan available from every page. More opens all management screens, including Events and Workflows. Capture uses a full-screen Scan → Review → Follow-up flow with a sticky save action, camera/photo-library choices, large category controls, event selection and inline event creation. Saving the contact does not start its workflow; the user reviews the sequence and explicitly starts it afterward. An enrollment failure leaves the saved contact available for retry.

Card recognition runs locally in English. Images are resized, a contrast-enhanced reading is compared with an original-color sparse-layout reading, and small-angle deskew is enabled. Rotate by 90 degrees, trim surrounding background, reread, retake, cancel reading, or enter details manually. Name parsing filters common company/job headings and considers email-name matches. OCR remains fallible: confirm every field before saving, especially email addresses. No card photos are sent to an AI provider.

Local browser checks use synthetic data and a synthetic card. They do not establish accuracy on the user's actual card collection or verify a real phone camera. Live workflow execution still needs the server variables and migrations documented above.

### Workspace import and private mailbox update

See [Import and email setup](docs/IMPORT-EMAIL-SETUP.md) for the additive migration, Netlify secret, Migadu verification, exact provider settings, permission model, retry/status semantics and live acceptance steps. Apply the migration before deploying this update. Workflow transport remains Postmark; Migadu supplies each user's IMAP mailbox and desktop SMTP connection.

### Public website and separate Listmaker route

The public Birgit Coleman website now lives at `/`, `/about`, `/references`, and `/contact`. Listmaker is mounted at `/lm` with direct section/contact URLs. Website administration is separate at `/admin`, reached through the footer's `/admin/login` link. See [Public website setup](docs/PUBLIC-WEBSITE-SETUP.md) for the additive website migration, exact masteradmin assignment, authentication URL configuration, CMS publishing/media behavior, contact-form protections and acceptance checks.
