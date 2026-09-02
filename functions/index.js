const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const db = admin.firestore();
const ALERT_EMAIL = 'mortgage@credq.com.au';

const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const SMTP_FROM = defineSecret('SMTP_FROM');
const CRON_TOKEN = defineSecret('CRON_TOKEN');

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
      followUpSentAt: emailResult.ok ? admin.firestore.FieldValue.serverTimestamp() : null,
      followUpLastError: emailResult.ok ? null : emailResult.reason
    }, { merge: true });
  }

  return { processed, sent };
}

exports.onLeadCaptured = onDocumentCreated({
  document: 'landingLeads/{leadId}',
  region: 'australia-southeast1',
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM]
}, async (event) => {
  const lead = event.data?.data();
  const leadId = event.params.leadId;

  if (!lead) return;

  const alertRef = db.collection('leadAlerts').doc();
  await alertRef.set({
    leadId,
    type: 'instant',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

  await alertRef.set({
    status: emailResult.ok ? 'sent' : 'queued',
    sentAt: emailResult.ok ? admin.firestore.FieldValue.serverTimestamp() : null,
    reason: emailResult.ok ? null : emailResult.reason
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
