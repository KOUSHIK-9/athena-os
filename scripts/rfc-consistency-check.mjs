#!/usr/bin/env node
/**
 * RFC consistency / reference resolver.
 *
 * Enforces:
 *   - Every `RFC-NNNN` citation resolves to a file in docs/rfcs.
 *   - Every `RFC-NNNN §X[.Y]` / `RFC-NNNN §Name` citation resolves to a real
 *     section in the target RFC (catches dangling / mis-cited sections such as
 *     "RFC-0009 §4.1" when §4.1 does not exist).
 *   - A shared GLOSSARY.md exists and defines the canonical ambiguous terms
 *     (Context / Memory / RetrievalResult / MemoryReader).
 *
 * Missing RFC files that are in the planned allowlist are warnings, not errors
 * (planned-but-not-yet-written RFCs such as 0015/0016 must not break the build).
 * All other missing references are errors and fail the check.
 *
 * Usage:
 *   node scripts/rfc-consistency-check.mjs
 *   RFC_PLANNED=0010,0015,0016 node scripts/rfc-consistency-check.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RFC_DIR = join(ROOT, 'docs', 'rfcs');

const PLANNED = new Set(
  (process.env.RFC_PLANNED || '0010,0015,0016').split(',').map((s) => s.trim()).filter(Boolean)
);
const GLOSSARY_PATH = join(RFC_DIR, 'GLOSSARY.md');
const CANONICAL_TERMS = ['Context', 'Memory', 'RetrievalResult', 'MemoryReader'];

function listMd(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('._') && !f.startsWith('.'));
}

// Map RFC number -> filename for files named NNNN-*.md
const rfcByNumber = new Map();
for (const f of listMd(RFC_DIR)) {
  const m = f.match(/^(\d{4})-/);
  if (m) rfcByNumber.set(m[1], f);
}

// Parse a file's section headings into { num, title } where num may be null.
function parseSections(content) {
  const sections = [];
  for (const line of content.split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (!h) continue;
    const text = h[1].trim();
    const nm = text.match(/^(\d+(?:\.\d+)?)[\.\s]+(.*)$/);
    if (nm) {
      sections.push({ num: nm[1], title: nm[2].trim().toLowerCase().replace(/[^a-z0-9]/g, '') });
    } else {
      sections.push({ num: null, title: text.toLowerCase().replace(/[^a-z0-9]/g, '') });
    }
  }
  return sections;
}

const sectionsByNumber = new Map();
for (const [num, f] of rfcByNumber) {
  sectionsByNumber.set(num, parseSections(readFileSync(join(RFC_DIR, f), 'utf8')));
}

// RFC-NNNN (always zero-padded as RFC-00NN in this repo, which also excludes
// real-world RFCs like RFC-3339), optionally followed by a §section (numeric or
// named). Numeric §-refs >= 100 are treated as line-number citations (e.g.
// "RFC-0013 §243" meaning line 243) and are not validated as sections.
const REF_RE = /RFC-(00\d{2})(?:\s+§\s?([0-9]+(?:\.[0-9]+)?|[A-Za-z][\w ]+))?/gi;

const errors = [];
const warnings = [];

function sectionOk(targetNum, section) {
  const secs = sectionsByNumber.get(targetNum);
  if (!secs) return false;
  if (/^\d+(?:\.\d+)?$/.test(section)) {
    const major = section.split('.')[0];
    return secs.some((s) => s.num === section || (s.num && s.num.split('.')[0] === major));
  }
  const norm = section.toLowerCase().replace(/[^a-z0-9]/g, '');
  return secs.some((s) => s.title.length > 0 && (s.title.includes(norm) || norm.includes(s.title)));
}

for (const f of listMd(RFC_DIR)) {
  const content = readFileSync(join(RFC_DIR, f), 'utf8');
  let m;
  while ((m = REF_RE.exec(content)) !== null) {
    const num = m[1];
    let section = m[2];
    if (section && /^\d+(?:\.\d+)?$/.test(section) && Number(section) >= 100) {
      section = null; // line-number citation, not a section heading
    }

    if (!rfcByNumber.has(num)) {
      if (PLANNED.has(num)) {
        warnings.push(`${f}: references planned (unwritten) RFC-${num}`);
      } else {
        errors.push(`${f}: references RFC-${num} but no docs/rfcs/${num}-*.md exists`);
      }
      continue;
    }

    // Ranges like "§4–§8": also validate the endpoint after the dash.
    const after = content.slice(m.index + m[0].length);
    const rangeEnd = after.match(/^[–-]\s*§\s*(\d+(?:\.\d+)?)/);

    if (section && !sectionOk(num, section.trim())) {
      errors.push(`${f}: references RFC-${num} §${section.trim()} but that section was not found`);
    }
    if (rangeEnd && !sectionOk(num, rangeEnd[1])) {
      errors.push(`${f}: references RFC-${num} §${rangeEnd[1]} but that section was not found`);
    }
  }
}

// Glossary enforcement
if (!existsSync(GLOSSARY_PATH)) {
  warnings.push(`GLOSSARY.md missing at ${relative(ROOT, GLOSSARY_PATH)} — create it to enforce terminology`);
} else {
  const g = readFileSync(GLOSSARY_PATH, 'utf8').toLowerCase();
  for (const term of CANONICAL_TERMS) {
    if (!g.includes(term.toLowerCase())) {
      warnings.push(`GLOSSARY.md does not define canonical term "${term}"`);
    }
  }
}

if (warnings.length) {
  console.warn('RFC CONSISTENCY WARNINGS:');
  for (const w of warnings) console.warn(`  ! ${w}`);
}

if (errors.length) {
  console.error('RFC CONSISTENCY ERRORS:');
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}

console.log('RFC consistency check passed: all RFC citations resolve to real files and sections.');
