/**
 * The OTP length is one contract written in four places.
 *
 * On 2026-08-04 a user received a six-digit code into a four-box form and could
 * not log in. Nothing was broken in isolation — Laravel generated six, the
 * React source rendered six, and the deployed bundle rendered four, because it
 * was built before the change and never redeployed. Two of the four places had
 * also drifted in source: the Node generator still produced four digits, and
 * two labels still read "4-digit".
 *
 * No test could fail, because no test compared the four declarations to each
 * other. This one does. It reads the actual source files rather than importing
 * constants, so it sees PHP and JSX too.
 *
 * It cannot check what is *deployed* — see scripts/check-deployed-otp.ts for
 * that, which probes the live bundle.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OTP_LENGTH, generateOtp } from './password-reset.service.js';

const REPO = join(import.meta.dirname, '..', '..', '..', '..');

const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

describe('OTP length contract — all layers must agree', () => {
  it('Laravel generates a code of OTP_LENGTH digits', () => {
    const php = read('salary-slip-bac', 'app', 'Http', 'Controllers', 'AuthController.php');
    const m = php.match(/random_int\(\s*(\d+)\s*,\s*(\d+)\s*\)/);

    expect(m, 'random_int(min, max) not found in AuthController').toBeTruthy();
    const [min, max] = [m![1]!, m![2]!];

    expect(min).toHaveLength(OTP_LENGTH);
    expect(max).toHaveLength(OTP_LENGTH);
    // Full range for the width: no leading zeros, every digit reachable.
    expect(Number(min)).toBe(10 ** (OTP_LENGTH - 1));
    expect(Number(max)).toBe(10 ** OTP_LENGTH - 1);
  });

  it('Laravel validates the submitted code at the same width', () => {
    const php = read('salary-slip-bac', 'app', 'Http', 'Controllers', 'AuthController.php');
    const m = php.match(/'otp'\s*=>\s*'[^']*digits:(\d+)/);

    expect(m, "no 'digits:N' rule found for the otp field").toBeTruthy();
    expect(Number(m![1])).toBe(OTP_LENGTH);
  });

  it('the Node generator emits exactly OTP_LENGTH digits across the range', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const code = generateOtp(() => r);
      expect(code).toHaveLength(OTP_LENGTH);
      expect(code).toMatch(/^[1-9]\d*$/);
    }
  });

  it('the React login page declares the same OTP_LENGTH', () => {
    const jsx = read('salary-slip-front', 'salary-slip-front', 'src', 'pages', 'auth', 'Login.jsx');
    const m = jsx.match(/OTP_LENGTH\s*=\s*(\d+)/);

    expect(m, 'OTP_LENGTH not declared in Login.jsx').toBeTruthy();
    expect(Number(m![1])).toBe(OTP_LENGTH);
  });

  it('the login page never hard-codes a digit count in user-facing copy', () => {
    // The original defect: OTP_LENGTH was raised to 6 while two rendered
    // strings still said "4-digit". A literal in copy is a latent
    // contradiction even on the day it happens to be right.
    //
    // Scoped to the UI layer, and to OTP specifically — "12-digit" is
    // legitimate for Aadhaar, which is a fixed-width identifier rather than a
    // tunable length. Comments are stripped first: a comment describing the
    // current width is documentation, not something a user can read.
    const jsx = read('salary-slip-front', 'salary-slip-front', 'src', 'pages', 'auth', 'Login.jsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const literals = jsx.match(/\b\d+-digit\s+OTP\b/gi) ?? [];
    expect(literals, `Login.jsx hard-codes an OTP digit count: ${literals.join(', ')}`).toEqual([]);
  });

  it('the React page does not compare against a literal length', () => {
    const jsx = read('salary-slip-front', 'salary-slip-front', 'src', 'pages', 'auth', 'Login.jsx');

    // `entered.length < 4` is how the deployed bundle got stuck at four.
    expect(jsx).not.toMatch(/\.length\s*<\s*\d+\s*\)\s*\{[^}]*OTP/i);
    expect(jsx).toMatch(/\.length\s*<\s*OTP_LENGTH/);
  });
});
