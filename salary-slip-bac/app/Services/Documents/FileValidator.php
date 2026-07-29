<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use Illuminate\Http\UploadedFile;

/**
 * Content-based upload validation.
 *
 * Nothing the browser says is trusted — not Content-Type, not the extension,
 * not the declared size. The file's own bytes decide what it is.
 */
class FileValidator
{
    /** Leading signatures for the formats we accept. */
    private const MAGIC = [
        'application/pdf' => ["%PDF-"],
        'image/jpeg'      => ["\xFF\xD8\xFF"],
        'image/png'       => ["\x89PNG\r\n\x1A\n"],
        'image/gif'       => ["GIF87a", "GIF89a"],
        // WEBP is "RIFF"<4 byte size>"WEBP" — the size bytes are skipped below.
        'image/webp'      => ["RIFF"],
    ];

    /**
     * @return array{mime:string,extension:string,size:int} validated facts
     * @throws DocumentException
     */
    public function validate(UploadedFile $file, string $documentType): array
    {
        if (!$file->isValid()) {
            throw new DocumentException(
                DocumentException::FILE_CORRUPTED,
                'The file failed to upload or is corrupted.'
            );
        }

        $size = (int) $file->getSize();

        if ($size <= 0) {
            throw new DocumentException(DocumentException::FILE_EMPTY, 'The file is empty.');
        }

        $max = (int) config('documents.max_file_size');

        if ($size > $max) {
            throw new DocumentException(
                DocumentException::FILE_TOO_LARGE,
                'The file is larger than ' . round($max / 1048576, 1) . ' MB.'
            );
        }

        $this->assertExtensionAllowed($file->getClientOriginalName());

        // Sniffed from content by Symfony's MimeTypes guesser, not the header.
        $mime = (string) $file->getMimeType();

        $allowed = config('documents.allowed_mime_types.' . $documentType)
            ?? config('documents.allowed_mime_types.default', []);

        if (!in_array($mime, $allowed, true)) {
            throw new DocumentException(
                DocumentException::FILE_TYPE_NOT_ALLOWED,
                'The selected file type is not supported for this document.'
            );
        }

        if (!$this->matchesSignature($file->getPathname(), $mime)) {
            throw new DocumentException(
                DocumentException::MIME_MISMATCH,
                'The file contents do not match its reported type.'
            );
        }

        return [
            'mime'      => $mime,
            'extension' => \App\Support\DocumentFileName::extensionFor($mime),
            'size'      => $size,
        ];
    }

    /**
     * Blocks dangerous extensions anywhere in the name, so double extensions
     * such as "invoice.pdf.php" are rejected rather than passing on the tail.
     */
    private function assertExtensionAllowed(string $originalName): void
    {
        $blocked = array_map('strtolower', (array) config('documents.blocked_extensions', []));
        $parts = array_map('strtolower', array_slice(explode('.', $originalName), 1));

        foreach ($parts as $part) {
            if (in_array($part, $blocked, true)) {
                throw new DocumentException(
                    DocumentException::FILE_TYPE_NOT_ALLOWED,
                    'Executable and script files are not allowed.'
                );
            }
        }
    }

    private function matchesSignature(string $path, string $mime): bool
    {
        $signatures = self::MAGIC[$mime] ?? null;

        if (!$signatures) {
            return false;
        }

        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return false;
        }

        $head = (string) fread($handle, 16);
        fclose($handle);

        foreach ($signatures as $signature) {
            if (str_starts_with($head, $signature)) {
                // RIFF alone is also AVI/WAV — require the WEBP form marker.
                if ($mime === 'image/webp') {
                    return substr($head, 8, 4) === 'WEBP';
                }

                return true;
            }
        }

        return false;
    }
}
