#!/usr/bin/env node
// Regression tests for Code.js — run with `node test.js` (or `just check`).
//
// Fixtures are sanitized: real email structure with fake tracking numbers and
// generic shipper names, never real carrier emails (they contain personal
// addresses). Bodies are what GmailMessage.getPlainBody() returns, with bold
// HTML rendered as *asterisks*.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Stub the Apps Script global referenced at Code.js top level
const store = {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => (key in store ? store[key] : null),
    setProperty: (key, value) => { store[key] = value; },
  }),
};

eval(fs.readFileSync(path.join(__dirname, 'Code.js'), 'utf8'));

const message = (subject, body) => ({
  getSubject: () => subject,
  getPlainBody: () => body,
});

const tests = [
  ['UPS ship notification', () => {
    assert.deepStrictEqual(
      parseMessage(message(
        'UPS Ship Notification, Tracking Number 1Z999AA10123456784',
        'UPS Hi Jane Doe, Your package is on the way! From *EXAMPLE SHIPPER CO* ' +
        'Estimated Delivery Thursday 07/09/2026 between 10:15 AM - 2:15 PM ' +
        'Track Your Package › Change Delivery Ship To JANE DOE 123 MAIN ST ANYTOWN, CA 90000 US ' +
        'UPS Ground 1Z999AA10123456784 *Get More Control with UPS My Choice Premium*'
      )),
      {
        trackingNumber: '1Z999AA10123456784',
        carrierCode: 'ups',
        description: 'EXAMPLE SHIPPER CO',
      }
    );
  }],

  ['USPS expected delivery', () => {
    assert.deepStrictEqual(
      parseMessage(message(
        'USPS® Expected Delivery on Thursday, July 2, 2026 arriving by 9:00pm 9400100000000000000000',
        'Hello **, USPS expects to deliver your package on Thursday, July 2, 2026 arriving by 9:00pm. ' +
        'Tracking Number: 9400100000000000000000 Package Shipped from: *STAMPS.COM* ' +
        '*Expected Delivery On* * 2 * * July * *By 9:00pm*'
      )),
      {
        trackingNumber: '9400100000000000000000',
        carrierCode: 'usps',
        description: 'STAMPS.COM',
      }
    );
  }],

  ['FedEx ship notification, preheader must not over-capture', () => {
    assert.deepStrictEqual(
      parseMessage(message(
        'Your shipment is on the way 872600000000',
        // The preheader repeats "your shipment from ..." without the "is on
        // the way" tail — the sentence-case anchor must skip it (see the
        // pattern comment in Code.js)
        'FedEx We have a scheduled delivery date for your shipment from EXAMPLE FULFILLMENT. ' +
        'Hi, Jane Doe. Your shipment from EXAMPLE FULFILLMENT is on the way. ' +
        'Scheduled delivery date Will be updated soon Take more control of your shipments *MANAGE DELIVERY* ' +
        'Tracking details Tracking ID *872600000000* ' +
        'From EXAMPLE FULFILLMENT 100 COMMERCE WAY ANYTOWN, CA, US 900001234 ' +
        'To Jane Doe 123 MAIN ST ANYTOWN, CA, US 900001234 Ship date Sun 6/28/2026 12:00 AM'
      )),
      {
        trackingNumber: '872600000000',
        carrierCode: 'fedex',
        description: 'EXAMPLE FULFILLMENT',
      }
    );
  }],

  ['description falls back to subject when shipper missing', () => {
    const subject = 'UPS Ship Notification, Tracking Number 1Z999AA10123456784';
    assert.deepStrictEqual(parseMessage(message(subject, 'No shipper line here.')), {
      trackingNumber: '1Z999AA10123456784',
      carrierCode: 'ups',
      description: subject,
    });
  }],

  ['unrecognized subject returns null', () => {
    assert.strictEqual(parseMessage(message('Your Amazon order has shipped', 'Order #123-4567890')), null);
  }],

  ['added-set persists and ring-buffers to MAX_TRACKED', () => {
    saveAdded(new Set(Array.from({ length: 250 }, (_, i) => `N${i}`)));
    const loaded = loadAdded();
    assert.strictEqual(loaded.size, 200);
    assert.ok(loaded.has('N249'), 'keeps most recent');
    assert.ok(!loaded.has('N49'), 'drops oldest');
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}
console.log(failed ? `${failed}/${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
