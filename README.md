# stubcheck

**Pay stubs in, an income decision out, with every rule it applied written down.**

A prototype income-eligibility checker for NYC affordable housing lotteries. It takes pay stub data, annualizes it the way HUD's handbook says to, checks the household against the building's AMI band, and returns one of four answers: **likely eligible**, **likely not eligible**, **needs documents**, or **needs human review**. Every step lands in an audit trail with its source.

**Live demo:** https://dylancliang.github.io/stubcheck/ (eight synthetic applicants; switch the building's document rule and watch outcomes change)

## Why I built it

New York gets millions of affordable housing applications a year for about ten thousand homes, and families wait well over a year. A lot of that time goes to income verification: someone reads every pay stub by hand, annualizes it, and checks it against a chart.

I wanted to understand that work from the inside. Most of the hard part isn't arithmetic. It's knowing which rule applies, catching the cases that look fine but aren't, and deciding what to ask the applicant for next.

## The rules, and where they come from

| Rule | Source |
|---|---|
| Annualize by pay frequency: weekly ×52, biweekly ×26, semimonthly ×24, monthly ×12 | HUD Handbook 4350.3, Ch. 5 |
| 2026 income limits by household size and % AMI (100% AMI for 3 people = $152,700) | [NYC HPD AMI chart](https://www.nyc.gov/site/hpd/services-and-information/area-median-income.page) |
| Two recent consecutive pay stubs | [HPD Verification of Wages form](https://www.nyc.gov/assets/hpd/downloads/pdfs/services/verification-wages-english.pdf) |
| Last six pay stubs | HDC lottery interview checklist |
| Rental voucher holders aren't held to the minimum income | Housing Connect listings (confirm per listing) |

The two stub rules don't match. That's on purpose here: the building's financing decides which one applies, so the engine takes the document rule as an input instead of hard-coding one.

## The cases

All applicants, employers, and figures are synthetic.

| Applicant | What it tests | Result |
|---|---|---|
| Maria | Steady biweekly pay | Eligible |
| Andre | Paid twice a month. ×24, not ×26. Misreading it as biweekly puts him $4,100 over the limit and wrongly rejects him. | Eligible |
| Keisha | Overtime dropped off. Recent stubs say eligible; year-to-date says over. | Review |
| Wei & Lin | Two earners on different schedules, combined. $240 over the limit. | Review, not auto-reject |
| Sam | Two stubs | Enough under HPD's rule, not HDC's |
| Rosa | Year-to-date jumps $500 more than that stub's gross pay | Review |
| Devon | Under the minimum income, has a rental voucher | Eligible |
| Tanya | Newest stub is from July, and one pay period is missing | Asks for exactly what's missing |

## Design decisions

- **Claude reads, rules decide.** `extract/extract.mjs` uses Claude's vision to pull fields off a stub photo. It never decides eligibility. The rules engine does, so the same stubs always produce the same answer and every answer can be explained.
- **Unreadable means null, not a guess.** Anything Claude can't read is flagged for the agent instead of filled in.
- **Cross-check two ways.** Income is annualized from recent stubs and from year-to-date. If they disagree but land on the same side of the limit, it's noted and nothing happens. If the disagreement changes the answer, a person decides.
- **Close calls go to people.** Within 2% of the limit, in either direction, the engine won't decide. Being $240 over could be a one-time bonus.
- **A gap in YTD can explain itself.** When pay dates skip a period and year-to-date rises by exactly two paychecks, the stub is missing, not wrong. The engine asks for it instead of raising a fraud flag.
- **Talk to applicants plainly.** Each outcome produces a text message. Document requests name the exact stub needed ("your pay stub from between May 29 and Jun 26"). Applicants who are over the limit are pointed to the AMI band they'd fit, instead of just being told no.

## What I'd ask an agent next

1. When HPD and HDC requirements differ for a building, who decides what to ask for, and is it ever written down?
2. How do you handle overtime that's clearly ending? What evidence do reviewers accept?
3. What's the most common reason a file sits waiting? Missing documents, expired ones, or something else?
4. Which pay stub formats (gig apps, cash employers, handwritten) cause the most trouble?

## Run it

```bash
npm install
npm test                  # 11 tests, Node 20+
npm run serve             # open http://localhost:3000

# Read real stub images with Claude (needs an API key)
export ANTHROPIC_API_KEY=...
node extract/extract.mjs stub1.jpg stub2.jpg > stubs.json
```

```
src/data.js       AMI table, annualization factors, document rules, sample listing
src/rules.js      the engine: pure functions, no dependencies
src/fixtures.js   synthetic applicants
src/app.js        the demo page
extract/          Claude vision extraction
test/             node:test suite
```

## Limits

This is a learning prototype, not a compliance tool. It covers wage income only: no self-employment, benefits, assets, or child support. The sample listing's minimum income is illustrative. Real listings set their own limits, which can differ from the HPD chart because of household-size factors in each program.
