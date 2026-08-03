import { z } from 'zod';
import dotenv from 'dotenv';

/**
 * Validated configuration.
 *
 * The PHP app reads env() at the point of use, so a missing key surfaces as a
 * confusing runtime failure deep inside a request — an empty
 * AADHAAR_REFERENCE_SECRET, for instance, would silently produce references
 * nobody can reproduce. Here the process refuses to start instead.
 */

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Must be the same APP_KEY the Laravel app uses. A different key makes every
   * existing encrypted_aadhaar_number unreadable — it does not fail loudly at
   * boot, it fails per row, so this is validated for shape here and proven
   * against real data by scripts/parity-check.ts.
   */
  APP_KEY: z
    .string()
    .min(1, 'APP_KEY is required')
    .refine(
      (v) => Buffer.from(v.startsWith('base64:') ? v.slice(7) : v, 'base64').length === 32,
      'APP_KEY must decode to 32 bytes for AES-256-CBC',
    ),

  /** Same secret as the PHP app, or every issued token stops verifying. */
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_TTL: z.coerce.number().int().positive().default(43200), // minutes — 30 days

  /**
   * Permanent data, not a rotatable credential: changing it orphans every
   * existing document folder.
   */
  AADHAAR_REFERENCE_SECRET: z.string().min(1, 'AADHAAR_REFERENCE_SECRET is required'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /**
   * SMTP, matching salary-slip-bac/.env. MAIL_ENCRYPTION=tls on port 587 is
   * STARTTLS, not implicit TLS — see SmtpMailer.
   *
   * MAIL_MAILER=log keeps a development machine from emailing real
   * employees, and is the default off production.
   */
  MAIL_MAILER: z.enum(['smtp', 'log']).default('log'),
  MAIL_HOST: z.string().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_ENCRYPTION: z.enum(['tls', 'ssl', 'none']).default('tls'),
  MAIL_USERNAME: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_FROM_ADDRESS: z.string().default('admin@niss.pro'),
  MAIL_FROM_NAME: z.string().default('NISS HRMS'),

  /** Laravel's `public` disk root — storage/app/public. Uploads land here. */
  STORAGE_PUBLIC_PATH: z.string().default('../salary-slip-bac/storage/app/public'),

  /** Logo embedded in the OTP email; served from the Laravel public dir. */
  MAIL_LOGO_PATH: z
    .string()
    .default('../salary-slip-bac/public/images/nidhi-impex-logo.png'),

  /**
   * The PHP app currently allows every origin. Node ships closed by default;
   * set this explicitly per environment.
   */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Never echo the values back — this text reaches logs and CI output.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === 'production';
