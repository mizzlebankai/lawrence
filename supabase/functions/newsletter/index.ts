import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || '').replace(/\/$/, '');
const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || '';
const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'Lawrence College & SHS';
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || siteUrl)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const interests = new Set(['general', 'shs', 'remedial', 'college']);
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

async function sendEmail(to: string, subject: string, textContent: string, htmlContent?: string) {
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
      ...(htmlContent ? { htmlContent } : {})
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
  const interestArea = String(payload.interest_area || 'general');
  if (subject.length < 3 || subject.length > 150) throw new Response('Subject must be between 3 and 150 characters.', { status: 400 });
  if (!bodyText || bodyText.length > 12000) throw new Response('Message must be between 1 and 12,000 characters.', { status: 400 });
  if (!interests.has(interestArea)) throw new Response('Select a valid recipient group.', { status: 400 });

  const { data, error } = await service.from('newsletter_campaigns').insert({
    subject,
    body_text: bodyText,
    interest_area: interestArea,
    created_by: userId,
    status: 'draft'
  }).select('id, subject, interest_area, status, created_at').single();
  if (error) throw error;
  return { ok: true, campaign: data };
}

async function sendTest(payload: Record<string, unknown>) {
  const email = String(payload.email || '').trim().toLowerCase();
  const campaignId = String(payload.campaign_id || '');
  if (!validEmail(email)) throw new Response('Enter a valid test recipient email.', { status: 400 });
  const { data: campaign, error } = await service.from('newsletter_campaigns').select('subject, body_text').eq('id', campaignId).maybeSingle();
  if (error) throw error;
  if (!campaign) throw new Response('Campaign not found.', { status: 404 });
  const messageId = await sendEmail(email, `[TEST] ${campaign.subject}`, campaign.body_text);
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
      const unsubscribeToken = await unsubscribeTokenFor(delivery.subscriber_id);
      const { error: tokenError } = await service.from('newsletter_subscribers')
        .update({ unsubscribe_token_hash: await sha256(unsubscribeToken) })
        .eq('id', delivery.subscriber_id);
      if (tokenError) throw tokenError;

      const unsubscribeUrl = `${siteUrl}/newsletter-action.html?action=unsubscribe&token=${encodeURIComponent(unsubscribeToken)}`;
      const safeName = escapeHtml(delivery.full_name || 'there');
      const safeBody = escapeHtml(campaign.body_text).replaceAll('\n', '<br>');
      const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
      const htmlContent = `<p>Hello ${safeName},</p><div>${safeBody}</div><p style="margin-top:32px;font-size:12px;color:#666">You received this because you subscribed to Lawrence updates. <a href="${safeUnsubscribeUrl}">Unsubscribe</a>.</p>`;
      const textContent = `${campaign.body_text}\n\nYou received this because you subscribed to Lawrence updates. Unsubscribe: ${unsubscribeUrl}`;
      const messageId = await sendEmail(delivery.email, campaign.subject, textContent, htmlContent);
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