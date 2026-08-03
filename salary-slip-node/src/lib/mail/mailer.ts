import path from 'node:path';
import { existsSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';

import { LOGO_CID, OTP_SUBJECT, renderOtpEmail } from './otp-template.js';

/**
 * SMTP delivery, replacing Laravel's Mail facade.
 *
 * Same server, same credentials, same From identity: recipients keep seeing
 * mail from the address their filters already trust, and the OTP mail is
 * byte-for-byte the template they have received before.
 */

export interface MailerConfig {
  host: string;
  port: number;
  /** MAIL_ENCRYPTION=tls means STARTTLS on 587, not implicit TLS. */
  encryption: 'tls' | 'ssl' | 'none';
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  /** Absolute path to the logo embedded in the OTP mail. */
  logoPath: string;
}

export interface Mailer {
  sendOtp(to: string, otp: string, employeeName: string): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private transporter: Transporter | null = null;

  constructor(private readonly config: MailerConfig) {}

  private transport(): Transporter {
    if (this.transporter) return this.transporter;

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      // Laravel's MAIL_ENCRYPTION=tls on port 587 is STARTTLS: connect in the
      // clear, then upgrade. `secure: true` would attempt implicit TLS and
      // hang against a STARTTLS-only server.
      secure: this.config.encryption === 'ssl',
      requireTLS: this.config.encryption === 'tls',
      auth: { user: this.config.username, pass: this.config.password },
    });

    return this.transporter;
  }

  async sendOtp(to: string, otp: string, employeeName: string): Promise<void> {
    const attachments = existsSync(this.config.logoPath)
      ? [{ filename: path.basename(this.config.logoPath), path: this.config.logoPath, cid: LOGO_CID }]
      : [];

    await this.transport().sendMail({
      from: { name: this.config.fromName, address: this.config.fromAddress },
      to,
      subject: OTP_SUBJECT,
      html: renderOtpEmail(otp, employeeName),
      attachments,
    });
  }

  async close(): Promise<void> {
    this.transporter?.close();
    this.transporter = null;
  }
}

/**
 * Writes the mail to the log instead of sending it.
 *
 * The default outside production: pointing a development machine at the live
 * SMTP account is how a test run emails real employees. The OTP itself is
 * never logged — only that a message would have been sent, and to whom.
 */
export class LoggingMailer implements Mailer {
  constructor(private readonly log: (msg: string) => void = console.log) {}

  async sendOtp(to: string, _otp: string, _employeeName: string): Promise<void> {
    this.log(`[mail] would send an OTP to ${to} (code withheld from logs)`);
  }
}
