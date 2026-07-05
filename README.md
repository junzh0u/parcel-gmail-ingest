# parcel-gmail-ingest

Adds shipping notifications from Gmail to [Parcel.app](https://parcelapp.net) automatically.

A Gmail filter labels carrier emails `parcel/inbox`; this Google Apps Script
polls that label every 15 minutes (time-driven trigger), extracts the tracking
number from the subject, adds the delivery via the
[Parcel API](https://parcelapp.net/help/api-add-delivery.html), and relabels
the thread `parcel/ingested`. Currently recognizes UPS (`1Z...` in
`UPS Ship Notification` subjects), USPS (22 digits starting `9x` in
`Expected Delivery` subjects), and FedEx (12 digits in
`Your shipment is on the way` subjects); add more carriers by extending
`TRACKING_PATTERNS` in `Code.js`
(codes: <https://api.parcel.app/external/supported_carriers.json>).

Running as an Apps Script inside the Gmail account means no OAuth client,
refresh token, or hosting to manage — authorization is a one-click grant on
first run.

## One-time setup

1. **Parcel API key** (premium only): generate at
   [web.parcelapp.net](https://web.parcelapp.net) → settings → API.
2. **Deploy**: `./deploy.sh` — first run logs in to
   [clasp](https://github.com/google/clasp) (opens a browser), creates the
   Apps Script project, and pushes the code; re-run anytime to push code
   updates. Runs clasp via `bunx`/`npx`, so no install needed. (Or paste
   `Code.js` and `appsscript.json` into a new project at
   [script.google.com](https://script.google.com) by hand.)
3. **API key**: in the Apps Script editor → Project Settings →
   Script properties → add `PARCEL_API_KEY`.
4. **Gmail filters** → apply label `parcel/inbox` (the labels are
   auto-created by the script if they don't exist yet):
   - UPS: `from:mcinfo@ups.com subject:"UPS Ship Notification"`
   - USPS: `from:auto-reply@tracking.usps.com subject:"Expected Delivery"`
   - FedEx: `from:TrackingUpdates@fedex.com subject:"Your shipment is on the way"`
5. **Install the trigger**: in the editor, run the `install` function once —
   the first run prompts for authorization and creates the 15-minute trigger.

## Notes

- The Parcel API is rate-limited to 20 requests/day (failures included), so
  each run processes at most 20 threads and rejected tracking numbers are
  relabeled rather than retried.
- Added tracking numbers are remembered in a script property (ring buffer of
  the most recent 200), so a duplicate carrier email — or a reply re-surfacing
  an already-ingested thread — never re-adds a delivery or burns the budget.
- On auth or server errors the run aborts and threads stay in `parcel/inbox`
  for the next run; check the Executions tab in the Apps Script editor.
- Newly added deliveries show "No data available" in Parcel until its server
  first polls the carrier — that's normal.
- The label names default to `parcel/inbox` / `parcel/ingested`; override them
  with `LABEL_INBOX` / `LABEL_INGESTED` script properties — no code edit needed.
- `.clasp.json` (written by `clasp create`) ties the directory to a specific
  Apps Script project in your account, so it's gitignored.
