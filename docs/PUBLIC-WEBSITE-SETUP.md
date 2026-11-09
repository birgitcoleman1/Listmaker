# Public website, Listmaker and website administration

## Routes and layout boundaries

| URL | Purpose | Access/layout |
| --- | --- | --- |
| `/` | Birgit's substantial professional homepage | Public header/footer, no Listmaker shell |
| `/about` | About Birgit | Same public layout |
| `/references` | Published reference tiles and accessible full-entry dialog | Same public layout |
| `/contact` | Validated contact form | Same public layout |
| `/lm` | Existing Listmaker app/sign-in | Existing Listmaker layout |
| `/lm/contacts`, `/lm/events`, `/lm/workflows`, etc. | Direct access to all existing sections | Existing Listmaker layout and workspace permissions |
| `/lm/contacts/:uuid` | Direct contact card | Existing contact access controls |
| `/lm/auth/callback`, `/lm/auth/reset` | Listmaker email callbacks/password reset | Simple auth pages |
| `/admin/login` | Website administrator sign-in | Simple login, no Listmaker sidebar |
| `/admin`, `/admin/home`, `/admin/about`, `/admin/references` | Website CMS | Separate protected website-admin layout |
| `/admin/submissions` | Website contact-submission Inbox | Separate protected website-admin layout |
| `/admin/auth/callback`, `/admin/auth/reset` | Website-admin email callbacks/password reset | Simple auth pages |

React Router defines independent layout boundaries. A cached Listmaker session never replaces the public homepage. Listmaker retains its auth project/session storage, contacts, organizations, memberships, categories, workflows, mailboxes and Postmark sender. Existing internal navigation now updates `/lm` URLs, contact links are nested, API endpoints stay at `/.netlify/functions/*`, and Vite asset paths stay rooted. Netlify SPA rewrites support direct navigation and refreshes. There are no DNS, Migadu, or email-provider configuration changes in this update.

## Owner setup: database and administrator

1. Apply `supabase/migrations/202611080002_public_website.sql` once in Supabase SQL Editor. It is transactional and creates only website CMS/admin/submission tables, functions, policies, default published copy and a new `website-assets` storage bucket. It does not alter Listmaker records. The earlier initial schema and migrations should not be rerun.
2. Run `docs/website-masteradmin.sql` as the Supabase project owner. It grants `masteradmin` to the previously confirmed Auth account `6942d7aa-445a-4fc3-93b9-3725646ad4b9`. The statement returns the assigned user/role. If no row returns, that Auth account does not exist in this project: stop and confirm the intended account instead of granting a random user. No public signup, workspace membership, Listmaker administrator role or client-side flag grants website access.
3. Open `https://birgitcoleman.com/admin/login` (also available through the discreet footer link) and sign in with that Supabase Auth account. Authorized users arrive at `/admin`. The CMS is not part of the Listmaker sidebar. Database RLS and privileged functions enforce website roles, independently of UI routing.

No live database access or administrator credentials were available during implementation. Migration and administrator assignment must be confirmed on the actual project. The public website can render its supplied initial copy before the website migration; CMS edits, references and valid contact-submission storage require the migration. The contact form never reports database success if saving failed.

## Authentication URL settings

In Supabase → Authentication → URL Configuration:

- Set the default Site URL to `https://birgitcoleman.com/lm/auth/callback` for default/legacy auth links.
- Add these exact Redirect URLs:
  - `https://birgitcoleman.com/lm/auth/callback`
  - `https://birgitcoleman.com/lm/auth/reset`
  - `https://birgitcoleman.com/admin/auth/callback`
  - `https://birgitcoleman.com/admin/auth/reset`
- If you use `www.birgitcoleman.com` or `bclistmaker.netlify.app` for signing in, add those same four callback/reset paths for those origins too.
- Keep auth email templates using Supabase's confirmation/redirect URLs, rather than a hardcoded old root-only destination.

New Listmaker signup links explicitly target `/lm/auth/callback`. Password reset emails target the appropriate `/lm/auth/reset` or `/admin/auth/reset`. Callback pages handle both implicit access/refresh tokens and authorization-code exchange. Legacy auth parameters arriving at `/` redirect to the Listmaker callback/reset handler; ordinary signed-in visits to `/` stay on the public website. Unknown `/lm` paths show a Listmaker-specific not-found page; they do not silently become public pages.

Official behavior references: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail and https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession .

## Content and media

- `website_pages` stores private drafts. `website_published_pages` stores only public snapshots. **Save draft** does not change public content; **Publish page** copies the saved content atomically to the published table. Public pages read those published snapshots. Default copy is the user's supplied copy; no clients, achievements or testimonials are invented.
- Homepage editing includes all introduced homepage copy, CTA labels, focus label/titles/descriptions, closing copy and image/alt text. About includes short and long copy. References includes page headline/header image and entries.
- The original portrait remains in the existing private `Website-media/Birgit.jpg` object. No photograph or signed token is committed. Optional existing `VITE_HOME_HERO_URL` continues to work. Without it, the `website-hero` function signs only that exact user-approved portrait for public display; it accepts no arbitrary bucket/path. Once neither published page uses the initial image, the endpoint stops issuing it. The original bucket and its permissions are unchanged.
- CMS uploads go straight from the authorized browser to Supabase's new **public** `website-assets` bucket. Only website administrators can upload/replace/remove objects. JPEG/PNG/WebP up to 10 MB; SVG/HTML are not accepted. Replacement creates a new object so an unpublished draft cannot break the currently published image. Removing an image from a page persists `use_initial_image=false`, preventing the initial portrait from reappearing. Old upload objects are retained to preserve published/draft references; unused-file cleanup is a separate owner task, not an automatic destructive action.
- Reference entries can be drafted, edited, ordered atomically, published/unpublished, or deleted after confirmation. Published entries require headline, photo, alt text and short copy. Full text is optional. Saving edits to an already-published reference updates it immediately; the UI labels this clearly. No entries are prefilled.

## Contact form and website submissions Inbox

- Fields: required name/email/message, optional organization/subject. Limits are enforced on both client and server. Content is rendered as inert text.
- GET `website-contact` issues a short-lived HMAC-signed, IP-bound challenge. POST requires the same website origin, a valid challenge at least three seconds old, an empty honeypot, valid bounded fields, and a database insert. Nonces make retries idempotent. A database lock enforces five accepted enquiries per hashed IP per hour, across function instances. Spam controls are practical barriers, not a guarantee against distributed abuse.
- Netlify supplies `x-nf-client-connection-ip`. Raw IP addresses are not saved; the hash is keyed. If the header is unavailable, rate limiting falls back to a common bucket rather than trusting arbitrary client forwarding headers.
- Uses existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Optional `CONTACT_FORM_SECRET` can provide a separate stable HMAC secret; otherwise a purpose-specific key is derived from the existing service-role secret. No new environment variable is required for the standard existing deployment. `WEBSITE_PUBLIC_URL` is optional if deploying at another origin; production `birgitcoleman.com`, `www.birgitcoleman.com`, the existing Netlify site, and Netlify's preview URL are handled.
- `/admin/submissions` provides search across sender, organization, subject and message, paginated results, full submission details, read/unread, archive/restore, timestamps and a `mailto:` reply link. It is separate from Listmaker's Migadu Inbox and workflow Outboxes. Replies open the administrator's email client; they are not silently sent by the website.
- Anonymous visitors cannot read submissions or invoke the privileged submission SQL function directly. Only authorized website administrators can read or change read/archive fields; the original sender/message content cannot be overwritten through the CMS client grants.

## Deploy and verify

Use the established GitHub → main → Netlify process. The public website can deploy before the website migration using the supplied initial copy; complete the owner setup above to activate the CMS and form storage. Existing Listmaker functionality does not depend on the website tables.

Checks: `npm test`, `npm run build`, and server module bundle/import checks. The React Router “use client” build advisory is informational for this Vite SPA; the lazy spreadsheet chunk still has its existing size advisory.

Live acceptance after migration:
1. In a signed-out browser, open `/`, `/about`, `/references` and `/contact`. Check public header/footer, the portrait when available, mobile layout, and no Listmaker sidebar.
2. Use the footer's Admin login. Sign in as Birgit; verify another Listmaker account is denied.
3. Edit/save a homepage draft. Confirm the public page is unchanged, then publish and refresh it. Upload/replace/remove images on Home/About/References and confirm alt text and publication behavior.
4. Create a reference draft, upload its photo, publish, reorder, open its public popup, unpublish, and delete only the disposable test entry.
5. Submit a test enquiry. Confirm it is stored once in `/admin/submissions`; mark read/unread, search, archive/restore and use its email-client reply link. Confirm public and ordinary Listmaker users cannot read it.
6. Open `/lm`, `/lm/contacts`, `/lm/events`, `/lm/email-settings` and a nested contact URL directly and refresh. Confirm login/reset destinations stay under `/lm` and the existing CRM data/workflows/mail settings are intact. While logged into Listmaker, reopen `/` and confirm the public homepage remains.

Local DOM/database tests cover these boundaries and editing flows with synthetic users/data. Browser preview was blocked by a saved browser permission setting; no screenshot or visual live verification is claimed. Live CMS publishing, uploads, authorized login and submission storage remain unverified until the owner migration and role assignment are completed.
