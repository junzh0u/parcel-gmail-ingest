# CLAUDE.md — parcel-gmail-ingest

Google Apps Script that ingests shipping-notification emails from Gmail into
Parcel.app. Architecture, setup, and Gmail filters: see README.md.

## Deploying

- `./deploy.sh` — runs clasp via `bunx @google/clasp` (no global install);
  first run logs in, creates the Apps Script project, and opens the editor.
  `.clasp.json` is per-account state, gitignored.
- clasp 3.x renamed commands: `open` → `open-script` (`create`/`push` still
  work as aliases)
- First-deploy `clasp create` overwrites the local `appsscript.json` with the
  remote default manifest — re-check it after creating

## Gotchas

- `GmailMessage.getPlainBody()` renders bold HTML as `*asterisks*` — strip
  them when parsing
- Preheader sentences can over-capture non-greedy shipper regexes — anchor on
  sentence-case text (see the FedEx pattern comment in `Code.js`)
- The Parcel API allows 20 requests/day including failures; keep
  `MAX_THREADS_PER_RUN` in sync with that budget
- Gmail labels are thread-level — a reply re-surfaces a whole thread, so the
  label swap is not the dedup; the persisted added-tracking-numbers set
  (PropertiesService ring buffer) is

## Testing

Test parsing without deploying: stub the message
(`{getSubject: () => ..., getPlainBody: () => ...}`) and `eval` `Code.js` in a
Node harness, feeding it text extracted from a real `.eml` fixture. Simulate
`getPlainBody()` by stripping HTML comments/style/script/tags and rendering
`<b>`/`<strong>` as `*asterisks*`. Keep fixtures out of the repo — real
carrier emails contain personal addresses.
