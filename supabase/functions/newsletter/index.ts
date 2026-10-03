import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || '').replace(/\/$/, '');
const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || '';
const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'Lawrence College & SHS';
const allowedOrigins = [
  ...((Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((origin) => origin.trim())),
  siteUrl
].filter(Boolean);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const interests = new Set(['general', 'shs', 'remedial', 'college']);
const audienceTypes = new Set(['subscribers', 'applicants']);
const applicantStatuses = new Set(['all', 'submitted', 'in_review', 'waitlisted', 'accepted', 'rejected']);
const allowedStatuses = new Set(['active', 'unsubscribed', 'bounced']);

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : '';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(allowedOrigin ? {
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
        'access-control-allow-methods': 'POST, OPTIONS',
        'vary': 'Origin'
      } : {})
    }
  });
}

function preflightResponse(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : '';
  return new Response(null, {
    status: 204,
    headers: {
      ...(allowedOrigin ? {
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
        'access-control-allow-methods': 'POST, OPTIONS',
        'vary': 'Origin'
      } : {})
    }
  });
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function unsubscribeTokenFor(subscriberId: string) {
  const secret = Deno.env.get('NEWSLETTER_TOKEN_SECRET');
  if (!secret || secret.length < 32) throw new Error('Newsletter token secret is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`newsletter-unsubscribe:${subscriberId}`));
  return base64Url(new Uint8Array(signature));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] || character);
}

const attachmentMimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv'
};
const maxCampaignAttachmentBytes = 8 * 1024 * 1024;

type NewsletterCampaignEmail = {
  subject: string;
  body_text: string;
  headline: string | null;
  image_url: string | null;
  image_alt: string;
  button_label: string | null;
  button_url: string | null;
  audience_type?: string;
};

function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 2048) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderCampaignEmail(campaign: NewsletterCampaignEmail, recipientName: string, unsubscribeUrl: string | null, isTest = false) {
  const headline = String(campaign.headline || campaign.subject);
  const bodyText = String(campaign.body_text || '');
  const safeName = escapeHtml(recipientName || 'there');
  const safeHeadline = escapeHtml(headline);
  const safeBody = escapeHtml(bodyText).replace(/\r?\n/g, '<br>');
  const safeUnsubscribeUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : '';
  const imageUrl = campaign.image_url ? safeHttpsUrl(String(campaign.image_url)) : null;
  if (campaign.image_url && !imageUrl) throw new Error('Campaign image URL must use HTTPS.');
  const imageAlt = escapeHtml(String(campaign.image_alt || headline));
  const buttonLabel = String(campaign.button_label || '');
  const buttonUrl = campaign.button_url ? safeHttpsUrl(String(campaign.button_url)) : null;
  if (Boolean(buttonLabel) !== Boolean(campaign.button_url) || (campaign.button_url && !buttonUrl)) {
    throw new Error('Campaign button needs both a label and a valid HTTPS URL.');
  }

  const logoUrl = escapeHtml(`${siteUrl}/assets/lawrence-logo.png`);
  const imageBlock = imageUrl
    ? `<tr><td style="padding:0 32px 24px"><img src="${escapeHtml(imageUrl)}" alt="${imageAlt}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px"></td></tr>`
    : '';
  const buttonBlock = buttonUrl
    ? `<tr><td align="center" style="padding:8px 32px 32px"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 24px;background:#b79452;color:#142d4c;text-decoration:none;font-weight:bold;border-radius:4px">${escapeHtml(buttonLabel)}</a></td></tr>`
    : '';
  const footerHtml = isTest
    ? 'This is a test email sent to preview the Lawrence newsletter template.'
    : unsubscribeUrl
    ? `You received this because you subscribed to Lawrence updates. <a href="${safeUnsubscribeUrl}" style="color:#142d4c">Unsubscribe</a>.`
    : campaign.audience_type === 'applicants'
      ? 'You received this because you applied to Lawrence College &amp; SHS and verified this email address. This message relates to admissions.'
      : 'This is a test email sent to preview the Lawrence newsletter template.';
  const htmlContent = `<!doctype html><html lang="en"><body style="margin:0;padding:24px 8px;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#293746"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border-collapse:collapse"><tr><td style="padding:24px 32px;background:#142d4c;border-bottom:4px solid #b79452"><img src="${logoUrl}" alt="Lawrence College &amp; SHS" width="58" height="58" style="display:block;width:58px;height:58px;object-fit:contain"><p style="margin:12px 0 0;color:#fff;font-size:13px;letter-spacing:1px">LAWRENCE COLLEGE &amp; SHS</p></td></tr>${imageBlock}<tr><td style="padding:8px 32px 0"><p style="margin:0 0 12px;color:#6b7280;font-size:14px">Hello ${safeName},</p><h1 style="margin:0 0 20px;color:#142d4c;font-size:26px;line-height:1.25">${safeHeadline}</h1><div style="font-size:16px;line-height:1.7">${safeBody}</div></td></tr>${buttonBlock}<tr><td style="padding:20px 32px;background:#f3f5f7;color:#667085;font-size:12px;line-height:1.6">${footerHtml}</td></tr></table></body></html>`;
  const footerText = isTest
    ? 'This is a test email sent to preview the Lawrence newsletter template.'
    : unsubscribeUrl
    ? `You received this because you subscribed to Lawrence updates. Unsubscribe: ${unsubscribeUrl}`
    : campaign.audience_type === 'applicants'
      ? 'You received this because you applied to Lawrence College & SHS and verified this email address. This message relates to admissions.'
      : 'This is a test email sent to preview the Lawrence newsletter template.';
  const textContent = `Hello ${recipientName || 'there'},\n\n${headline}\n\n${bodyText}${buttonUrl ? `\n\n${buttonLabel}: ${buttonUrl}` : ''}\n\n${footerText}`;
  return { htmlContent, textContent };
}

async function loadCampaignAttachments(campaignId: string) {
  const { data, error } = await service
    .from('newsletter_campaign_attachments')
    .select('storage_path, file_name, mime_type, file_size')
    .eq('campaign_id', campaignId);
  if (error) throw error;

  const rows = data || [];
  const recordedTotal = rows.reduce((total, file) => total + Number(file.file_size || 0), 0);
  if (recordedTotal > maxCampaignAttachmentBytes) throw new Error('Campaign attachments exceed the 8 MB total limit.');

  const attachments = [];
  let actualTotal = 0;
  for (const file of rows) {
    const fileName = String(file.file_name || '');
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeType = attachmentMimeTypes[extension];
    if (!mimeType || mimeType !== file.mime_type || !file.storage_path.startsWith(`campaigns/${campaignId}/`)) {
      throw new Error('Campaign contains an invalid attachment record.');
    }

    const { data: blob, error: downloadError } = await service.storage
      .from('newsletter-attachments')
      .download(file.storage_path);
    if (downloadError) throw downloadError;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== Number(file.file_size) || bytes.length > 5 * 1024 * 1024) {
      throw new Error('Campaign attachment size does not match its stored metadata.');
    }
    actualTotal += bytes.length;
    if (actualTotal > maxCampaignAttachmentBytes) throw new Error('Campaign attachments exceed the 8 MB total limit.');

    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    attachments.push({
      name: fileName.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'newsletter-document',
      content: btoa(binary)
    });
  }
  return attachments;
}

async function sendEmail(
  to: string,
  subject: string,
  textContent: string,
  htmlContent?: string,
  attachments: Array<{ name: string; content: string }> = []
) {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey || !senderEmail || !validEmail(senderEmail)) {
    throw new Error('Brevo sender configuration is incomplete.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      textContent,
      ...(htmlContent ? { htmlContent } : {}),
      ...(attachments.length ? { attachment: attachments } : {})
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error('Brevo email request failed:', response.status, responseText.slice(0, 500));
    throw new Error(`Email provider returned ${response.status}.`);
  }

  const result = await response.json().catch(() => ({}));
  return typeof result.messageId === 'string' ? result.messageId : null;
}

async function consumePublicRateLimits(request: Request, email: string, scope: string, emailLimit: number) {
  const forwardedIps = request.headers.get('x-forwarded-for') || '';
  const requesterIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || forwardedIps.split(',')[0].trim();
  const rateBuckets = [
    ...(requesterIp ? [{ key: `${scope}:ip:${requesterIp}`, max: 10 }] : []),
    { key: `${scope}:email:${email}`, max: emailLimit }
  ];
  for (const bucket of rateBuckets) {
    const { data: allowed, error } = await service.rpc('consume_newsletter_signup_limit', {
      p_bucket_hash: await sha256(bucket.key),
      p_max_attempts: bucket.max,
      p_window_seconds: 3600
    });
    if (error) throw error;
    if (!allowed) throw new Response('Too many attempts. Please try again later.', { status: 429 });
  }
}

async function sendApplicationVerification(application: { id: string; applicant_name: string; email: string }, token: string) {
  if (!siteUrl) throw new Error('Public site URL is not configured.');
  const confirmationUrl = `${siteUrl}/newsletter-action.html?action=verify_application_email&token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(application.applicant_name);
  const safeUrl = escapeHtml(confirmationUrl);
  await sendEmail(
    application.email,
    'Verify your email for Lawrence admissions updates',
    `Hello ${application.applicant_name},\n\nPlease verify this email address to receive admission status updates for your Lawrence College & SHS application: ${confirmationUrl}\n\nIf you did not apply, you can ignore this email.`,
    `<p>Hello ${safeName},</p><p>Please verify this email address to receive admission status updates for your Lawrence College &amp; SHS application.</p><p><a href="${safeUrl}">Verify my email address</a></p><p>If you did not apply, you can ignore this email.</p>`
  );
}

async function submitApplication(payload: Record<string, unknown>, request: Request) {
  const application = payload.application as Record<string, unknown> | undefined;
  if (!application || typeof application !== 'object' || Array.isArray(application)) {
    throw new Response('Application details are required.', { status: 400 });
  }
  const email = String(application.email || '').trim().toLowerCase();
  const applicantName = String(application.applicant_name || '').trim().slice(0, 160);
  const referenceNumber = String(application.reference_number || '').trim();
  const programType = String(application.program_type || '');
  const validPrograms = new Set(['shs', 'remedial', 'college']);
  if (String(payload.website || '').trim()) return { ok: true, message: 'Application received.' };
  if (!validEmail(email)) throw new Response('Enter a working email address.', { status: 400 });
  if (!applicantName || !validPrograms.has(programType)) throw new Response('Check the required application details.', { status: 400 });
  if (!/^L(?:SHS|REM|COL)-\d{4}-\d{4}$/.test(referenceNumber)) throw new Response('Application reference is invalid.', { status: 400 });
  if (application.consent_given !== true) throw new Response('Application consent is required.', { status: 400 });
  const formData = application.form_data;
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    throw new Response('Application form details are invalid.', { status: 400 });
  }

  await consumePublicRateLimits(request, email, 'application', 3);
  const token = randomToken();
  const { data: savedApplication, error } = await service.from('applications').insert({
    reference_number: referenceNumber,
    program_type: programType,
    applicant_name: applicantName,
    email,
    phone: String(application.phone || '').trim().slice(0, 40) || null,
    guardian_name: String(application.guardian_name || '').trim().slice(0, 160) || null,
    guardian_phone: String(application.guardian_phone || '').trim().slice(0, 40) || null,
    status: programType === 'college' ? 'waitlisted' : 'submitted',
    intake_year: Number(application.intake_year) || null,
    form_data: formData,
    email_verification_token_hash: await sha256(token),
    email_verification_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  }).select('id, reference_number, submitted_at').single();
  if (error) throw error;

  let verificationSent = false;
  try {
    await sendApplicationVerification({ id: savedApplication.id, applicant_name: applicantName, email }, token);
    verificationSent = true;
  } catch (error) {
    console.error('Application verification email failed:', savedApplication.id, error instanceof Error ? error.message : error);
  }
  return {
    ok: true,
    application: {
      reference_number: savedApplication.reference_number,
      submitted_at: savedApplication.submitted_at
    },
    verification_sent: verificationSent
  };
}

async function verifyApplicationEmail(token: string) {
  if (token.length < 32 || token.length > 200) throw new Response('This verification link is invalid or expired.', { status: 400 });
  const { data: application, error } = await service.from('applications')
    .select('id')
    .eq('email_verification_token_hash', await sha256(token))
    .gt('email_verification_expires_at', new Date().toISOString())
    .is('email_verified_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!application) throw new Response('This verification link is invalid, expired, or already used.', { status: 400 });

  const { error: updateError } = await service.from('applications').update({
    email_verified_at: new Date().toISOString(),
    email_verification_token_hash: null,
    email_verification_expires_at: null
  }).eq('id', application.id);
  if (updateError) throw updateError;
  return { ok: true, message: 'Your email is verified. Lawrence can now send admission status updates to this address.' };
}

async function resendApplicationVerification(payload: Record<string, unknown>, request: Request) {
  const email = String(payload.email || '').trim().toLowerCase();
  const referenceNumber = String(payload.reference_number || '').trim();
  if (!validEmail(email) || !referenceNumber) throw new Response('Enter the application email and reference number.', { status: 400 });
  await consumePublicRateLimits(request, email, 'application-verification', 3);

  const { data: application, error } = await service.from('applications')
    .select('id, applicant_name, email, email_verified_at')
    .eq('reference_number', referenceNumber)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!application || application.email_verified_at) {
    return { ok: true, message: 'If the application is eligible, a verification link has been sent.' };
  }

  const token = randomToken();
  const { error: updateError } = await service.from('applications').update({
    email_verification_token_hash: await sha256(token),
    email_verification_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  }).eq('id', application.id);
  if (updateError) throw updateError;
  await sendApplicationVerification(application, token);
  return { ok: true, message: 'A new verification link has been sent. Check your inbox.' };
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new Response('Sign in as an active administrator.', { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) throw new Response('Sign in as an active administrator.', { status: 401 });

  const { data: admin, error: adminError } = await service
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (adminError || !admin) throw new Response('Administrator access is required.', { status: 403 });
  return user;
}

async function subscribe(payload: Record<string, unknown>, request: Request) {
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.full_name || '').trim().slice(0, 120) || null;
  const interestArea = String(payload.interest_area || 'general');
  if (String(payload.website || '').trim()) return { ok: true, message: 'Check your inbox for a confirmation link.' };
  if (!validEmail(email)) throw new Response('Enter a valid email address.', { status: 400 });
  if (payload.consent_given !== true) throw new Response('Consent is required to subscribe.', { status: 400 });
  if (!interests.has(interestArea)) throw new Response('Select a valid interest area.', { status: 400 });
  if (!siteUrl) throw new Error('Public site URL is not configured.');

  const forwardedIps = request.headers.get('x-forwarded-for') || '';
  const requesterIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || forwardedIps.split(',')[0].trim();
  const rateBuckets = [
    ...(requesterIp ? [{ key: `ip:${requesterIp}`, max: 10 }] : []),
    { key: `email:${email}`, max: 3 }
  ];
  for (const bucket of rateBuckets) {
    const { data: allowed, error: rateError } = await service.rpc('consume_newsletter_signup_limit', {
      p_bucket_hash: await sha256(bucket.key),
      p_max_attempts: bucket.max,
      p_window_seconds: 3600
    });
    if (rateError) throw rateError;
    if (!allowed) throw new Response('Too many signup attempts. Please try again later.', { status: 429 });
  }

  const { data: existing, error: lookupError } = await service
    .from('newsletter_subscribers')
    .select('id, status, confirmed_at')
    .eq('email', email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.status === 'active' && existing.confirmed_at) {
    return { ok: true, message: 'If this address needs confirmation, check its inbox.' };
  }

  const confirmationToken = randomToken();
  const { data: subscriber, error: upsertError } = await service
    .from('newsletter_subscribers')
    .upsert({
      ...(existing?.id ? { id: existing.id } : {}),
      full_name: fullName,
      email,
      interest_area: interestArea,
      consent_given: true,
      status: 'pending_confirmation',
      subscribed_at: new Date().toISOString(),
      confirmed_at: null,
      confirmation_token_hash: await sha256(confirmationToken),
      confirmation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'email' })
    .select('id')
    .single();
  if (upsertError) throw upsertError;

  const unsubscribeToken = await unsubscribeTokenFor(subscriber.id);
  const { error: tokenError } = await service
    .from('newsletter_subscribers')
    .update({ unsubscribe_token_hash: await sha256(unsubscribeToken) })
    .eq('id', subscriber.id);
  if (tokenError) throw tokenError;

  const confirmationUrl = `${siteUrl}/newsletter-action.html?action=confirm&token=${encodeURIComponent(confirmationToken)}`;
  const safeUrl = escapeHtml(confirmationUrl);
  await sendEmail(
    email,
    'Confirm your Lawrence updates subscription',
    `Please confirm your subscription to Lawrence updates by opening this link: ${confirmationUrl}\n\nIf you did not request this, you can ignore this email.`,
    `<p>Please confirm your subscription to Lawrence updates.</p><p><a href="${safeUrl}">Confirm my subscription</a></p><p>If you did not request this, you can ignore this email.</p>`
  );
  return { ok: true, message: 'Check your inbox for a confirmation link.' };
}

async function confirmSubscription(token: string) {
  if (token.length < 32 || token.length > 200) throw new Response('This confirmation link is invalid or expired.', { status: 400 });
  const tokenHash = await sha256(token);
  const { data: subscriber, error } = await service
    .from('newsletter_subscribers')
    .select('id')
    .eq('confirmation_token_hash', tokenHash)
    .eq('status', 'pending_confirmation')
    .gt('confirmation_expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!subscriber) throw new Response('This confirmation link is invalid or has already been used.', { status: 400 });

  const { error: updateError } = await service
    .from('newsletter_subscribers')
    .update({ status: 'active', confirmed_at: new Date().toISOString(), confirmation_token_hash: null, confirmation_expires_at: null })
    .eq('id', subscriber.id);
  if (updateError) throw updateError;
  return { ok: true, message: 'Your Lawrence updates subscription is confirmed.' };
}

async function unsubscribe(token: string) {
  if (token.length < 32 || token.length > 200) throw new Response('This unsubscribe link is invalid.', { status: 400 });
  const tokenHash = await sha256(token);
  const { data: subscriber, error } = await service
    .from('newsletter_subscribers')
    .select('id')
    .eq('unsubscribe_token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!subscriber) throw new Response('This unsubscribe link is invalid.', { status: 400 });

  const { error: updateError } = await service
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed' })
    .eq('id', subscriber.id);
  if (updateError) throw updateError;
  return { ok: true, message: 'You have been unsubscribed from Lawrence updates.' };
}

async function createCampaign(payload: Record<string, unknown>, userId: string) {
  const subject = String(payload.subject || '').trim();
  const bodyText = String(payload.body_text || '').trim();
  const headline = String(payload.headline || '').trim() || null;
  const imageUrlValue = String(payload.image_url || '').trim();
  const imageUrl = safeHttpsUrl(imageUrlValue);
  const imageAlt = String(payload.image_alt || '').trim().slice(0, 200);
  const buttonLabelValue = String(payload.button_label || '').trim();
  const buttonUrlValue = String(payload.button_url || '').trim();
  const buttonUrl = safeHttpsUrl(buttonUrlValue);
  const interestArea = String(payload.interest_area || 'general');
  const audienceType = String(payload.audience_type || 'subscribers');
  const applicantStatus = String(payload.applicant_status || 'all');
  if (subject.length < 3 || subject.length > 150) throw new Response('Subject must be between 3 and 150 characters.', { status: 400 });
  if (!bodyText || bodyText.length > 12000) throw new Response('Message must be between 1 and 12,000 characters.', { status: 400 });
  if (headline && headline.length > 150) throw new Response('Headline must be 150 characters or fewer.', { status: 400 });
  if (imageUrlValue && !imageUrl) throw new Response('Choose a valid HTTPS image URL.', { status: 400 });
  if (Boolean(buttonLabelValue) !== Boolean(buttonUrlValue) || (buttonUrlValue && !buttonUrl)) {
    throw new Response('Provide both a button label and a valid HTTPS button URL.', { status: 400 });
  }
  if (buttonLabelValue.length > 60) throw new Response('Button label must be 60 characters or fewer.', { status: 400 });
  if (!interests.has(interestArea)) throw new Response('Select a valid recipient group.', { status: 400 });
  if (!audienceTypes.has(audienceType)) throw new Response('Select a valid audience.', { status: 400 });
  if (!applicantStatuses.has(applicantStatus)) throw new Response('Select a valid applicant status.', { status: 400 });

  const { data, error } = await service.from('newsletter_campaigns').insert({
    subject,
    body_text: bodyText,
    headline,
    image_url: imageUrl,
    image_alt: imageAlt,
    button_label: buttonLabelValue || null,
    button_url: buttonUrl,
    audience_type: audienceType,
    interest_area: interestArea,
    applicant_status: applicantStatus,
    created_by: userId,
    status: 'draft'
  }).select('id, subject, audience_type, interest_area, applicant_status, status, created_at').single();
  if (error) throw error;
  return { ok: true, campaign: data };
}

async function sendTest(payload: Record<string, unknown>) {
  const email = String(payload.email || '').trim().toLowerCase();
  const campaignId = String(payload.campaign_id || '');
  if (!validEmail(email)) throw new Response('Enter a valid test recipient email.', { status: 400 });
  const { data: campaign, error } = await service.from('newsletter_campaigns')
    .select('subject, body_text, headline, image_url, image_alt, button_label, button_url, audience_type')
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) throw new Response('Campaign not found.', { status: 404 });
  const attachments = await loadCampaignAttachments(campaignId);
  const { htmlContent, textContent } = renderCampaignEmail(campaign, '', null, true);
  const messageId = await sendEmail(email, `[TEST] ${campaign.subject}`, textContent, htmlContent, attachments);
  return { ok: true, message_id: messageId };
}

function requireLiveSending() {
  if (Deno.env.get('NEWSLETTER_LIVE_SENDS') !== 'true') {
    throw new Response('Live campaign sending is disabled. Test emails are still available.', { status: 403 });
  }
}

async function sendCampaign(payload: Record<string, unknown>) {
  requireLiveSending();
  const campaignId = String(payload.campaign_id || '');
  const { data: campaign, error: campaignError } = await service.from('newsletter_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new Response('Campaign not found.', { status: 404 });
  const attachments = await loadCampaignAttachments(campaignId);
  if (campaign.status === 'draft') {
    const { data: preparedCount, error: prepareError } = await service.rpc('prepare_newsletter_campaign', { p_campaign_id: campaignId });
    if (prepareError) throw prepareError;
    if (!preparedCount) {
      const { error: emptyError } = await service.from('newsletter_campaigns')
        .update({ status: 'no_recipients', recipient_count: 0, completed_at: new Date().toISOString() })
        .eq('id', campaignId);
      if (emptyError) throw emptyError;
      return { ok: true, status: 'no_recipients', sent_count: 0, failed_count: 0, recipient_count: 0 };
    }
  } else if (campaign.status !== 'sending') {
    return { ok: true, status: campaign.status, sent_count: campaign.sent_count, failed_count: campaign.failed_count };
  }

  const { data: deliveries, error: claimError } = await service.rpc('claim_newsletter_campaign_deliveries', {
    p_campaign_id: campaignId,
    p_limit: 10
  });
  if (claimError) throw claimError;

  for (const delivery of deliveries || []) {
    try {
      let unsubscribeUrl: string | null = null;
      if (delivery.subscriber_id) {
        const unsubscribeToken = await unsubscribeTokenFor(delivery.subscriber_id);
        const { error: tokenError } = await service.from('newsletter_subscribers')
          .update({ unsubscribe_token_hash: await sha256(unsubscribeToken) })
          .eq('id', delivery.subscriber_id);
        if (tokenError) throw tokenError;
        unsubscribeUrl = `${siteUrl}/newsletter-action.html?action=unsubscribe&token=${encodeURIComponent(unsubscribeToken)}`;
      }
      const { htmlContent, textContent } = renderCampaignEmail(campaign, delivery.full_name || '', unsubscribeUrl);
      const messageId = await sendEmail(delivery.email, campaign.subject, textContent, htmlContent, attachments);
      const { error: sentError } = await service.from('newsletter_campaign_deliveries').update({
        status: 'sent', provider_message_id: messageId, sent_at: new Date().toISOString(), last_error: null
      }).eq('id', delivery.id);
      if (sentError) throw sentError;
    } catch (error) {
      console.error('Newsletter delivery failed:', delivery.id, error instanceof Error ? error.message : error);
      await service.from('newsletter_campaign_deliveries').update({
        status: 'failed', last_error: error instanceof Error ? error.message.slice(0, 400) : 'Delivery failed'
      }).eq('id', delivery.id);
    }
  }

  const [{ count: queuedCount, error: queuedError }, { count: sendingCount, error: sendingError }, { count: sentCount, error: sentError }, { count: failedCount, error: failedError }] = await Promise.all([
    service.from('newsletter_campaign_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'queued'),
    service.from('newsletter_campaign_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'sending'),
    service.from('newsletter_campaign_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'sent'),
    service.from('newsletter_campaign_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'failed')
  ]);
  if (queuedError || sendingError || sentError || failedError) throw queuedError || sendingError || sentError || failedError;

  const stillSending = (queuedCount || 0) > 0 || (sendingCount || 0) > 0;
  const finalStatus = stillSending ? 'sending' : (failedCount || 0) > 0 ? ((sentCount || 0) > 0 ? 'partial' : 'failed') : 'sent';
  const { error: updateError } = await service.from('newsletter_campaigns').update({
    status: finalStatus,
    sent_count: sentCount || 0,
    failed_count: failedCount || 0,
    ...(!stillSending ? { completed_at: new Date().toISOString() } : {})
  }).eq('id', campaignId);
  if (updateError) throw updateError;

  return {
    ok: true,
    status: finalStatus,
    sent_count: sentCount || 0,
    failed_count: failedCount || 0,
    recipient_count: (queuedCount || 0) + (sendingCount || 0) + (sentCount || 0) + (failedCount || 0)
  };
}

async function retryFailedCampaign(payload: Record<string, unknown>) {
  requireLiveSending();
  const campaignId = String(payload.campaign_id || '');
  const { data: campaign, error: campaignError } = await service
    .from('newsletter_campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new Response('Campaign not found.', { status: 404 });
  if (!['partial', 'failed'].includes(campaign.status)) {
    throw new Response('Only partially or fully failed campaigns can retry failed recipients.', { status: 409 });
  }

  const { count, error: retryError } = await service.from('newsletter_campaign_deliveries')
    .update({ status: 'queued', last_error: null })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')
    .select('id', { count: 'exact', head: true });
  if (retryError) throw retryError;
  if (!count) return { ok: true, status: campaign.status, sent_count: 0, failed_count: 0 };

  const { error: statusError } = await service.from('newsletter_campaigns')
    .update({ status: 'sending', failed_count: 0, completed_at: null })
    .eq('id', campaignId);
  if (statusError) throw statusError;
  return await sendCampaign({ campaign_id: campaignId });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return preflightResponse(origin);
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

  try {
    const payload = await request.json();
    const action = String(payload.action || '');
    let result: unknown;

    if (action === 'subscribe') {
      result = await subscribe(payload, request);
    } else if (action === 'confirm') {
      result = await confirmSubscription(String(payload.token || ''));
    } else if (action === 'unsubscribe') {
      result = await unsubscribe(String(payload.token || ''));
    } else if (action === 'submit_application') {
      result = await submitApplication(payload, request);
    } else if (action === 'resend_application_verification') {
      result = await resendApplicationVerification(payload, request);
    } else if (action === 'verify_application_email') {
      result = await verifyApplicationEmail(String(payload.token || ''));
    } else if (['get_mode', 'create_campaign', 'send_test', 'send_campaign', 'retry_failed'].includes(action)) {
      const user = await requireAdmin(request);
      result = action === 'get_mode'
        ? { ok: true, live_sends_enabled: Deno.env.get('NEWSLETTER_LIVE_SENDS') === 'true' }
        : action === 'create_campaign'
          ? await createCampaign(payload, user.id)
          : action === 'send_test'
            ? await sendTest(payload)
            : action === 'retry_failed'
              ? await retryFailedCampaign(payload)
              : await sendCampaign(payload);
    } else {
      throw new Response('Unknown newsletter action.', { status: 400 });
    }

    return jsonResponse(result, 200, origin);
  } catch (error) {
    if (error instanceof Response) return jsonResponse({ error: await error.text() }, error.status, origin);
    console.error('Newsletter function failed:', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'The newsletter request could not be completed.' }, 500, origin);
  }
});