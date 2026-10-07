// Synthetic applicants. No real people, employers, or pay data.
// Each case exists to exercise one rule an agent runs into in practice.

export const AS_OF = '2026-10-07';

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (s) => new Date(s + 'T12:00:00Z');

function previousPayDate(dateStr, frequency) {
  const d = utc(dateStr);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() - 7);
  else if (frequency === 'biweekly') d.setUTCDate(d.getUTCDate() - 14);
  else if (frequency === 'monthly') d.setUTCDate(0); // last day of prior month
  else if (frequency === 'semimonthly') {
    if (d.getUTCDate() > 15) d.setUTCDate(15);
    else d.setUTCDate(0);
  }
  return iso(d);
}

// Build stubs newest-first with a year-to-date that reconciles.
// grosses: newest first. priorGross: what they earned per period earlier in the year.
function makeStubs({ employer, frequency, lastPayDate, grosses, priorGross }) {
  const dates = [lastPayDate];
  for (let i = 1; i < grosses.length; i++) dates.push(previousPayDate(dates[i - 1], frequency));

  // Count earlier pay dates this year, before the oldest stub.
  const year = lastPayDate.slice(0, 4);
  let earlier = 0;
  let d = previousPayDate(dates[dates.length - 1], frequency);
  while (d.slice(0, 4) === year) {
    earlier++;
    d = previousPayDate(d, frequency);
  }

  let ytd = earlier * (priorGross ?? grosses[grosses.length - 1]);
  const oldestFirst = dates.map((date, i) => ({ date, gross: grosses[i] })).reverse();
  const stubs = oldestFirst.map(({ date, gross }) => {
    ytd += gross;
    return { employer, frequency, payDate: date, gross, ytdGross: Math.round(ytd * 100) / 100 };
  });
  return stubs.reverse();
}

const steady = (n, amount) => Array(n).fill(amount);

export const CASES = [
  {
    id: 'maria',
    title: 'Steady biweekly paycheck',
    why: 'The happy path: six consecutive stubs, same pay every period, comfortably inside the band.',
    application: {
      applicantName: 'Maria Lopez',
      householdSize: 2,
      members: [
        { name: 'Maria Lopez', stubs: makeStubs({ employer: 'Northside Dental Group', frequency: 'biweekly', lastPayDate: '2026-10-02', grosses: steady(6, 2600) }) },
      ],
    },
  },
  {
    id: 'andre',
    title: 'Semimonthly, not biweekly',
    why: 'Paid on the 15th and last day of the month: x24, not x26. Treating "twice a month" as "every two weeks" would wrongly reject him.',
    application: {
      applicantName: 'Andre Baptiste',
      householdSize: 1,
      members: [
        { name: 'Andre Baptiste', stubs: makeStubs({ employer: 'Hudson Transit Services', frequency: 'semimonthly', lastPayDate: '2026-09-30', grosses: steady(6, 2900) }) },
      ],
    },
  },
  {
    id: 'keisha',
    title: 'Hourly with overtime that dropped off',
    why: 'Her last six stubs say one thing; her year-to-date says another, and the difference decides eligibility. A person should make that call.',
    application: {
      applicantName: 'Keisha Morgan',
      householdSize: 3,
      members: [
        { name: 'Keisha Morgan', stubs: makeStubs({ employer: 'Bay Ridge Medical Center', frequency: 'biweekly', lastPayDate: '2026-10-02', grosses: [2100, 3400, 2050, 3600, 2200, 3300], priorGross: 3850 }) },
      ],
    },
  },
  {
    id: 'chen',
    title: 'Two earners, $240 over',
    why: 'Two people, two pay schedules, combined. The household lands $240 over the limit. Too close to auto-reject.',
    application: {
      applicantName: 'Wei Chen',
      householdSize: 4,
      members: [
        { name: 'Wei Chen', stubs: makeStubs({ employer: 'Flushing Grocery Co.', frequency: 'biweekly', lastPayDate: '2026-09-25', grosses: steady(6, 2400) }) },
        { name: 'Lin Chen', stubs: makeStubs({ employer: 'Queens Public Schools Aide Program', frequency: 'monthly', lastPayDate: '2026-09-30', grosses: steady(6, 3300) }) },
      ],
    },
  },
  {
    id: 'sam',
    title: 'Two stubs: enough for HPD, not for HDC',
    why: 'Same applicant, same stubs. Switch the document rule above and watch the outcome change.',
    application: {
      applicantName: 'Sam Okafor',
      householdSize: 1,
      members: [
        { name: 'Sam Okafor', stubs: makeStubs({ employer: 'Greenpoint Logistics', frequency: 'biweekly', lastPayDate: '2026-10-02', grosses: steady(2, 2450) }) },
      ],
    },
  },
  {
    id: 'rosa',
    title: 'Year-to-date doesn\'t add up',
    why: 'One stub\'s YTD jumps $500 more than its gross pay. Could be a payroll correction or an edited document. Flag it, don\'t guess.',
    application: (() => {
      const stubs = makeStubs({ employer: 'Astoria Home Care', frequency: 'biweekly', lastPayDate: '2026-10-02', grosses: steady(6, 2700) });
      // Inflate YTD from the third-newest stub onward.
      for (let i = 0; i <= 2; i++) stubs[i].ytdGross += 500;
      return { applicantName: 'Rosa Diaz', householdSize: 2, members: [{ name: 'Rosa Diaz', stubs }] };
    })(),
  },
  {
    id: 'devon',
    title: 'Under the minimum, but has a voucher',
    why: 'Below the listing\'s minimum income, which would normally disqualify him. With a rental voucher, the minimum doesn\'t apply.',
    application: {
      applicantName: 'Devon Price',
      householdSize: 1,
      hasRentalVoucher: true,
      members: [
        { name: 'Devon Price', stubs: makeStubs({ employer: 'Harlem Community Kitchen', frequency: 'biweekly', lastPayDate: '2026-10-02', grosses: steady(6, 1150) }) },
      ],
    },
  },
  {
    id: 'tanya',
    title: 'Old stubs with a gap',
    why: 'Her newest stub is from July, and one pay period is missing. The engine asks for what\'s missing in plain language.',
    application: (() => {
      const stubs = makeStubs({ employer: 'Bronx Print Works', frequency: 'biweekly', lastPayDate: '2026-07-24', grosses: steady(7, 2300) });
      stubs.splice(3, 1); // drop one stub from the middle
      return { applicantName: 'Tanya Brooks', householdSize: 2, members: [{ name: 'Tanya Brooks', stubs }] };
    })(),
  },
];
