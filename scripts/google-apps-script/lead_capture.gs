const SHEET_ID = '1W_DQc_-rpwWH1-W6B6aSgk7hZkqvdOSuFh3n9tyLtnw';
const SHEET_NAME = 'Leads';
const ALERT_EMAIL = 'mortgage@credq.com.au';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const sheet = getOrCreateSheet_();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Captured At',
        'First Name',
        'Mobile',
        'Email',
        'Consent',
        'Page Path',
        'Page Title',
        'Source'
      ]);
    }

    sheet.appendRow([
      payload.capturedAt || new Date().toISOString(),
      payload.firstName || '',
      payload.mobile || '',
      payload.email || '',
      payload.consent ? 'Yes' : 'No',
      payload.pagePath || '',
      payload.pageTitle || '',
      payload.source || ''
    ]);

    const subject = 'New CredQ lead captured before Calendly';
    const body = [
      'A new lead was captured from landing pages.',
      '',
      `First name: ${payload.firstName || ''}`,
      `Mobile: ${payload.mobile || ''}`,
      `Email: ${payload.email || ''}`,
      `Page: ${payload.pagePath || ''}`,
      `Offer: ${payload.pageTitle || ''}`,
      `Captured at: ${payload.capturedAt || ''}`
    ].join('\n');

    MailApp.sendEmail(ALERT_EMAIL, subject, body);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  if (existing) return existing;
  return spreadsheet.insertSheet(SHEET_NAME);
}
