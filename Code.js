/**
 * Ingest shipping-notification emails from Gmail into Parcel.app.
 *
 * Processes Gmail threads labeled parcel/inbox, extracts the tracking number
 * from the subject, adds the delivery via the Parcel API, and swaps the label
 * to parcel/ingested. Runs on a time-driven trigger (see install()).
 *
 * Required script property (Project Settings → Script properties):
 *   PARCEL_API_KEY
 */

const PARCEL_API = 'https://api.parcel.app/external/add-delivery/';

const LABEL_INBOX = 'parcel/inbox';
const LABEL_INGESTED = 'parcel/ingested';

// Per carrier: subject pattern for the tracking number, Parcel carrier code,
// and body pattern for the shipper name — first subject match wins.
// The shipper examples show getPlainBody() output, which renders bold HTML
// as *asterisks* (stripped after capture). Carrier codes:
// https://api.parcel.app/external/supported_carriers.json
const TRACKING_PATTERNS = [
  {
    // "UPS Ship Notification, Tracking Number 1Z..."
    pattern: /\b(1Z[A-Z0-9]{16})\b/,
    carrier: 'ups',
    // "... Your package is on the way! From *PENSER SC* Estimated Delivery ..."
    shipper: /From (.+?) Estimated Delivery/,
  },
  {
    // "Your shipment is on the way 872693522600"
    pattern: /\b(\d{12})\b/,
    carrier: 'fedex',
    // "... Your shipment from FITT USA, INC. is on the way. ..." — the
    // capital Y skips the preheader "... for your shipment from FITT USA,
    // INC.", which lacks the "is on the way" tail and would over-capture
    shipper: /Your shipment from (.+?) is on the way/,
  },
];

// Parcel rate limit is 20 requests/day (failures included) — cap each run
const MAX_THREADS_PER_RUN = 20;

/** Entry point for the time-driven trigger. */
function ingest() {
  const inbox = getOrCreateLabel(LABEL_INBOX);
  const ingested = getOrCreateLabel(LABEL_INGESTED);

  let added = 0;
  let skipped = 0;
  const seen = new Set();
  for (const thread of inbox.getThreads(0, MAX_THREADS_PER_RUN)) {
    for (const message of thread.getMessages()) {
      const parsed = parseMessage(message);
      if (parsed === null) {
        console.warn(`No tracking number in "${message.getSubject()}"; relabeling anyway`);
        skipped++;
      } else if (seen.has(parsed.trackingNumber)) {
        skipped++;
      } else if (addToParcel(parsed)) {
        console.log(`Added ${parsed.trackingNumber} (${parsed.carrierCode}): ${parsed.description}`);
        seen.add(parsed.trackingNumber);
        added++;
      } else {
        skipped++;
      }
    }
    thread.addLabel(ingested);
    thread.removeLabel(inbox);
  }
  console.log(`added ${added}, skipped ${skipped}`);
}

/** Extract {trackingNumber, carrierCode, description} from a message, or null. */
function parseMessage(message) {
  const subject = message.getSubject();
  for (const { pattern, carrier, shipper } of TRACKING_PATTERNS) {
    const match = subject.match(pattern);
    if (match) {
      const body = message.getPlainBody().replace(/\s+/g, ' ');
      const shipperMatch = body.match(shipper);
      return {
        trackingNumber: match[1],
        carrierCode: carrier,
        description: shipperMatch ? shipperMatch[1].replace(/\*/g, '').trim() : subject,
      };
    }
  }
  return null;
}

/**
 * Add a delivery via the Parcel API.
 *
 * Returns false when Parcel rejects the delivery (permanent — don't retry).
 * Throws on auth/rate/server errors so the run aborts and the thread stays
 * in parcel/inbox for the next run.
 */
function addToParcel({ trackingNumber, carrierCode, description }) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('PARCEL_API_KEY');
  if (!apiKey) throw new Error('Missing PARCEL_API_KEY script property');

  const response = UrlFetchApp.fetch(PARCEL_API, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': apiKey },
    payload: JSON.stringify({
      tracking_number: trackingNumber,
      carrier_code: carrierCode,
      description: description,
      send_push_confirmation: true,
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status === 400) {
    console.error(`Parcel rejected ${trackingNumber}: ${response.getContentText()}`);
    return false;
  }
  if (status !== 200) {
    throw new Error(`Parcel API HTTP ${status}: ${response.getContentText()}`);
  }
  const result = JSON.parse(response.getContentText());
  if (!result.success) {
    console.error(`Parcel API error for ${trackingNumber}: ${response.getContentText()}`);
    return false;
  }
  return true;
}

/** Return the Gmail label, creating it if missing. */
function getOrCreateLabel(name) {
  const label = GmailApp.getUserLabelByName(name);
  if (label) return label;
  console.log(`Creating Gmail label ${name}`);
  return GmailApp.createLabel(name);
}

/** Run once from the editor: (re)creates the 15-minute trigger. */
function install() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'ingest') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(15).create();
}
