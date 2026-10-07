// Reference data. Every number here comes from a public source, cited inline.

// Pay periods per year by pay frequency.
// Source: HUD Handbook 4350.3, Ch. 5 (annualizing earned income), as taught in
// state LIHTC compliance trainings: weekly x52, biweekly x26, semimonthly x24, monthly x12.
export const PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

// Expected days between pay dates, with tolerance, for spotting a missing stub.
export const EXPECTED_GAP_DAYS = {
  weekly: [6, 8],
  biweekly: [13, 15],
  semimonthly: [13, 18],
  monthly: [28, 31],
};

// 2026 New York City area AMI, max household income by household size (1-8).
// Source: NYC HPD, "Area Median Income" page (2026 chart; 100% AMI for a
// three-person household is $152,700).
// https://www.nyc.gov/site/hpd/services-and-information/area-median-income.page
export const AMI_2026 = {
  30: [35640, 40710, 45810, 50880, 54960, 59040, 63120, 67170],
  40: [47520, 54280, 61080, 67840, 73280, 78720, 84160, 89560],
  50: [59400, 67850, 76350, 84800, 91600, 98400, 105200, 111950],
  60: [71280, 81420, 91620, 101760, 109920, 118080, 126240, 134340],
  70: [83160, 94990, 106890, 118720, 128240, 137760, 147280, 156730],
  80: [95040, 108560, 122160, 135680, 146560, 157440, 168320, 179120],
  90: [106920, 122130, 137430, 152640, 164880, 177120, 189360, 201510],
  100: [118800, 135700, 152700, 169600, 183200, 196800, 210400, 223900],
  110: [130680, 149270, 167970, 186560, 201520, 216480, 231440, 246290],
  120: [142560, 162840, 183240, 203520, 219840, 236160, 252480, 268680],
  130: [154440, 176410, 198510, 220480, 238160, 255840, 273520, 291070],
  165: [196020, 223905, 251955, 279840, 302280, 324720, 347160, 369435],
};

export function maxIncome(amiPercent, householdSize) {
  const row = AMI_2026[amiPercent];
  if (!row) throw new Error(`No AMI row for ${amiPercent}%`);
  if (householdSize < 1 || householdSize > row.length) {
    throw new Error(`Household size ${householdSize} outside table (1-${row.length})`);
  }
  return row[householdSize - 1];
}

// Document rules. These two public sources ask for different numbers of stubs,
// which is the point: the product has to know which rule a building follows.
export const DOC_RULES = {
  hdc: {
    id: 'hdc',
    label: 'HDC lottery checklist',
    requiredStubs: 6,
    note: 'HDC\'s lottery interview checklist asks for the last six pay stubs.',
    source: 'NYC HDC lottery documentation checklist (as reported by PIX11)',
  },
  hpd: {
    id: 'hpd',
    label: 'HPD Verification of Wages',
    requiredStubs: 2,
    note: 'HPD\'s Verification of Wages form accepts two recent consecutive pay stubs.',
    source: 'https://www.nyc.gov/assets/hpd/downloads/pdfs/services/verification-wages-english.pdf',
  },
};

// A sample lottery listing. Max income comes from the real 2026 AMI table.
// Minimum income is set per listing on Housing Connect; the figure here is
// illustrative, not taken from a real building.
export const SAMPLE_LISTING = {
  name: 'Sample listing: 60% AMI band',
  amiPercent: 60,
  minIncome: 56000,
  minIncomeIsIllustrative: true,
  maxStubAgeDays: 60,
  methodVarianceThreshold: 0.1, // flag when average-of-stubs and YTD disagree by >10%
  nearLimitPct: 0.02, // flag when within 2% of the max
};
