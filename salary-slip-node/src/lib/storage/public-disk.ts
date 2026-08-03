import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Laravel's `public` disk, as far as uploads need it.
 *
 * $file->store('employee-photos', 'public') writes to
 * storage/app/public/employee-photos/<hashName> and returns the RELATIVE path
 * — "employee-photos/xxx.jpg" — which is what goes in the database column. The
 * app then serves it through the storage symlink.
 *
 * Both halves have to match: writing elsewhere breaks serving, and storing an
 * absolute path in the column breaks every existing consumer of that value.
 */

/** Str::random(40) — Laravel's hashName() stem. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomName(length = 40): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/**
 * Extensions accepted for a photo, mirroring the PHP validator
 * 'image|mimes:jpeg,jpg,png,webp'.
 */
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const MAX_PHOTO_BYTES = 5120 * 1024; // PHP: max:5120 (kilobytes)

export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejected';
  }
}

export interface StoredFile {
  /** Relative path as stored in the database, e.g. employee-photos/ab12.jpg */
  path: string;
}

export interface PublicDisk {
  store(directory: string, contents: Buffer, mimeType: string): Promise<StoredFile>;
}

export class LocalPublicDisk implements PublicDisk {
  /** @param root absolute path to storage/app/public */
  constructor(private readonly root: string) {}

  async store(directory: string, contents: Buffer, mimeType: string): Promise<StoredFile> {
    const extension = ALLOWED.get(mimeType.toLowerCase());
    if (!extension) {
      throw new UploadRejected('The photo must be a file of type: jpeg, jpg, png, webp.');
    }
    if (contents.byteLength > MAX_PHOTO_BYTES) {
      throw new UploadRejected('The photo may not be greater than 5120 kilobytes.');
    }

    // The directory is a fixed literal at every call site, never user input,
    // but resolving and re-checking costs nothing and means a future caller
    // cannot turn it into a traversal.
    const relative = `${directory}/${randomName()}.${extension}`;
    const absolute = path.resolve(this.root, relative);

    if (!absolute.startsWith(path.resolve(this.root) + path.sep)) {
      throw new UploadRejected('Invalid upload path.');
    }

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);

    // Forward slashes: this value goes into the database and is concatenated
    // into URLs, so a Windows separator would break the served path.
    return { path: relative };
  }
}

/** Records what would have been written. Used by tests. */
export class InMemoryPublicDisk implements PublicDisk {
  written: { path: string; bytes: number }[] = [];

  async store(directory: string, contents: Buffer, mimeType: string): Promise<StoredFile> {
    const extension = ALLOWED.get(mimeType.toLowerCase());
    if (!extension) throw new UploadRejected('The photo must be a file of type: jpeg, jpg, png, webp.');
    if (contents.byteLength > MAX_PHOTO_BYTES) {
      throw new UploadRejected('The photo may not be greater than 5120 kilobytes.');
    }

    const stored = `${directory}/${randomName()}.${extension}`;
    this.written.push({ path: stored, bytes: contents.byteLength });
    return { path: stored };
  }
}
