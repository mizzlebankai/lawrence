# Newsletter go-live setup

The public signup, double opt-in, unsubscribe page, admin campaign composer, and batched Brevo sender are prepared. Signup confirmation requests are throttled by hashed IP and email buckets. Email delivery stays disabled until the Supabase function is deployed with the required secrets and a verified sender.

The Brevo branded-link subdomain is optional. Skip it for now unless Lawrence controls the domain and its DNS; do not connect a student or third-party domain to brand Lawrence messages.

## 1. Prepare Brevo

Create the Brevo account with an email address you control. Before sending to the public, add Lawrence's sending domain in Brevo and publish its SPF and DKIM records. Add a DMARC policy for the domain as well. Use a sender on that authenticated domain, such as `updates@lawrence.example`.

## 2. Apply the database schema

Run the current `schema.sql` in the Supabase SQL Editor. It is rerunnable and adds double-opt-in state, campaign/delivery tables, admin read policies, and service-only batch claim functions. Existing active subscribers with consent are retained and marked as already confirmed.

## 3. Deploy the Edge Function

Install and authenticate the Supabase CLI, link this project, then deploy the function from the repository root:

```powershell
supabase login
supabase link --project-ref ttjgkfsrkxpxeufkikma
supabase functions deploy newsletter
```

JWT verification is enabled in `config.toml`. The public site invokes the function using its public anon key; campaign actions additionally require a signed-in active admin.

## 4. Configure function secrets

Set these through Supabase Dashboard > Edge Functions > Secrets, or with the Supabase CLI. Do not put values in the HTML, JavaScript, or this file.

- `BREVO_API_KEY`: Brevo API key.
- `BREVO_SENDER_EMAIL`: sender address verified in Brevo.
- `BREVO_SENDER_NAME`: for example, `Lawrence College & SHS`.
- `PUBLIC_SITE_URL`: public HTTPS origin, with no trailing slash.
- `ALLOWED_ORIGINS`: comma-separated exact origins, for example `https://lawrence.example,http://localhost:8000`.
- `NEWSLETTER_TOKEN_SECRET`: a private random value at least 32 characters long. Generate it locally and keep it only in Supabase secrets.
- `NEWSLETTER_LIVE_SENDS`: set to `false` during setup. This is the default; it blocks campaign batches while still allowing one-address test sends.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never expose the service-role key to the browser.

## 5. Test before launch

1. Submit a signup with an address you control. It should remain `pending_confirmation` until the confirmation button is clicked.
2. Confirm the address and verify the admin subscriber view shows it as active.
3. Save a campaign draft and send a test message only to an internal address.
4. Keep `NEWSLETTER_LIVE_SENDS=false` while you verify the test email, confirmation, unsubscribe, sender identity, and content.
5. Only after sender-domain authorization and review, deliberately set `NEWSLETTER_LIVE_SENDS=true` in Supabase Function Secrets and redeploy/restart the function if Supabase requires it.
6. Send first to a small confirmed audience. Each admin action sends one batch of up to 10 and can be resumed from Campaign history.
7. Click the unsubscribe link and confirm that address is excluded from later campaigns.

Campaigns only include active, consented, confirmed subscribers. The function records per-recipient delivery status and includes unsubscribe links in both HTML and plain-text email.