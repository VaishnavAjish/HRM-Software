import { describe, it, expect, beforeEach } from 'vitest';

import { AccountService, generateEmpCode, type AccountRepository } from './account.service.js';
import { IdentityService, type IdentityRepository, type IdentityUserRow } from './identity.service.js';
import { InMemoryPublicDisk, randomName, UploadRejected } from '../../lib/storage/public-disk.js';
import type { AuthUserRow } from './auth.service.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';

/** Deterministic bytes so generated codes and names are assertable. */
const fixedBytes = (n: number) => Buffer.alloc(n, 1);

class FakeAccountRepo implements AccountRepository {
  passwords: { id: number; hashed: string }[] = [];
  created: Parameters<AccountRepository['createUser']>[0][] = [];
  constructor(
    public byCode: Record<string, { company_code: string | null; unit: string | null }> = {},
    public emails: string[] = [],
  ) {}

  async updatePassword(id: number, hashed: string) {
    this.passwords.push({ id, hashed });
  }
  async findByEmpCode(code: string) {
    return this.byCode[code] ?? null;
  }
  async emailExists(email: string) {
    return this.emails.includes(email);
  }
  async createUser(data: Parameters<AccountRepository['createUser']>[0]) {
    this.created.push(data);
    return {
      id: 99,
      name: data.name,
      email: data.email,
      emp_code: data.empCode,
      password: data.hashedPassword,
      role: data.role,
      type: data.type,
      company_code: data.companyCode,
      status: '0',
      is_deleted: '0',
    } as unknown as AuthUserRow;
  }
}

const hasher = { make: async (p: string) => `hashed:${p}` };

describe('generateEmpCode', () => {
  it('produces eight upper-case alphanumerics, as Str::random(8) upper-cased does', () => {
    expect(generateEmpCode(fixedBytes)).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe('changePassword', () => {
  let repo: FakeAccountRepo;
  let service: AccountService;
  let user: AuthUserRow;

  beforeEach(async () => {
    repo = new FakeAccountRepo();
    service = new AccountService(repo, hasher, fixedBytes);
    user = { id: 7, password: await hashPassword('current-one', 4) } as AuthUserRow;
  });

  it('changes the password when the current one is right', async () => {
    await expect(service.changePassword(user, 'current-one', 'brand-new')).resolves.toEqual({
      message: 'Password changed successfully',
    });
    expect(repo.passwords).toEqual([{ id: 7, hashed: 'hashed:brand-new' }]);
  });

  it('refuses when the current password is wrong', async () => {
    // A valid token can be a borrowed laptop; this is what stops a walk-up
    // from locking the owner out.
    await expect(service.changePassword(user, 'not-it', 'brand-new')).rejects.toMatchObject({
      statusCode: 422,
      message: 'Current password is incorrect',
    });
    expect(repo.passwords).toEqual([]);
  });

  it('stores a hash, never the plaintext', async () => {
    await service.changePassword(user, 'current-one', 'brand-new');
    expect(repo.passwords[0]!.hashed).not.toBe('brand-new');
  });
});

describe('checkEmpCode', () => {
  const service = new AccountService(
    new FakeAccountRepo({ '1138': { company_code: 'nidhi-impex', unit: 'Ichapur' } }),
    hasher,
    fixedBytes,
  );

  it('returns the company and unit the login screen prefills', async () => {
    await expect(service.checkEmpCode('1138')).resolves.toEqual({
      company_code: 'nidhi-impex',
      unit: 'Ichapur',
    });
  });

  it('404s an unknown code', async () => {
    await expect(service.checkEmpCode('9999')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns only those two fields', async () => {
    // Anything more would widen what an unauthenticated caller learns from a
    // code they can guess.
    expect(Object.keys(await service.checkEmpCode('1138')).sort()).toEqual(['company_code', 'unit']);
  });
});

describe('register', () => {
  let repo: FakeAccountRepo;
  let service: AccountService;

  beforeEach(() => {
    repo = new FakeAccountRepo({}, ['taken@test.local']);
    service = new AccountService(repo, hasher, fixedBytes);
  });

  const input = { name: 'New Admin', email: 'new@test.local', password: 'secret123' };

  it('creates the account', async () => {
    const { user } = await service.register(input);
    expect(user.email).toBe('new@test.local');
  });

  it('refuses a duplicate email', async () => {
    // users.email is uniquely indexed; without this the insert would 500.
    await expect(service.register({ ...input, email: 'taken@test.local' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('always assigns an emp_code', async () => {
    await service.register(input);
    // A null emp_code plus a null type is what getAppointment() treats as a
    // pending appointment, so every admin created here would appear in the
    // Appointments list.
    expect(repo.created[0]!.empCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('marks role 4 as an agent', async () => {
    await service.register({ ...input, role: 4 });
    // 'agent' is the value the rest of the app keys off; without it, agents
    // would leak into View Employees instead.
    expect(repo.created[0]!.type).toBe('agent');
  });

  it('leaves type null for other roles', async () => {
    await service.register({ ...input, role: 1 });
    expect(repo.created[0]!.type).toBeNull();
  });

  it('defaults to role 1', async () => {
    await service.register(input);
    expect(repo.created[0]!.role).toBe(1);
  });

  it('never returns the password hash', async () => {
    const { user } = await service.register(input);
    expect(user).not.toHaveProperty('password');
  });
});

// ---- identity claim (type 0) ---------------------------------------------

class FakeIdentityRepo implements IdentityRepository {
  recorded: Parameters<IdentityRepository['recordVerification']>[1][] = [];
  constructor(public rows: IdentityUserRow[]) {}

  async findForClaim(empCode: string, companyCode: string) {
    return this.rows.find((r) => r.emp_code === empCode && r.company_code === companyCode) ?? null;
  }
  async recordVerification(_id: number, data: Parameters<IdentityRepository['recordVerification']>[1]) {
    this.recorded.push(data);
  }
}

const AADHAAR = '715115981345';

const identityRow = (over: Partial<IdentityUserRow> = {}): IdentityUserRow => ({
  id: 5,
  name: 'Ravi',
  email: 'ravi@test.local',
  emp_code: '1138',
  company_code: 'nidhi-impex',
  unit: 'Ichapur',
  address: null,
  photo: null,
  is_deleted: '0',
  aadhaarOnFile: AADHAAR,
  ...over,
});

describe('identity claim', () => {
  let repo: FakeIdentityRepo;
  let disk: InMemoryPublicDisk;
  let service: IdentityService;

  beforeEach(() => {
    repo = new FakeIdentityRepo([identityRow()]);
    disk = new InMemoryPublicDisk();
    service = new IdentityService(repo, disk);
  });

  const claim = (over = {}) =>
    service.claim({ empCode: '1138', companyCode: 'nidhi-impex', aadhaar: AADHAAR, ...over });

  it('verifies a matching Aadhaar and issues a token', async () => {
    const result = await claim();

    expect(result.message).toBe('Identity verified');
    expect(result.verification_token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.data.emp_code).toBe('1138');
  });

  it('stores only the hash of the token', async () => {
    const result = await claim();
    // A database read must not be replayable as a valid token.
    expect(repo.recorded[0]!.verificationTokenHash).not.toBe(result.verification_token);
    expect(repo.recorded[0]!.verificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires the token in fifteen minutes', async () => {
    await claim();
    const ms = repo.recorded[0]!.expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(14 * 60_000);
    expect(ms).toBeLessThanOrEqual(15 * 60_000);
  });

  it('accepts a formatted number', async () => {
    await expect(claim({ aadhaar: '7151 1598 1345' })).resolves.toBeDefined();
  });

  it('rejects a mismatched Aadhaar', async () => {
    await expect(claim({ aadhaar: '123456789012' })).rejects.toMatchObject({
      statusCode: 422,
      message: 'Details do not match our records',
    });
    expect(repo.recorded).toEqual([]);
  });

  it('rejects a malformed Aadhaar before looking anything up', async () => {
    await expect(claim({ aadhaar: '12345' })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('404s an unknown employee code', async () => {
    await expect(claim({ empCode: '9999' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a deactivated account', async () => {
    repo.rows[0]!.is_deleted = '1';
    await expect(claim()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('captures the number on a first-time claim', async () => {
    repo.rows[0]!.aadhaarOnFile = null;
    await claim({ aadhaar: '7151 1598 1345' });

    // Normalised, not as typed.
    expect(repo.recorded[0]!.aadhaar).toBe(AADHAAR);
  });

  it('does not rewrite an Aadhaar already on file', async () => {
    await claim();
    expect(repo.recorded[0]!.aadhaar).toBeUndefined();
  });

  it('stores a photo when none is held', async () => {
    await claim({ photo: { contents: Buffer.from('jpegdata'), mimeType: 'image/jpeg' } });

    expect(disk.written).toHaveLength(1);
    expect(repo.recorded[0]!.photo).toMatch(/^employee-photos\/[A-Za-z0-9]{40}\.jpg$/);
  });

  it('never overwrites an existing photo', async () => {
    repo.rows[0]!.photo = 'employee-photos/existing.jpg';
    await claim({ photo: { contents: Buffer.from('jpegdata'), mimeType: 'image/jpeg' } });

    // This endpoint is unauthenticated; letting it replace a stored photo
    // would make it a defacement vector.
    expect(disk.written).toEqual([]);
    expect(repo.recorded[0]!.photo).toBeUndefined();
  });

  it('rejects a non-image upload', async () => {
    await expect(
      claim({ photo: { contents: Buffer.from('%PDF'), mimeType: 'application/pdf' } }),
    ).rejects.toBeInstanceOf(UploadRejected);
  });

  it('rejects an oversized upload', async () => {
    await expect(
      claim({ photo: { contents: Buffer.alloc(5121 * 1024), mimeType: 'image/png' } }),
    ).rejects.toBeInstanceOf(UploadRejected);
  });

  it('fills a blank address but leaves an existing one', async () => {
    await claim({ address: '12 Example Road' });
    expect(repo.recorded[0]!.address).toBe('12 Example Road');

    repo.rows[0]!.address = 'Already here';
    repo.recorded = [];
    await claim({ address: 'Replacement' });
    expect(repo.recorded[0]!.address).toBeUndefined();
  });

  it('issues a different token every time', async () => {
    const a = await claim();
    const b = await claim();
    expect(a.verification_token).not.toBe(b.verification_token);
  });
});

describe('randomName', () => {
  it('matches Laravel hashName()\'s 40-character stem', () => {
    expect(randomName()).toMatch(/^[A-Za-z0-9]{40}$/);
  });
});
