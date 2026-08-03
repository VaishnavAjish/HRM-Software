import crypto from 'node:crypto';

/**
 * Wire-compatible reimplementation of Laravel's Encrypter.
 *
 * Every `encrypted_aadhaar_number` already in the database was written by
 * PHP, so Node cannot invent its own scheme — it has to read and write the
 * exact envelope Laravel produces:
 *
 *   base64( json({ iv, value, mac, tag }) )
 *
 *   iv    base64 of 16 random bytes
 *   value base64 of AES-256-CBC ciphertext
 *   mac   hex HMAC-SHA256 over (iv_b64 || value_b64), keyed with APP_KEY
 *   tag   "" for CBC; only AEAD ciphers (GCM) populate it
 *
 * Verified against Illuminate\Encryption\Encrypter rather than written from
 * the documentation — see scripts/generate-fixtures.php, whose output this
 * module is tested against in both directions.
 *
 * Note the model uses the `encrypted` cast, which maps to
 * encryptString/decryptString — i.e. serialize = false. No PHP `serialize()`
 * envelope is involved, which is what keeps this interoperable at all.
 */

const CIPHER = 'aes-256-cbc';
const IV_BYTES = 16;
const KEY_BYTES = 32;

export class DecryptException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptException';
  }
}

interface Envelope {
  iv: string;
  value: string;
  mac: string;
  tag?: string;
}

/**
 * APP_KEY arrives as `base64:...` in .env. Laravel strips that prefix and uses
 * the decoded bytes directly — it is not a passphrase and is never hashed.
 */
export function parseAppKey(appKey: string): Buffer {
  const raw = appKey.startsWith('base64:') ? appKey.slice(7) : appKey;
  const key = Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APP_KEY must decode to ${KEY_BYTES} bytes for ${CIPHER}, got ${key.length}.`,
    );
  }
  return key;
}

export class LaravelEncrypter {
  private readonly key: Buffer;

  constructor(appKey: string) {
    this.key = parseAppKey(appKey);
  }

  /** Equivalent of Encrypter::encryptString(). */
  encryptString(plain: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(CIPHER, this.key, iv);
    const value = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]).toString('base64');

    const ivB64 = iv.toString('base64');

    const envelope: Envelope = {
      iv: ivB64,
      value,
      mac: this.mac(ivB64, value),
      tag: '',
    };

    return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  }

  /** Equivalent of Encrypter::decryptString(). */
  decryptString(payload: string): string {
    const envelope = this.decodeEnvelope(payload);

    // Timing-safe, exactly as Laravel's validMac() is — a byte-wise compare
    // here would leak how much of a forged MAC was correct.
    if (!this.macMatches(envelope)) {
      throw new DecryptException('The MAC is invalid.');
    }

    const iv = Buffer.from(envelope.iv, 'base64');
    if (iv.length !== IV_BYTES) {
      throw new DecryptException('The payload is invalid.');
    }

    try {
      const decipher = crypto.createDecipheriv(CIPHER, this.key, iv);
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.value, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // A wrong key surfaces here as a padding error. Laravel reports the same
      // generic message for every failure so the response cannot be used as an
      // oracle to distinguish "bad key" from "tampered ciphertext".
      throw new DecryptException('Could not decrypt the data.');
    }
  }

  /** Read without throwing — for tolerating legacy rows written before the cast. */
  tryDecryptString(payload: string | null | undefined): string | null {
    if (payload === null || payload === undefined || payload === '') return null;
    try {
      return this.decryptString(payload);
    } catch {
      return null;
    }
  }

  private mac(ivB64: string, value: string): string {
    return crypto
      .createHmac('sha256', this.key)
      .update(ivB64 + value, 'utf8')
      .digest('hex');
  }

  private macMatches(envelope: Envelope): boolean {
    const expected = Buffer.from(this.mac(envelope.iv, envelope.value), 'utf8');
    const actual = Buffer.from(envelope.mac, 'utf8');

    // timingSafeEqual throws on a length mismatch, which is itself a signal —
    // so the lengths are compared first and both paths return the same way.
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }

  private decodeEnvelope(payload: string): Envelope {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {
      throw new DecryptException('The payload is invalid.');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Envelope).iv !== 'string' ||
      typeof (parsed as Envelope).value !== 'string' ||
      typeof (parsed as Envelope).mac !== 'string'
    ) {
      throw new DecryptException('The payload is invalid.');
    }

    return parsed as Envelope;
  }
}
