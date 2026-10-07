#!/usr/bin/env node
// Read pay stub photos with Claude and print stubcheck-ready JSON.
//
//   export ANTHROPIC_API_KEY=...
//   node extract/extract.mjs stub1.jpg stub2.png > stubs.json
//
// Claude only extracts what's printed on the stub. It never decides
// eligibility; the rules engine does that, so every decision is reproducible.
// Anything Claude can't read is returned as null and listed in "unreadable",
// which the agent sees instead of a guess.

import fs from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.STUBCHECK_MODEL || 'claude-sonnet-5-5';
const MEDIA = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

const recordStub = {
  name: 'record_pay_stub',
  description: 'Record the fields printed on one pay stub. Use null for anything not clearly printed.',
  input_schema: {
    type: 'object',
    properties: {
      employer: { type: ['string', 'null'] },
      employee: { type: ['string', 'null'] },
      payDate: { type: ['string', 'null'], description: 'Pay date as YYYY-MM-DD (not the period end date, unless that is the only date).' },
      periodStart: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      periodEnd: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      frequency: {
        type: ['string', 'null'],
        enum: ['weekly', 'biweekly', 'semimonthly', 'monthly', null],
        description: 'semimonthly = twice a month on fixed dates (e.g. 15th and last day). biweekly = every 14 days. Infer from the period dates if not printed.',
      },
      gross: { type: ['number', 'null'], description: 'Gross pay for this period, before taxes and deductions.' },
      ytdGross: { type: ['number', 'null'], description: 'Year-to-date gross pay.' },
      hours: { type: ['number', 'null'] },
      unreadable: { type: 'array', items: { type: 'string' }, description: 'Fields you could not read with confidence.' },
    },
    required: ['employer', 'payDate', 'frequency', 'gross', 'ytdGross', 'unreadable'],
  },
};

async function extract(client, file) {
  const media = MEDIA[path.extname(file).toLowerCase()];
  if (!media) throw new Error(`${file}: use a .jpg, .png, .webp or .gif image`);
  const data = (await fs.readFile(file)).toString('base64');

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [recordStub],
    tool_choice: { type: 'tool', name: 'record_pay_stub' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media, data } },
        { type: 'text', text: 'This is a pay stub submitted for an affordable housing income check. Record exactly what it says. Do not estimate or calculate missing values.' },
      ],
    }],
  });

  const call = msg.content.find((b) => b.type === 'tool_use');
  if (!call) throw new Error(`${file}: no fields returned`);
  return { file: path.basename(file), ...call.input };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node extract/extract.mjs <stub image> [more images...]');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}

const client = new Anthropic();
const stubs = [];
for (const f of files) {
  const s = await extract(client, f);
  if (s.unreadable?.length) console.error(`${s.file}: could not read ${s.unreadable.join(', ')}`);
  stubs.push(s);
}
console.log(JSON.stringify({ stubs }, null, 2));
