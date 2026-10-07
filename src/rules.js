// stubcheck rules engine.
// Pure functions, no dependencies: runs in the browser and in Node.
// Input is pay-stub data that has already been extracted (by Claude vision in
// extract/, or typed by an agent). Output is a decision an agent can trust
// because every step is written to an audit trail.

import {
  PERIODS_PER_YEAR,
  EXPECTED_GAP_DAYS,
  AMI_2026,
  maxIncome,
} from './data.js';

const DAY_MS = 86_400_000;

export const SOURCES = {
  annualize: 'HUD Handbook 4350.3, Ch. 5 (annualizing earned income)',
  ami: 'NYC HPD 2026 AMI chart',
  docRule: 'Building document rule (see DOC_RULES)',
  listing: 'Lottery listing terms',
  voucher: 'Housing Connect listings: voucher holders are not held to minimum income (confirm per listing)',
  internal: 'stubcheck consistency check',
};

export const DECISIONS = {
  eligible: 'Likely eligible',
  ineligible: 'Likely not eligible',
  needs_review: 'Needs human review',
  needs_documents: 'Needs documents',
};

const money = (n) =>
  '$' + Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const toDate = (s) => new Date(s + 'T12:00:00Z');
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);

const shortDate = (s) =>
  toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function dayOfYear(dateStr) {
  const d = toDate(dateStr);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1, 12);
  return Math.round((d - start) / DAY_MS) + 1;
}

// ---------------------------------------------------------------------------
// One household member
// ---------------------------------------------------------------------------
export function evaluateMember(member, { docRule, listing, asOf }) {
  const flags = [];
  const audit = [];
  const flag = (level, code, message, ask) => flags.push({ level, code, member: member.name, message, ask });
  const whose = member.isApplicant === false ? `${member.name}'s` : 'your';
  const log = (step, detail, source = SOURCES.internal) =>
    audit.push({ member: member.name, step, detail, source });

  const stubs = [...(member.stubs || [])].sort((a, b) => (a.payDate < b.payDate ? 1 : -1));
  const result = { name: member.name, stubCount: stubs.length, flags, audit };

  if (stubs.length === 0) {
    flag('docs', 'no_stubs', `No pay stubs from ${member.name}.`, `${whose} ${docRule.requiredStubs} most recent pay stubs`);
    log('Collect stubs', 'No stubs on file.', SOURCES.docRule);
    return { ...result, annualFromStubs: 0, annualFromYtd: null };
  }

  // 1. Pay frequency
  const freqs = [...new Set(stubs.map((s) => s.frequency))];
  const frequency = freqs[0];
  if (freqs.length > 1) {
    flag('review', 'mixed_frequency', `${member.name}'s stubs show more than one pay frequency (${freqs.join(', ')}).`);
  }
  if (!PERIODS_PER_YEAR[frequency]) {
    flag('review', 'unknown_frequency', `Can't tell how often ${member.name} is paid.`);
    log('Pay frequency', `Unrecognized frequency "${frequency}".`);
    return { ...result, frequency, annualFromStubs: null, annualFromYtd: null };
  }
  log('Pay frequency', `${frequency} (${PERIODS_PER_YEAR[frequency]} pay periods a year).`, SOURCES.annualize);

  // 2. Enough stubs for this building's rule?
  if (stubs.length < docRule.requiredStubs) {
    const missing = docRule.requiredStubs - stubs.length;
    flag('docs', 'too_few_stubs', `Need ${missing} more pay stub${missing > 1 ? 's' : ''} from ${member.name} (${docRule.label} asks for ${docRule.requiredStubs}).`,
      `${missing} more of ${whose} most recent pay stubs, in a row`);
  }
  log('Stub count', `${stubs.length} on file; ${docRule.label} requires ${docRule.requiredStubs}.`, docRule.source);

  // 3. Is the newest stub recent enough?
  const age = daysBetween(stubs[0].payDate, asOf);
  if (age > listing.maxStubAgeDays) {
    flag('docs', 'stale_stub', `${member.name}'s newest stub is ${age} days old (limit ${listing.maxStubAgeDays}). Need a current one.`,
      `${whose[0].toUpperCase() + whose.slice(1)} pay stub from the last ${listing.maxStubAgeDays} days`);
  }
  log('Recency', `Newest pay date ${stubs[0].payDate}, ${age} days before ${asOf}.`, SOURCES.listing);

  // 4. Consecutive? Look for gaps that suggest a missing stub.
  const [minGap, maxGap] = EXPECTED_GAP_DAYS[frequency];
  const gapPairs = new Set();
  for (let i = 0; i < stubs.length - 1; i++) {
    const gap = daysBetween(stubs[i + 1].payDate, stubs[i].payDate);
    if (gap > maxGap) {
      gapPairs.add(i);
      flag('docs', 'gap', `Need ${member.name}'s pay stub from between ${stubs[i + 1].payDate} and ${stubs[i].payDate} (stubs must be consecutive).`,
      `${whose[0].toUpperCase() + whose.slice(1)} pay stub from between ${shortDate(stubs[i + 1].payDate)} and ${shortDate(stubs[i].payDate)}`);
    } else if (gap < minGap) {
      flag('review', 'too_close', `${member.name}: pay dates ${stubs[i + 1].payDate} and ${stubs[i].payDate} are only ${gap} days apart for a ${frequency} schedule.`);
    }
  }

  // 5. Does year-to-date reconcile from stub to stub?
  for (let i = 0; i < stubs.length - 1; i++) {
    const newer = stubs[i];
    const older = stubs[i + 1];
    if (newer.ytdGross == null || older.ytdGross == null) continue;
    if (newer.payDate.slice(0, 4) !== older.payDate.slice(0, 4)) continue;
    const jump = newer.ytdGross - older.ytdGross;
    if (gapPairs.has(i)) {
      // A gap in pay dates should show up as a bigger YTD jump. If it does,
      // YTD explains the gap: a stub is missing, not something wrong with these.
      const periods = Math.round(jump / newer.gross);
      if (periods > 1 && Math.abs(jump - periods * newer.gross) <= 1) {
        log('YTD vs gap', `YTD rises ${money(jump)} across the gap, about ${periods} pay periods' worth: ${periods - 1} stub${periods > 2 ? 's are' : ' is'} missing, and the pay itself was received.`);
        continue;
      }
    }
    if (Math.abs(jump - newer.gross) > 1) {
      flag('review', 'ytd_mismatch', `${member.name}: YTD rises ${money(jump)} between ${older.payDate} and ${newer.payDate}, but that stub shows ${money(newer.gross)} gross. Could be a correction, a typo, or an edited stub.`);
    }
  }

  // 6. Method A: average gross across stubs, annualized.
  const avgGross = stubs.reduce((s, x) => s + x.gross, 0) / stubs.length;
  const annualFromStubs = avgGross * PERIODS_PER_YEAR[frequency];
  log('Annualize (stubs)', `Average gross ${money(avgGross)} x ${PERIODS_PER_YEAR[frequency]} = ${money(annualFromStubs)}.`, SOURCES.annualize);

  if (frequency === 'semimonthly') {
    const misread = avgGross * 26;
    log('Semimonthly check', `Paid twice a month, not every two weeks: x24, not x26. Misreading it as biweekly would give ${money(misread)}, ${money(misread - annualFromStubs)} too high.`, SOURCES.annualize);
  }

  // 7. Method B: year-to-date, annualized (cross-check).
  let annualFromYtd = null;
  const latest = stubs[0];
  const doy = dayOfYear(latest.payDate);
  if (latest.ytdGross != null && doy >= 45) {
    annualFromYtd = (latest.ytdGross / doy) * 365;
    log('Annualize (YTD)', `${money(latest.ytdGross)} YTD through day ${doy} of the year, projected to ${money(annualFromYtd)}. (Would understate income for someone who started mid-year.)`);
  } else {
    log('Annualize (YTD)', 'Skipped: no YTD figure, or too early in the year to project.');
  }

  return { ...result, frequency, avgGross, annualFromStubs, annualFromYtd };
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------
function classify(income, min, max, minWaived) {
  if (income > max) return 'over';
  if (!minWaived && income < min) return 'under';
  return 'within';
}

export function smallestBandFor(income, householdSize) {
  const bands = Object.keys(AMI_2026).map(Number).sort((a, b) => a - b);
  return bands.find((p) => maxIncome(p, householdSize) >= income) ?? null;
}

export function evaluate({ application, listing, docRule, asOf }) {
  const size = application.householdSize;
  const max = maxIncome(listing.amiPercent, size);
  const minWaived = Boolean(application.hasRentalVoucher);
  const min = listing.minIncome;

  const members = application.members.map((m) =>
    evaluateMember({ ...m, isApplicant: m.name === application.applicantName }, { docRule, listing, asOf })
  );
  const flags = members.flatMap((m) => m.flags);
  const audit = members.flatMap((m) => m.audit);
  const log = (step, detail, source = SOURCES.internal) => audit.push({ member: 'Household', step, detail, source });

  const annual = members.reduce((s, m) => s + (m.annualFromStubs || 0), 0);
  const annualYtd = members.reduce((s, m) => s + (m.annualFromYtd ?? m.annualFromStubs ?? 0), 0);

  log('Household income', `${members.length} earner${members.length > 1 ? 's' : ''}: ${money(annual)} a year from stubs (${money(annualYtd)} using YTD where available).`);
  log('Income limit', `${listing.amiPercent}% AMI, household of ${size}: max ${money(max)}.`, SOURCES.ami);
  if (minWaived) {
    log('Minimum income', `Waived: household has a rental voucher.`, SOURCES.voucher);
  } else {
    log('Minimum income', `${money(min)} per listing${listing.minIncomeIsIllustrative ? ' (illustrative figure)' : ''}.`, SOURCES.listing);
  }

  const outcome = classify(annual, min, max, minWaived);
  const outcomeYtd = classify(annualYtd, min, max, minWaived);

  // Do the two methods disagree, and does it matter?
  const diverged = members.filter(
    (m) =>
      m.annualFromYtd != null &&
      m.annualFromStubs &&
      Math.abs(m.annualFromYtd - m.annualFromStubs) / m.annualFromStubs > listing.methodVarianceThreshold
  );
  if (diverged.length) {
    const names = diverged.map((m) => m.name).join(', ');
    if (outcome !== outcomeYtd) {
      flags.push({ level: 'review', code: 'methods_change_result', member: 'Household', message: `Recent stubs and year-to-date pay give different answers for ${names} (${money(annual)} vs ${money(annualYtd)}), and it changes the result. Likely variable hours or overtime; an agent should decide which reflects expected income.` });
    } else {
      log('Method check', `Stubs and YTD differ by more than ${listing.methodVarianceThreshold * 100}% for ${names}, but both land on the same side of the limit. No action needed.`);
    }
  } else {
    log('Method check', 'Stubs and YTD agree within tolerance.');
  }

  // Close calls go to a person, in either direction.
  const distance = Math.abs(annual - max) / max;
  if (distance < listing.nearLimitPct) {
    flags.push({ level: 'review', code: 'near_limit', member: 'Household', message: `Income is ${money(Math.abs(annual - max))} ${annual > max ? 'over' : 'under'} the ${money(max)} limit. Too close to decide automatically: check for one-time pay (bonus, back pay) or a pending raise.` });
  }

  // Decision
  let decision;
  if (flags.some((f) => f.level === 'docs')) decision = 'needs_documents';
  else if (flags.some((f) => f.level === 'review')) decision = 'needs_review';
  else decision = outcome === 'within' ? 'eligible' : 'ineligible';

  const altBand = outcome === 'over' ? smallestBandFor(annual, size) : null;

  const summary = {
    decision,
    decisionLabel: DECISIONS[decision],
    preliminary: outcome,
    annual,
    annualYtd,
    max,
    min,
    minWaived,
    householdSize: size,
    altBand,
  };
  log('Decision', `${DECISIONS[decision]}. Income from stubs is ${outcome === 'within' ? 'within' : outcome === 'over' ? 'over' : 'under'} the range.`);

  return {
    ...summary,
    members,
    flags,
    audit,
    applicantMessage: applicantMessage(application, summary, flags),
  };
}

// ---------------------------------------------------------------------------
// Plain-language text to the applicant (Harmony talks to applicants by SMS).
// ---------------------------------------------------------------------------
export function applicantMessage(application, s, flags) {
  const first = application.applicantName.split(' ')[0];
  switch (s.decision) {
    case 'needs_documents': {
      const asks = flags.filter((f) => f.level === 'docs').map((f) => '- ' + (f.ask || f.message));
      return `Hi ${first}, thanks for sending your pay stubs. To finish checking your income we still need:\n${asks.join('\n')}\nYou can text a photo of each one to this number.`;
    }
    case 'needs_review':
      return `Hi ${first}, we have everything we need for now. A housing specialist is looking over your income details and will follow up with you here.`;
    case 'eligible':
      return `Good news, ${first}: based on your pay stubs, your household income fits this building's range. Next we'll confirm the rest of your documents.`;
    case 'ineligible':
      if (s.preliminary === 'over') {
        const band = s.altBand ? ` You may qualify for buildings in the ${s.altBand}% AMI band. Want us to send you some?` : '';
        return `Hi ${first}, based on your pay stubs your household income (about ${money(s.annual)} a year) is above this building's limit of ${money(s.max)} for a household of ${s.householdSize}.${band}`;
      }
      return `Hi ${first}, based on your pay stubs your household income (about ${money(s.annual)} a year) is below this building's minimum of ${money(s.min)}. If you have a rental voucher, the minimum doesn't apply. Reply VOUCHER and we'll recheck.`;
    default:
      return '';
  }
}
