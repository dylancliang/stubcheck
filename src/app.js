import { evaluate, DECISIONS } from './rules.js';
import { CASES, AS_OF } from './fixtures.js';
import { SAMPLE_LISTING, DOC_RULES } from './data.js';

const state = { caseId: CASES[0].id, rule: 'hdc', voucher: {} };

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

function render() { renderRule(); renderQueue(); renderFile(); }

document.addEventListener('click', (e) => {
  const caseBtn = e.target.closest('[data-case]');
  if (caseBtn) { state.caseId = caseBtn.dataset.case; render(); return; }
  const ruleBtn = e.target.closest('[data-rule]');
  if (ruleBtn) { state.rule = ruleBtn.dataset.rule; render(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'voucher') { state.voucher[state.caseId] = e.target.checked; render(); }
});

render();
