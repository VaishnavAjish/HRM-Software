import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { AuthService, AuthError } from './auth.service.js';
import { PrismaAuthRepository, PrismaCacheStore } from './auth.repository.js';
import { TokenBlacklist } from './token-blacklist.js';
import { LaravelEncrypter } from '../../lib/laravel/crypt.js';
import { normalise as normaliseAadhaar } from '../../lib/laravel/aadhaar.js';
import { PasswordResetService } from './password-reset.service.js';
import { PrismaPasswordResetRepository } from './password-reset.repository.js';
import { SmtpMailer, LoggingMailer, type Mailer } from '../../lib/mail/mailer.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { AccountService } from './account.service.js';
import { PrismaAccountRepository } from './account.repository.js';
import { authenticated } from './guards.js';
import { IdentityService, type UploadedPhoto } from './identity.service.js';
import { PrismaIdentityRepository } from './account.repository.js';
import { LocalPublicDisk, UploadRejected } from '../../lib/storage/public-disk.js';

/**
 * Auth routes, path-for-path with the Laravel API.
 *
 * The React client is not being changed: src/utils/api.js posts to /api/login,
 * gets /api/profile and posts /api/logout, and reads { status, message, token,
 * token_type, user }. Every response below reproduces that shape, including
 * the 401/403/422 status codes, so the frontend cannot tell which backend
 * answered.
 */

/**
 * Laravel returns only the FIRST validation error, as a plain string, and uses
 * 422. Returning Zod's full issue array instead would render as "[object
 * Object]" in the existing toast handling.
 */
const loginSchema = z.object({
  email: z.string({ required_error: 'The email field is required.' })
    .min(1, 'The email field is required.'),
  password: z.string({ required_error: 'The password field is required.' })
    .min(1, 'The password field is required.'),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'The given data was invalid.';
}

/** Bearer token from the Authorization header, if any. */
function bearerFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}

/**
 * Responses carrying a bearer token or an identity must never be cached: a
 * shared cache replaying one would hand a user someone else's session.
 */
function noStore(reply: { header(k: string, v: string): unknown }): void {
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  reply.header('Pragma', 'no-cache');
}

/**
 * Laravel validates these with 'required|email' and 'required|min:6'. The
 * messages are Laravel's own text so the existing toasts read identically.
 */
const emailOnlySchema = z.object({
  email: z.string({ required_error: 'The email field is required.' })
    .min(1, 'The email field is required.')
    .email('The email must be a valid email address.'),
});

const verifyOtpSchema = emailOnlySchema.extend({
  otp: z.union([z.string(), z.number()], {
    required_error: 'The otp field is required.',
  }),
});

const setPasswordSchema = emailOnlySchema.extend({
  password: z.string({ required_error: 'The password field is required.' })
    .min(6, 'The password must be at least 6 characters.'),
  // Required here but not by Laravel. PHP checks only that some OTP is
  // outstanding, so knowing an email address is enough to reset an account;
  // this endpoint verifies the code. The React client forwards the value it
  // already collected at step 2, which the PHP endpoint ignores.
  otp: z.union([z.string(), z.number()], {
    required_error: 'The otp field is required.',
  }),
});

/** Laravel: password required, new_password min:6, confirm_password same. */
const changePasswordSchema = z
  .object({
    password: z.string({ required_error: 'The password field is required.' })
      .min(1, 'The password field is required.'),
    new_password: z.string({ required_error: 'The new password field is required.' })
      .min(6, 'The new password must be at least 6 characters.'),
    confirm_password: z.string({ required_error: 'The confirm password field is required.' }),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'The confirm password and new password must match.',
    path: ['confirm_password'],
  });

/** Laravel: name required, email required|email|unique, password min:6. */
const registerSchema = z.object({
  name: z.string({ required_error: 'The name field is required.' })
    .min(1, 'The name field is required.'),
  email: z.string({ required_error: 'The email field is required.' })
    .email('The email must be a valid email address.'),
  password: z.string({ required_error: 'The password field is required.' })
    .min(6, 'The password must be at least 6 characters.'),
  role: z.union([z.number(), z.string()]).optional(),
  company_code: z.string().optional(),
});

export interface AuthRouteDeps {
  service?: AuthService;
  /** Injected so tests can avoid touching the production database. */
  decryptAadhaar?: (payload: string | null | undefined) => string | null;
  passwordReset?: PasswordResetService;
  account?: AccountService;
  identity?: IdentityService;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRouteDeps = {},
): Promise<void> {
  const service =
    deps.service ??
    new AuthService(
      new PrismaAuthRepository(),
      new TokenBlacklist(new PrismaCacheStore(), 0),
      {
        jwtSecret: env.JWT_SECRET,
        jwtTtlMinutes: env.JWT_TTL,
        issuer: `http://${env.HOST}:${env.PORT}`,
      },
    );

  const encrypter = new LaravelEncrypter(env.APP_KEY);
  const decryptAadhaar =
    deps.decryptAadhaar ?? ((payload) => encrypter.tryDecryptString(payload));

  // ---- POST /api/login ---------------------------------------------------

  app.post(
    '/api/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(422).send({ status: false, message: firstError(parsed.error) });
      }

      try {
        const result = await service.login(parsed.data.email, parsed.data.password);
        noStore(reply);

        return reply.send({
          status: true,
          message: 'Login successful',
          token: result.token,
          token_type: result.tokenType,
          user: result.user,
        });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.status(error.statusCode).send({ status: false, message: error.message });
        }
        throw error;
      }
    },
  );

  // ---- GET /api/profile --------------------------------------------------

  app.get('/api/profile', async (request, reply) => {
    const token = bearerFrom(request);
    if (!token) {
      return reply.status(401).send({ status: false, message: 'Unauthenticated' });
    }

    try {
      const { user } = await service.authenticate(token);

      // Your own profile: you own this identity document, so the complete
      // number is disclosed without a separate grant. It is read from the
      // encrypted column, falling back to the legacy plaintext one.
      const full =
        decryptAadhaar(user.encrypted_aadhaar_number as string | null) ??
        (normaliseAadhaar(user.aadhar_card_no as string | null) || null);

      noStore(reply);
      return reply.send({ status: true, user: await service.me(user, full) });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ status: false, message: error.message });
      }
      return reply.status(401).send({ status: false, message: 'Unauthenticated' });
    }
  });

  // ---- POST /api/logout --------------------------------------------------

  /**
   * Idempotent and unconditionally successful, matching the PHP behaviour and
   * for the same reason: a logout arriving with an expired, malformed or
   * absent token must still report success and still revoke what it can.
   * Deliberately not behind the authentication guard — putting it there is
   * what previously meant such requests never reached the handler at all, and
   * the token stayed live for up to 30 days on a machine whose user believed
   * they had signed out.
   */
  app.post(
    '/api/logout',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { revoked } = await service.logout(bearerFrom(request));

      if (!revoked) {
        request.log.warn('logout could not revoke a token');
      }

      noStore(reply);
      return reply.send({ status: true, message: 'Logged out successfully' });
    },
  );

  // ---- POST /api/new-email | new-email-otp | new-password ----------------

  /**
   * The email password-reset flow.
   *
   * Laravel serves all of these from one route, `Route::post('new{data}')`,
   * dispatching on a `type` field in the body — the URL suffix is decorative.
   * They are registered individually here so the reverse proxy can move them
   * one at a time, and specifically so `/api/new-emp_code` (type 0, the
   * identity claim, which carries a file upload) keeps reaching Laravel until
   * it is ported.
   *
   * Rate limiting matches the PHP route's throttle:15,1.
   */
  const reset =
    deps.passwordReset ??
    new PasswordResetService(
      new PrismaPasswordResetRepository(),
      buildMailer(),
      { make: (plain) => hashPassword(plain) },
    );

  const throttled = { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } };

  const handle = async (
    reply: FastifyReply,
    run: () => Promise<{ message: string }>,
  ) => {
    try {
      const { message } = await run();
      noStore(reply);
      return reply.send({ status: true, message });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ status: false, message: error.message });
      }
      throw error;
    }
  };

  app.post('/api/new-email', throttled, async (request, reply) => {
    const parsed = emailOnlySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ status: false, message: firstError(parsed.error) });
    }
    return handle(reply, () => reset.sendOtp(parsed.data.email));
  });

  app.post('/api/new-email-otp', throttled, async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ status: false, message: firstError(parsed.error) });
    }
    return handle(reply, () => reset.verifyOtp(parsed.data.email, String(parsed.data.otp)));
  });

  app.post('/api/new-password', throttled, async (request, reply) => {
    const parsed = setPasswordSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(422).send({ status: false, message: firstError(parsed.error) });
    }
    return handle(reply, () =>
      reset.setPassword(parsed.data.email, parsed.data.password, String(parsed.data.otp)),
    );
  });

  // ---- POST /api/new-emp_code (type 0, multipart) ------------------------

  /**
   * The identity claim. Submitted as multipart because it may carry a photo.
   *
   * The Aadhaar arrives under one of eight legacy field names — the screen
   * collects an Aadhaar but earlier iterations of this flow called it a mobile
   * number, and the client still sends every alias it has ever used. All are
   * accepted, first match wins, exactly as PHP does.
   */
  const identity =
    deps.identity ??
    new IdentityService(
      new PrismaIdentityRepository(encrypter),
      new LocalPublicDisk(path.resolve(process.cwd(), env.STORAGE_PUBLIC_PATH)),
    );

  const AADHAAR_ALIASES = [
    'aadhar_card_no',
    'aadhaar_card_no',
    'aadhar_card_number',
    'aadhaar_card_number',
    'aadhar_no',
    'aadhaar_no',
    'aadhar',
    'aadhaar',
    'mobile_number',
  ] as const;

  app.post('/api/new-emp_code', throttled, async (request, reply) => {
    const fields: Record<string, string> = {};
    let photo: UploadedPhoto | null = null;

    // isMultipart only exists once @fastify/multipart is registered. Guarding
    // means a JSON-bodied claim (no photo) still works on an instance that has
    // not registered it, rather than throwing a 500 from an undefined call.
    if (typeof request.isMultipart === 'function' && request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'photo') {
            photo = { contents: await part.toBuffer(), mimeType: part.mimetype };
          } else {
            // Drain anything unexpected; leaving a file stream unconsumed
            // stalls the request until the connection times out.
            await part.toBuffer();
          }
        } else {
          fields[part.fieldname] = String(part.value ?? '');
        }
      }
    } else {
      Object.assign(fields, (request.body ?? {}) as Record<string, string>);
    }

    const aadhaar = AADHAAR_ALIASES.map((k) => fields[k]).find((v) => v != null && v !== '') ?? '';

    try {
      const result = await identity.claim({
        empCode: fields.emp_code ?? '',
        companyCode: fields.company_code ?? null,
        unit: fields.unit ?? null,
        aadhaar,
        address: fields.address ?? null,
        photo,
      });

      noStore(reply);
      return reply.send({ status: true, ...result });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({ status: false, message: error.message });
      }
      if (error instanceof UploadRejected) {
        return reply.status(422).send({ status: false, message: error.message });
      }
      throw error;
    }
  });

  // ---- POST /api/change-password (authenticated) -------------------------

  const account =
    deps.account ??
    new AccountService(new PrismaAccountRepository(), { make: (p) => hashPassword(p) }, randomBytes);

  app.post(
    '/api/change-password',
    { preHandler: authenticated(service) },
    async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(422).send({ status: false, message: firstError(parsed.error) });
      }

      return handle(reply, () =>
        account.changePassword(request.authUser!, parsed.data.password, parsed.data.new_password),
      );
    },
  );

  // ---- GET /api/check-emp-code/:code (public) ----------------------------

  /**
   * Reached from the login screen before anyone holds a token, so it stays
   * open — but it confirms whether a code exists, over a short and largely
   * sequential space, and answers with the company and unit behind it. The
   * rate limit is the only thing bounding that.
   */
  app.get<{ Params: { code: string } }>(
    '/api/check-emp-code/:code',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        const found = await account.checkEmpCode(request.params.code);
        return reply.send({ status: true, ...found });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.status(error.statusCode).send({ status: false, message: error.message });
        }
        throw error;
      }
    },
  );

  // ---- POST /api/register (admin only) -----------------------------------

  app.post(
    '/api/register',
    { preHandler: authenticated(service, ['admin']) },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(422).send({ status: false, message: firstError(parsed.error) });
      }

      try {
        const { user } = await account.register({
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
          role: parsed.data.role ?? null,
          companyCode: parsed.data.company_code ?? null,
        });

        noStore(reply);
        return reply.send({ status: true, message: 'User registered successfully', user });
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.status(error.statusCode).send({ status: false, message: error.message });
        }
        throw error;
      }
    },
  );
}

/**
 * SMTP in production, a logging stub everywhere else.
 *
 * Defaulting to `log` is deliberate: the SMTP credentials in .env are the live
 * account, so a development run configured by accident would email real
 * employees their colleagues' reset codes.
 */
function buildMailer(): Mailer {
  if (env.MAIL_MAILER !== 'smtp' || env.MAIL_HOST === '') {
    return new LoggingMailer();
  }

  return new SmtpMailer({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    encryption: env.MAIL_ENCRYPTION,
    username: env.MAIL_USERNAME,
    password: env.MAIL_PASSWORD,
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName: env.MAIL_FROM_NAME,
    logoPath: path.resolve(process.cwd(), env.MAIL_LOGO_PATH),
  });
}
