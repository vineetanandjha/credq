const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

initializeApp();

const db = getFirestore();
const ALERT_EMAIL = 'mortgage@credq.com.au';

const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const SMTP_FROM = defineSecret('SMTP_FROM');
const CRON_TOKEN = defineSecret('CRON_TOKEN');
// Apps Script Web App URL from scripts/google-apps-script/lead_capture.gs (deploy > new deployment > web app).
const LEADS_SHEET_WEBHOOK_URL = defineSecret('LEADS_SHEET_WEBHOOK_URL');

async function sendLeadToSheet(lead) {
  const webhookUrl = LEADS_SHEET_WEBHOOK_URL.value();
  if (!webhookUrl) {
    logger.warn('LEADS_SHEET_WEBHOOK_URL is not configured; skipping Google Sheets sync.');
    return { ok: false, reason: 'webhook_not_configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capturedAt: lead.capturedAt || '',
        firstName: lead.firstName || '',
        mobile: lead.mobile || '',
        email: lead.email || '',
        consent: Boolean(lead.consent),
        pagePath: lead.pagePath || '',
        pageTitle: lead.pageTitle || '',
        source: lead.source || ''
      })
    });

    if (!response.ok) {
      throw new Error(`webhook responded with ${response.status}`);
    }

    // Apps Script web apps return HTTP 200 even when the script caught an internal
    // error, so the real success/failure signal is in the JSON body, not the status.
    const result = await response.json().catch(() => null);
    if (!result || result.ok !== true) {
      throw new Error(`webhook reported failure: ${result?.error || 'no JSON body'}`);
    }

    return { ok: true };
  } catch (error) {
    logger.error('sendLeadToSheet failed', error);
    return { ok: false, reason: String(error) };
  }
}

function getMailerConfig() {
  const host = SMTP_HOST.value() || 'smtp.gmail.com';
  const port = Number(SMTP_PORT.value() || 465);
  const user = SMTP_USER.value();
  const pass = SMTP_PASS.value();
  const from = SMTP_FROM.value() || user || 'mortgage@credq.com.au';

  if (!host || !user || !pass) {
    return null;
  }

  return {
    transport: {
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    },
    from
  };
}

async function sendLeadEmail(subject, lines) {
  const mailerConfig = getMailerConfig();
  if (!mailerConfig) {
    logger.warn('SMTP credentials are missing; alert stored in Firestore only.');
    return { ok: false, reason: 'smtp_missing' };
  }

  const transporter = nodemailer.createTransport(mailerConfig.transport);
  await transporter.sendMail({
    from: mailerConfig.from,
    to: ALERT_EMAIL,
    subject,
    text: lines.join('\n')
  });

  return { ok: true };
}

function leadLines(lead, heading) {
  return [
    heading,
    '',
    `First name: ${lead.firstName || ''}`,
    `Mobile: ${lead.mobile || ''}`,
    `Email: ${lead.email || ''}`,
    `Page: ${lead.pagePath || ''}`,
    `Offer: ${lead.pageTitle || ''}`,
    `Captured at: ${lead.capturedAt || ''}`
  ];
}

async function processFollowups(limit = 100) {
  const nowIso = new Date().toISOString();
  const snapshot = await db
    .collection('landingLeads')
    .where('followUpDueAt', '<=', nowIso)
    .limit(limit)
    .get();

  let processed = 0;
  let sent = 0;

  for (const docSnap of snapshot.docs) {
    const lead = docSnap.data();
    if (lead.followUpStatus !== 'pending') continue;

    processed += 1;

    const subject = 'Follow-up needed: lead captured but booking may be incomplete';
    const lines = leadLines(lead, 'Lead follow-up reminder (1 hour after capture).');
    const emailResult = await sendLeadEmail(subject, lines);

    if (emailResult.ok) {
      sent += 1;
    }

    await docSnap.ref.set({
      followUpStatus: emailResult.ok ? 'sent' : 'pending',
      followUpSentAt: emailResult.ok ? FieldValue.serverTimestamp() : null,
      followUpLastError: emailResult.ok ? null : emailResult.reason
    }, { merge: true });
  }

  return { processed, sent };
}

exports.onLeadCaptured = onDocumentCreated({
  document: 'landingLeads/{leadId}',
  region: 'australia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, LEADS_SHEET_WEBHOOK_URL]
}, async (event) => {
  const lead = event.data?.data();
  const leadId = event.params.leadId;

  if (!lead) return;

  const alertRef = db.collection('leadAlerts').doc();
  await alertRef.set({
    leadId,
    type: 'instant',
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    payload: {
      firstName: lead.firstName || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      pagePath: lead.pagePath || '',
      pageTitle: lead.pageTitle || ''
    }
  });

  const emailResult = await sendLeadEmail(
    'New CredQ lead captured before Calendly',
    leadLines(lead, 'A new lead was captured from landing pages.')
  );
  const sheetResult = await sendLeadToSheet(lead);

  await alertRef.set({
    status: emailResult.ok ? 'sent' : 'queued',
    sentAt: emailResult.ok ? FieldValue.serverTimestamp() : null,
    reason: emailResult.ok ? null : emailResult.reason,
    sheetSynced: sheetResult.ok,
    sheetSyncError: sheetResult.ok ? null : sheetResult.reason
  }, { merge: true });
});

exports.runFollowupSweep = onRequest({
  region: 'australia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, CRON_TOKEN]
}, async (req, res) => {
  try {
    const expectedToken = CRON_TOKEN.value() || '';
    const providedToken = req.get('x-cron-token') || req.query.token || '';

    if (expectedToken && providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    const { processed, sent } = await processFollowups(100);

    res.status(200).json({ ok: true, processed, sent });
  } catch (error) {
    logger.error('runFollowupSweep failed', error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

exports.hourlyFollowupSweep = onSchedule({
  schedule: 'every 60 minutes',
  timeZone: 'Australia/Sydney',
  region: 'australia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM]
}, async () => {
  const result = await processFollowups(100);
  logger.info('hourlyFollowupSweep completed', result);
});

const GBP_CLIENT_ID = defineSecret('GBP_CLIENT_ID');
const GBP_CLIENT_SECRET = defineSecret('GBP_CLIENT_SECRET');
const GBP_REFRESH_TOKEN = defineSecret('GBP_REFRESH_TOKEN');
const GBP_ACCOUNT_ID = defineSecret('GBP_ACCOUNT_ID');
const GBP_LOCATION_ID = defineSecret('GBP_LOCATION_ID');

async function getGbpAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GBP_CLIENT_ID.value(),
      client_secret: GBP_CLIENT_SECRET.value(),
      refresh_token: GBP_REFRESH_TOKEN.value(),
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GBP token refresh failed with ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Publishes a "What's new" update post to Google Business Profile summarising the blog post.
async function publishGbpLocalPost(post) {
  const accessToken = await getGbpAccessToken();
  const accountId = GBP_ACCOUNT_ID.value();
  const locationId = GBP_LOCATION_ID.value();
  const uri = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`;

  const summary = String(post.excerpt || post.title || '').slice(0, 1500);

  const body = {
    languageCode: 'en-AU',
    summary,
    topicType: 'STANDARD',
    callToAction: {
      actionType: 'LEARN_MORE',
      url: post.url
    }
  };

  const response = await fetch(uri, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`GBP localPosts create failed with ${response.status}: ${JSON.stringify(responseBody)}`);
  }

  return responseBody;
}

exports.onBlogPostCreated = onDocumentCreated({
  document: 'blogPosts/{postId}',
  region: 'australia-southeast1',
  secrets: [GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN, GBP_ACCOUNT_ID, GBP_LOCATION_ID]
}, async (event) => {
  const post = event.data?.data();
  const postRef = event.data?.ref;

  if (!post || !postRef) return;

  if (post.status !== 'published' || !post.url) {
    logger.info('onBlogPostCreated skipped: post is not published or missing url', { postId: event.params.postId });
    return;
  }

  try {
    const gbpResult = await publishGbpLocalPost(post);
    await postRef.set({
      gbp: {
        status: 'published',
        postName: gbpResult?.name || null,
        publishedAt: FieldValue.serverTimestamp(),
        error: null
      }
    }, { merge: true });
  } catch (error) {
    logger.error('onBlogPostCreated: publishGbpLocalPost failed', error);
    await postRef.set({
      gbp: {
        status: 'failed',
        publishedAt: null,
        error: String(error)
      }
    }, { merge: true });
  }
});

// One-off/manual catch-up for leads captured before the Google Sheets sync existed.
exports.backfillLeadsToSheet = onRequest({
  region: 'australia-southeast1',
  secrets: [LEADS_SHEET_WEBHOOK_URL, CRON_TOKEN]
}, async (req, res) => {
  try {
    const expectedToken = CRON_TOKEN.value() || '';
    const providedToken = req.get('x-cron-token') || req.query.token || '';

    if (expectedToken && providedToken !== expectedToken) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    const snapshot = await db.collection('landingLeads').get();
    let synced = 0;
    let failed = 0;

    for (const docSnap of snapshot.docs) {
      const result = await sendLeadToSheet(docSnap.data());
      if (result.ok) {
        synced += 1;
      } else {
        failed += 1;
      }
    }

    res.status(200).json({ ok: true, total: snapshot.size, synced, failed });
  } catch (error) {
    logger.error('backfillLeadsToSheet failed', error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});
