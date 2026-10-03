# Newsletter go-live setup

The public signup, double opt-in, unsubscribe page, branded newsletter composer, private document attachments, and batched Brevo sender are prepared. Signup confirmation requests are throttled by hashed IP and email buckets.

The Brevo branded-link subdomain is optional. Skip it for now unless Lawrence controls the domain and its DNS; do not connect a student or third-party domain to brand Lawrence messages.

## 1. Prepare Brevo

Create the Brevo account with an email address you control. Before sending to the public, add Lawrence's sending domain in Brevo and publish its SPF and DKIM records. Add a DMARC policy for the domain as well. Use a sender on that authenticated domain, such as `updates@lawrence.example`.

## 2. Apply the database schema

For a new project, run the current `schema.sql` in the Supabase SQL Editor. For an existing project, apply the relevant migrations, including `20261003152000_applicant_email_verification.sql` for applicant email verification and segmented campaign audiences. This migration disables direct public inserts into applications; the Edge Function now creates applications and sends verification links. The application-documents bucket remains private: applicants may upload, while reads and deletes are admin-only. The newsletter-attachments bucket is private and admin-only; the Edge Function accesses both through the service role.

## 3. Deploy the Edge Function

Install and authenticate the Supabase CLI, link this project, then deploy the function from the repository root:

```powershell
supabase login
supabase link --project-ref ttjgkfsrkxpxeufkikma
supabase functions deploy newsletter
```

JWT verification is disabled in `config.toml` so public signup, confirmation, unsubscribe, application submission, and email-verification requests can invoke the function. Admin campaign actions independently validate the caller's Supabase access token and active-admin status.

## 4. Configure function secrets

Set these through Supabase Dashboard > Edge Functions > Secrets, or with the Supabase CLI. Do not put values in the HTML, JavaScript, or this file.

- `BREVO_API_KEY`: Brevo API key.
- `BREVO_SENDER_EMAIL`: sender address verified in Brevo.
- `BREVO_SENDER_NAME`: for example, `Lawrence College & SHS`.
- `PUBLIC_SITE_URL`: public HTTPS origin, with no trailing slash. Production: `https://lawrencecollege.org`.
- `ALLOWED_ORIGINS`: comma-separated additional exact origins for local development, for example `http://localhost:8000,http://127.0.0.1:8000`. `PUBLIC_SITE_URL` is always allowed automatically.
- `NEWSLETTER_TOKEN_SECRET`: a private random value at least 32 characters long. Generate it locally and keep it only in Supabase secrets.
- `NEWSLETTER_LIVE_SENDS`: set to `false` during setup. This is the default; it blocks campaign batches while still allowing one-address test sends.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never expose the service-role key to the browser.

## 5. Test before launch

1. Submit a newsletter signup with an address you control. It should remain `pending_confirmation` until the confirmation button is clicked.
2. Submit an admission application with an address you control. The application is saved immediately, but status-update campaigns must exclude it until the applicant verifies the email link.
3. Confirm the newsletter address and verify the admin subscriber view shows it as active.
4. Compose a campaign and choose Newsletter subscribers or Admission applicants. Subscriber campaigns can target interest groups; applicant campaigns can target programme and application status. Only confirmed subscribers or email-verified applicants are eligible.
5. Use the subject, headline, plain-text message, optional HTTPS image, and optional call-to-action button. Upload a JPG, PNG, or WebP image or use an image URL.
6. Optionally attach PDF, Word, PowerPoint, Excel, TXT, or CSV documents (up to 5 MB each and 8 MB total).
7. Save the draft, review the preview, and send a test message to an internal address. Check the layout on desktop and mobile, image visibility, attachments, links, sender identity, and spam folder.
8. Test confirmation, unsubscribe, and applicant email-verification links. Applicants are kept separate from newsletter marketing subscribers.
9. Start with a small audience and verify provider delivery in Brevo. Each admin action sends one batch of up to 10 and can be resumed from Campaign history.

Campaigns use a Lawrence-branded responsive HTML layout with a plain-text alternative. Documents are attached to the messages; campaign image URLs must use HTTPS. The function records per-recipient delivery status. Newsletter messages include an unsubscribe link; applicant messages are limited to verified addresses and admissions-related communication.