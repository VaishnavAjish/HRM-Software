import { describe, it, expect, vi } from 'vitest';

import { renderOtpEmail, LOGO_CID, OTP_SUBJECT } from './otp-template.js';
import { LoggingMailer } from './mailer.js';

/**
 * The OTP mail.
 *
 * Recipients already recognise this message, so the port is asserted against
 * the details that make it recognisable — the subject line, the code, the
 * embedded logo — rather than re-approved as a new design.
 */

describe('renderOtpEmail', () => {
  it('shows the code', () => {
    expect(renderOtpEmail('4821', 'Ravi')).toContain('4821');
  });

  it('keeps the subject the recipient has seen before', () => {
    expect(OTP_SUBJECT).toBe('Your verification code');
  });

  it('references the logo by cid, not a remote URL', () => {
    const html = renderOtpEmail('4821', 'Ravi');

    // Most clients block remote images until the reader opts in, so an <img
    // src="https://..."> would arrive visibly broken.
    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).not.toMatch(/<img[^>]+src="https?:\/\//);
  });

  it('includes the preheader used by the inbox preview', () => {
    expect(renderOtpEmail('4821', 'Ravi')).toContain('Your Nidhi Impex verification code is 4821');
  });

  it('carries the footer branding', () => {
    const html = renderOtpEmail('4821', 'Ravi', 2026);
    expect(html).toContain('NISS HRMS');
    expect(html).toContain('&copy; 2026 NISS');
  });

  it('escapes values rather than interpolating them raw', () => {
    // Blade escapes {{ }} by default; losing that in the port would turn a
    // stored name into an injection point in an outbound email.
    const html = renderOtpEmail('4821', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('is a complete HTML document', () => {
    const html = renderOtpEmail('4821', 'Ravi');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('LoggingMailer', () => {
  it('does not send, and never logs the code', async () => {
    const lines: string[] = [];
    await new LoggingMailer((m) => lines.push(m)).sendOtp('ravi@example.com', '4821', 'Ravi');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ravi@example.com');
    // An OTP in a log file is a credential in a log file.
    expect(lines[0]).not.toContain('4821');
  });

  it('is the safe default off production', async () => {
    const spy = vi.fn();
    await new LoggingMailer(spy).sendOtp('someone@example.com', '1111', 'X');
    // Pointing a dev machine at the live SMTP account is how a test run emails
    // real employees.
    expect(spy).toHaveBeenCalledOnce();
  });
});
