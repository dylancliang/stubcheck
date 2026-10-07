import { evaluate, DECISIONS } from './rules.js';
import { CASES, AS_OF } from './fixtures.js';
import { SAMPLE_LISTING, DOC_RULES } from './data.js';

const state = { view: 'queue', caseId: CASES[0].id, rule: 'hdc', voucher: {}, filter: 'all', sort: { key: 'status', dir: 'asc' } };

const STATUS_ORDER = ['needs_documents', 'needs_review', 'eligible', 'ineligible'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => (n == null ? '–' : '$' + Math.round(n).toLocaleString('en-US'));

function run(c) {
  const application = { ...c.application };
  if (state.voucher[c.id] !== undefined) application.hasRentalVoucher = state.voucher[c.id];
  return evaluate({ application, listing: SAMPLE_LISTING, docRule: DOC_RULES[state.rule], asOf: AS_OF });
}

function renderRule() {
  $('rule').innerHTML = Object.values(DOC_RULES)
    .map((r) => `<button type="button" id="rule-${r.id}" data-rule="${r.id}" aria-pressed="${state.rule === r.id}">${esc(r.label)} · ${r.requiredStubs} stubs</button>`)
    .join('');
}

function renderQueue() {
  $('queue').innerHTML = CASES.map((c) => {
    const r = run(c);
    return `<button type="button" class="case" id="case-${c.id}" data-case="${c.id}" aria-current="${state.caseId === c.id}">
      <span class="name">${esc(c.application.applicantName)}</span>
      <span class="pill ${r.decision}">${DECISIONS[r.decision]}</span>
      <span class="sub">${esc(c.title)}</span>
    </button>`;
  }).join('');
}

function bar(r) {
  const top = Math.max(r.max, r.annual, r.annualYtd, r.minWaived ? 0 : r.min) * 1.15;
  const pct = (v) => Math.max(0, Math.min(100, (v / top) * 100));
  const lo = r.minWaived ? 0 : r.min;
  const showYtd = Math.abs(r.annualYtd - r.annual) > 1;
  return `
    <div class="bar" role="img" aria-label="Household income ${money(r.annual)} against an allowed range of ${money(lo)} to ${money(r.max)}">
      <div class="track"></div>
      <div class="band" style="left:${pct(lo)}%; width:${pct(r.max) - pct(lo)}%"></div>
      ${showYtd ? `<div class="mark ytd" style="left:${pct(r.annualYtd)}%"></div>` : ''}
      <div class="mark" style="left:${pct(r.annual)}%"></div>
      <div class="lbl top" style="left:${pct(r.annual)}%">${money(r.annual)}</div>
      ${r.minWaived ? '' : `<div class="lbl" style="left:${pct(lo)}%">min ${money(lo)}</div>`}
      <div class="lbl" style="left:${pct(r.max)}%">max ${money(r.max)}</div>
    </div>
    <div class="legend"><span>From recent stubs</span>${showYtd ? '<span class="ytd">From year-to-date</span>' : ''}</div>`;
}

function stubTables(r, c) {
  return c.application.members.map((m) => {
    const ev = r.members.find((x) => x.name === m.name);
    const rows = [...m.stubs].sort((a, b) => (a.payDate < b.payDate ? 1 : -1)).map((s) => `
      <tr><td class="num">${s.payDate}</td><td>${esc(s.frequency)}</td><td class="r num">${money(s.gross)}</td><td class="r num">${money(s.ytdGross)}</td></tr>`).join('');
    return `<div class="member-name">${esc(m.name)} <small>· ${esc(m.stubs[0]?.employer ?? '')} · ${money(ev.annualFromStubs)}/yr</small></div>
      <div class="scroll"><table>
        <thead><tr><th>Pay date</th><th>Frequency</th><th class="r">Gross</th><th class="r">YTD gross</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }).join('');
}

function renderFile() {
  const c = CASES.find((x) => x.id === state.caseId);
  const r = run(c);
  const voucher = state.voucher[c.id] ?? Boolean(c.application.hasRentalVoucher);
  const flags = r.flags.length
    ? `<ul class="flags">${r.flags.map((f) => `<li class="${f.level}"><span class="tag">${f.level === 'docs' ? 'Ask' : 'Review'}</span><span>${esc(f.message)}</span></li>`).join('')}</ul>`
    : '<p class="none">Nothing to flag. Every check passed.</p>';

  $('file').innerHTML = `
    <button type="button" class="back" id="back">← All applicants</button>
    <div class="file-head">
      <div>
        <div class="eyebrow">Household of ${r.householdSize} · ${SAMPLE_LISTING.amiPercent}% AMI listing · as of ${AS_OF}</div>
        <h2>${esc(c.application.applicantName)}</h2>
        <p class="why">${esc(c.why)}</p>
      </div>
      <span class="pill ${r.decision}">${DECISIONS[r.decision]}</span>
    </div>

    <section>
      <h3>Income vs. this building's range</h3>
      <div class="figures">
        <div class="figure"><div class="k">From stubs</div><div class="v">${money(r.annual)}</div></div>
        <div class="figure"><div class="k">From YTD</div><div class="v">${money(r.annualYtd)}</div></div>
        <div class="figure"><div class="k">Allowed</div><div class="v">${r.minWaived ? 'up to' : money(r.min) + ' –'} ${money(r.max)}</div></div>
      </div>
      ${bar(r)}
      <p style="margin:14px 0 0"><label class="toggle"><input type="checkbox" id="voucher" ${voucher ? 'checked' : ''}> Household has a rental voucher (waives minimum income)</label></p>
    </section>

    <section>
      <h3>What needs attention</h3>
      ${flags}
    </section>

    <div class="two">
      <section>
        <h3>Pay stubs on file</h3>
        ${stubTables(r, c)}
      </section>
      <section>
        <h3>Text to applicant</h3>
        <div class="phone">
          <div class="from">To ${esc(c.application.applicantName)} · SMS</div>
          <div class="bubble">${esc(r.applicantMessage)}</div>
        </div>
      </section>
    </div>

    <section>
      <h3>Audit trail</h3>
      <ol class="audit">${r.audit.map((a) => `
        <li><span class="who">${esc(a.member)}</span><span><span class="step">${esc(a.step)}.</span> ${esc(a.detail)}</span><span class="src">${esc(a.source)}</span></li>`).join('')}
      </ol>
    </section>`;
}

// ---------------------------------------------------------------------------
// Admin queue: every applicant in one table
// ---------------------------------------------------------------------------
const COLUMNS = [
  { key: 'name', label: 'Applicant', sort: (x) => x.c.application.applicantName },
  { key: 'hh', label: 'Household', sort: (x) => x.r.householdSize, cls: 'r' },
  { key: 'income', label: 'Income (from stubs)', sort: (x) => x.r.annual, cls: 'r' },
  { key: 'limit', label: 'Limit', sort: (x) => x.r.max, cls: 'r' },
  { key: 'pct', label: 'Of limit', sort: (x) => x.r.annual / x.r.max },
  { key: 'stubs', label: 'Stubs', sort: (x) => x.have / x.need, cls: 'r' },
  { key: 'status', label: 'Status', sort: (x) => STATUS_ORDER.indexOf(x.r.decision) },
  { key: 'action', label: 'Next action' },
];

function rows() {
  const need = DOC_RULES[state.rule].requiredStubs;
  return CASES.map((c) => {
    const r = run(c);
    const have = c.application.members.reduce((s, m) => s + m.stubs.length, 0);
    return { c, r, have, need: need * c.application.members.length };
  });
}

function renderQueueTable() {
  const all = rows();
  const counts = Object.fromEntries(STATUS_ORDER.map((d) => [d, all.filter((x) => x.r.decision === d).length]));
  $('chips').innerHTML = [['all', 'All', all.length], ...STATUS_ORDER.map((d) => [d, DECISIONS[d], counts[d]])]
    .map(([id, label, n]) => `<button type="button" class="chip" id="chip-${id}" data-filter="${id}" aria-pressed="${state.filter === id}">${esc(label)} <span class="n">${n}</span></button>`)
    .join('');

  $('qhead').innerHTML = '<tr>' + COLUMNS.map((col) => {
    const sorted = state.sort.key === col.key ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const inner = col.sort ? `<button type="button" id="sort-${col.key}" data-sort="${col.key}" aria-sort="${sorted}">${esc(col.label)}</button>` : esc(col.label);
    return `<th class="${col.cls || ''}">${inner}</th>`;
  }).join('') + '</tr>';

  const col = COLUMNS.find((x) => x.key === state.sort.key);
  const dir = state.sort.dir === 'asc' ? 1 : -1;
  const list = all
    .filter((x) => state.filter === 'all' || x.r.decision === state.filter)
    .sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.c.application.applicantName.localeCompare(b.c.application.applicantName);
    });

  $('qbody').innerHTML = list.map(({ c, r, have, need }) => {
    const pct = r.annual / r.max;
    const tone = Math.abs(pct - 1) < SAMPLE_LISTING.nearLimitPct ? 'close' : pct > 1 ? 'over' : '';
    return `<tr tabindex="0" data-open="${c.id}" aria-label="Open ${esc(c.application.applicantName)}'s file">
      <td class="who"><b>${esc(c.application.applicantName)}</b><span>${esc(c.title)}</span></td>
      <td class="r num">${r.householdSize}</td>
      <td class="r num">${money(r.annual)}</td>
      <td class="r num">${money(r.max)}</td>
      <td><span class="meter"><span class="m"><i class="${tone}" style="width:${Math.min(100, pct * 100)}%"></i></span><span class="num">${Math.abs(pct - 1) < 0.005 && pct !== 1 ? (pct * 100).toFixed(1) : Math.round(pct * 100)}%</span></span></td>
      <td class="r num">${have}/${need}</td>
      <td><span class="pill ${r.decision}">${DECISIONS[r.decision]}</span></td>
      <td class="action">${esc(r.nextAction)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="${COLUMNS.length}" class="hint">No applicants with this status.</td></tr>`;

  $('qhint').textContent = `${SAMPLE_LISTING.amiPercent}% AMI listing · ${DOC_RULES[state.rule].label} (${DOC_RULES[state.rule].requiredStubs} stubs per earner) · as of ${AS_OF}. Click a row to open the file.`;
}

function csv() {
  const head = ['Applicant', 'Household size', 'Annual income (stubs)', 'Annual income (YTD)', 'Limit', 'Percent of limit', 'Stubs on file', 'Stubs required', 'Status', 'Next action', 'Flags'];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows().map(({ c, r, have, need }) => [
    c.application.applicantName, r.householdSize, Math.round(r.annual), Math.round(r.annualYtd), r.max,
    Math.round((r.annual / r.max) * 100) + '%', have, need, DECISIONS[r.decision], r.nextAction,
    r.flags.map((f) => f.message).join(' | '),
  ].map(q).join(','));
  return [head.map(q).join(','), ...lines].join('\n');
}

function render() {
  renderRule();
  $('queue-view').hidden = state.view !== 'queue';
  $('file-view').hidden = state.view !== 'file';
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  if (state.view === 'queue') renderQueueTable();
  else { renderQueue(); renderFile(); }
}

function openFile(id) { state.caseId = id; state.view = 'file'; render(); window.scrollTo({ top: 0 }); }

document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]');
  if (view) { state.view = view.dataset.view; render(); return; }
  const chip = e.target.closest('[data-filter]');
  if (chip) { state.filter = chip.dataset.filter; render(); return; }
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    const key = sortBtn.dataset.sort;
    state.sort = { key, dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc' };
    render(); return;
  }
  const row = e.target.closest('[data-open]');
  if (row) { openFile(row.dataset.open); return; }
  if (e.target.closest('#copy-csv')) {
    const btn = $('copy-csv');
    const done = (msg) => { btn.textContent = msg; setTimeout(() => (btn.textContent = 'Copy as CSV'), 2000); };
    navigator.clipboard?.writeText(csv()).then(() => done('Copied'), () => done('Copy blocked by browser'))
      ?? done('Copy blocked by browser');
    return;
  }
  const caseBtn = e.target.closest('[data-case]');
  if (caseBtn) { state.caseId = caseBtn.dataset.case; render(); return; }
  if (e.target.closest('#back')) { state.view = 'queue'; render(); return; }
  const ruleBtn = e.target.closest('[data-rule]');
  if (ruleBtn) { state.rule = ruleBtn.dataset.rule; render(); }
});
document.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('[data-open]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFile(row.dataset.open); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'voucher') { state.voucher[state.caseId] = e.target.checked; render(); }
});

render();
