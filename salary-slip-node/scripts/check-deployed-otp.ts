/**
 * check-deployed-otp.ts — does the SHIPPED bundle agree with the backend?
 *
 * On 2026-08-04 a user received a six-digit OTP into a four-box form. Every
 * source file was correct by then and every test passed. The fault was that
 * production served a bundle built before the change: the JS on niss.pro
 * contained `if(P.length<4)` and the string "Please enter the 4-digit OTP",
 * while Laravel had been generating six digits for some time.
 *
 * Source tests cannot see this. `otp-length-contract.test.ts` compares the
 * four declarations in the repository; this compares the repository against
 * what is actually being served, which is the only place the defect lived.
 *
 *   npx tsx scripts/check-deployed-otp.ts                      # defaults to niss.pro
 *   npx tsx scripts/check-deployed-otp.ts https://staging.host
 *   npx tsx scripts/check-deployed-otp.ts --json
 *
 * Read-only: two HTTP GETs. Exits 1 on a mismatch so a post-deploy step can
 * gate on it.
 */

import { OTP_LENGTH } from '../src/modules/auth/password-reset.service.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const origin = (args.find((a) => a.startsWith('http')) ?? 'https://niss.pro').replace(/\/$/, '');

interface Result {
  origin: string;
  bundle: string | null;
  expected: number;
  declaredLength: number | null;
  hardcodedComparison: number | null;
  copyLiterals: string[];
  ok: boolean;
  reasons: string[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const reasons: string[] = [];
  const result: Result = {
    origin,
    bundle: null,
    expected: OTP_LENGTH,
    declaredLength: null,
    hardcodedComparison: null,
    copyLiterals: [],
    ok: false,
    reasons,
  };

  const html = await fetchText(`${origin}/`);

  // Vite emits the entry as <script type="module" src="/assets/index-HASH.js">.
  const entry = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!entry) {
    reasons.push('could not find an /assets/index-*.js entry script in the served HTML');
    return report(result);
  }
  result.bundle = entry;

  const js = await fetchText(entry.startsWith('http') ? entry : `${origin}${entry}`);

  // The login page declares `const OTP_LENGTH = N` and builds the boxes from
  // it. Minified, that survives as `X=N,Y=Array.from({length:X}`.
  const declared = js.match(/(\w{1,4})=(\d+),\w{1,4}=Array\.from\(\{length:\1\}/);
  if (declared) result.declaredLength = Number(declared[2]);

  // The pre-fix shape: a literal in the submit guard.
  const hardcoded = js.match(/\.length<(\d+)\)\{\w+\(["'`]Please enter the/);
  if (hardcoded) result.hardcodedComparison = Number(hardcoded[1]);

  result.copyLiterals = [...new Set(js.match(/\b\d+-digit\s+OTP\b/gi) ?? [])];

  if (result.hardcodedComparison !== null) {
    reasons.push(
      `the served bundle compares against a hard-coded ${result.hardcodedComparison}, not a constant — it predates the OTP_LENGTH refactor`
    );
  }
  if (result.declaredLength === null && result.hardcodedComparison === null) {
    reasons.push('could not determine the OTP length from the served bundle (minifier shape changed?)');
  }
  if (result.declaredLength !== null && result.declaredLength !== OTP_LENGTH) {
    reasons.push(`served bundle declares OTP length ${result.declaredLength}, backend issues ${OTP_LENGTH}`);
  }
  for (const lit of result.copyLiterals) {
    const n = Number(lit.match(/\d+/)![0]);
    if (n !== OTP_LENGTH) {
      reasons.push(`served copy says "${lit}" while the backend issues ${OTP_LENGTH} digits`);
    }
  }

  result.ok = reasons.length === 0;
  report(result);
}

function report(r: Result) {
  if (asJson) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`\nDEPLOYED OTP CHECK — ${r.origin}`);
    console.log(`  bundle              : ${r.bundle ?? '(not found)'}`);
    console.log(`  backend issues      : ${r.expected} digits`);
    console.log(`  bundle declares     : ${r.declaredLength ?? '(none)'}`);
    console.log(`  hard-coded compare  : ${r.hardcodedComparison ?? '(none — good)'}`);
    console.log(`  copy literals       : ${r.copyLiterals.length ? r.copyLiterals.join(', ') : '(none — good)'}`);
    if (r.ok) {
      console.log(`\n  OK — the deployed form matches the codes the backend sends.\n`);
    } else {
      console.log(`\n  MISMATCH — users cannot complete the OTP step:`);
      for (const reason of r.reasons) console.log(`    - ${reason}`);
      console.log(`\n  Fix: rebuild the frontend and deploy it. The source is already correct;\n` +
                  `  what is serving is not.\n`);
    }
  }
  process.exit(r.ok ? 0 : 1);
}

await main().catch((e) => {
  console.error(`check failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
