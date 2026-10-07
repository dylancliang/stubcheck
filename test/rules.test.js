import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, smallestBandFor } from '../src/rules.js';
import { CASES, AS_OF } from '../src/fixtures.js';
import { SAMPLE_LISTING, DOC_RULES, maxIncome } from '../src/data.js';

const run = (id, rule = 'hdc', overrides = {}) =>
  evaluate({
    application: { ...CASES.find((c) => c.id === id).application, ...overrides },
    listing: SAMPLE_LISTING,
    docRule: DOC_RULES[rule],
    asOf: AS_OF,
  });

const codes = (r) => r.flags.map((f) => f.code);

test('2026 AMI table matches HPD (3-person 100% AMI = $152,700)', () => {
  assert.equal(maxIncome(100, 3), 152700);
  assert.equal(maxIncome(60, 1), 71280);
});

test('steady biweekly: eligible, no flags', () => {
  const r = run('maria');
  assert.equal(r.decision, 'eligible');
  assert.equal(r.annual, 2600 * 26);
  assert.deepEqual(codes(r), []);
});

test('semimonthly annualizes x24, not x26', () => {
  const r = run('andre');
  assert.equal(r.annual, 2900 * 24);
  assert.equal(r.decision, 'eligible');
  assert.ok(2900 * 26 > r.max, 'x26 would have wrongly put him over the limit');
});

test('methods that disagree AND change the result go to review', () => {
  const r = run('keisha');
  assert.equal(r.decision, 'needs_review');
  assert.ok(codes(r).includes('methods_change_result'));
  assert.ok(r.annual <= r.max && r.annualYtd > r.max);
});

test('two earners are combined; a near miss goes to a person, not a rejection', () => {
  const r = run('chen');
  assert.equal(r.annual, 2400 * 26 + 3300 * 12);
  assert.equal(r.preliminary, 'over');
  assert.equal(r.decision, 'needs_review');
  assert.ok(codes(r).includes('near_limit'));
});

test('same stubs, different building rule, different outcome', () => {
  assert.equal(run('sam', 'hdc').decision, 'needs_documents');
  assert.equal(run('sam', 'hpd').decision, 'eligible');
});

test('YTD that does not reconcile is flagged', () => {
  const r = run('rosa');
  assert.equal(r.decision, 'needs_review');
  assert.equal(codes(r).filter((c) => c === 'ytd_mismatch').length, 1);
});

test('voucher waives minimum income; without it, the applicant is under', () => {
  assert.equal(run('devon').decision, 'eligible');
  const noVoucher = run('devon', 'hdc', { hasRentalVoucher: false });
  assert.equal(noVoucher.decision, 'ineligible');
  assert.equal(noVoucher.preliminary, 'under');
  assert.match(noVoucher.applicantMessage, /VOUCHER/);
});

test('stale stubs and a gap become plain-language document requests', () => {
  const r = run('tanya');
  assert.equal(r.decision, 'needs_documents');
  assert.ok(codes(r).includes('stale_stub'));
  assert.ok(codes(r).includes('gap'));
  assert.ok(!codes(r).includes('ytd_mismatch'), 'YTD explains the gap, so it should not be flagged as a mismatch');
  assert.match(r.applicantMessage, /between May 29 and Jun 26/);
});

test('over-income applicants are pointed to a band they fit', () => {
  assert.equal(smallestBandFor(75000, 1), 70);
  assert.equal(smallestBandFor(1_000_000, 1), null);
});

test('every applicant gets a one-line next action for the admin queue', () => {
  assert.equal(run('sam').nextAction, 'Request 4 more stubs');
  assert.equal(run('tanya').nextAction, 'Request a current stub and the missing stub');
  assert.equal(run('chen').nextAction, 'Check for one-time pay or a pending raise');
  assert.equal(run('maria').nextAction, 'Move to full document review');
  assert.equal(run('devon', 'hdc', { hasRentalVoucher: false }).nextAction, 'Ask whether household has a voucher');
});

test('every decision has an audit trail ending in the decision', () => {
  for (const c of CASES) {
    const r = run(c.id);
    assert.equal(r.audit.at(-1).step, 'Decision');
    assert.ok(r.audit.length >= 5);
  }
});
