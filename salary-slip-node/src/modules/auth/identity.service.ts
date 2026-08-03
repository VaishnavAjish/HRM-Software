import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AuthError } from './auth.service.js';
import { isValid, normalise } from '../../lib/laravel/aadhaar.js';
import type { PublicDisk } from '../../lib/storage/public-disk.js';

/**
 * The identity claim — POST /new-emp_code, type 0.
 *
 * Step 1 of the account-claim flow: an employee proves who they are with an
 * employee code plus the Aadhaar on file, and receives a short-lived
 * verification token that the later steps require.
 *
 * The screen collects an Aadhaar, not a mobile number, but the client sends it
 * under a spread of legacy field names left over from earlier iterations of
 * this flow — including `mobile_number`. All of them are accepted here for the
 * same reason PHP accepts them: any one of them may be what arrives.
 */

export interface IdentityUserRow {
  id: number;
  name: string | null;
  email: string | null;
  emp_code: string | null;
  company_code: string | null;
  unit: string | null;
  address: string | null;
  photo: string | null;
  is_deleted: number | string | null;
  /** Decrypted by the caller; the raw column is never handled here. */
  aadhaarOnFile: string | null;
}

export interface IdentityRepository {
  findForClaim(empCode: string, companyCode: string, unit?: string | null): Promise<IdentityUserRow | null>;
  /** Persists the claim: token hash, expiry, and any first-time values. */
  recordVerification(
    id: number,
    data: {
      verificationTokenHash: string;
      expiresAt: Date;
      aadhaar?: string;
      address?: string;
      photo?: string;
    },
  ): Promise<void>;
}

export interface UploadedPhoto {
  contents: Buffer;
  mimeType: string;
}

export interface IdentityClaimInput {
  empCode: string;
  companyCode?: string | null;
  unit?: string | null;
  /** Any of the legacy aliases, already collapsed to one value by the route. */
  aadhaar: string;
  address?: string | null;
  photo?: UploadedPhoto | null;
}

export interface IdentityClaimResult {
  message: string;
  data: {
    emp_code: string | null;
    name: string | null;
    email: string | null;
    company_code: string | null;
    unit: string | null;
  };
  verification_token: string;
}

/** PHP default when the client omits it. */
const DEFAULT_COMPANY = 'nidhi-impex';
const TOKEN_TTL_MINUTES = 15;

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class IdentityService {
  constructor(
    private readonly users: IdentityRepository,
    private readonly disk: PublicDisk,
  ) {}

  async claim(input: IdentityClaimInput): Promise<IdentityClaimResult> {
    if (!input.empCode) {
      throw new AuthError('The emp code field is required.', 422);
    }

    const user = await this.users.findForClaim(
      input.empCode,
      input.companyCode || DEFAULT_COMPANY,
      input.unit ?? null,
    );

    if (!user) {
      throw new AuthError('Employee not found', 404);
    }
    if (toInt(user.is_deleted) === 1) {
      throw new AuthError('Account is deactivated', 403);
    }

    const submitted = normalise(input.aadhaar);
    if (!isValid(submitted)) {
      throw new AuthError('Enter a valid 12-digit Aadhar card number', 422);
    }

    const onFile = normalise(user.aadhaarOnFile ?? '');

    if (onFile !== '' && !constantTimeEquals(onFile, submitted)) {
      throw new AuthError('Details do not match our records', 422);
    }

    /*
     * First-time claim: with nothing on file there is nothing to check
     * against, so the submitted number is captured and future attempts are
     * compared to it.
     *
     * Worth being explicit about what this means — for an employee whose
     * Aadhaar has never been recorded, knowing the employee code alone is
     * enough to claim the account. Employee codes here are short and
     * sequential. This is inherited from the PHP implementation and preserved
     * deliberately, because tightening it would lock out exactly the
     * un-onboarded staff the flow exists to serve. The route's rate limit
     * (15/min) is the only thing bounding it.
     */
    const firstTime = onFile === '';

    // Stored only if absent: an existing photo or address is never overwritten
    // by this unauthenticated endpoint.
    let photoPath: string | undefined;
    if (input.photo && !user.photo) {
      photoPath = (await this.disk.store('employee-photos', input.photo.contents, input.photo.mimeType))
        .path;
    }

    const token = randomBytes(32).toString('hex');

    await this.users.recordVerification(user.id, {
      // Only the hash is stored, so a database read cannot be replayed as a
      // valid token.
      verificationTokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
      ...(firstTime ? { aadhaar: submitted } : {}),
      ...(!user.address && input.address ? { address: input.address } : {}),
      ...(photoPath ? { photo: photoPath } : {}),
    });

    return {
      message: 'Identity verified',
      data: {
        emp_code: user.emp_code,
        name: user.name,
        email: user.email,
        company_code: user.company_code,
        unit: user.unit,
      },
      // The only time the plaintext token exists outside this response.
      verification_token: token,
    };
  }
}
