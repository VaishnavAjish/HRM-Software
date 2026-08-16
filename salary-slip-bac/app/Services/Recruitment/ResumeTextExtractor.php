<?php

namespace App\Services\Recruitment;

use Illuminate\Support\Facades\Log;
use PhpOffice\PhpWord\IOFactory as WordIOFactory;
use Smalot\PdfParser\Parser as PdfParser;

/**
 * Pulls plain text out of a candidate's resume so it can be compared against
 * a job requisition. Resume storage predates this feature and is
 * inconsistent (see CandidateController::resume()'s own multi-path search)
 * — uploads have landed on both the 'public' and 'local' disks depending on
 * which intake path was used, and resume_path itself isn't reliably
 * disk-relative. This mirrors that same defensive multi-location search
 * rather than assuming one convention.
 */
class ResumeTextExtractor
{
    /**
     * Returns extracted text, or null if the file could not be found or
     * parsed. Callers must treat null as "no signal", not "empty resume" —
     * scoring must not punish a candidate for a storage/parsing failure.
     */
    public function extract(?string $resumePath): ?string
    {
        if (!$resumePath) {
            return null;
        }

        $fullPath = $this->resolvePath($resumePath);

        if (!$fullPath) {
            return null;
        }

        $extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));

        try {
            return match ($extension) {
                'pdf' => $this->extractPdf($fullPath),
                'docx' => $this->extractDocx($fullPath),
                'doc' => $this->extractDoc($fullPath),
                'txt' => file_get_contents($fullPath) ?: null,
                default => null,
            };
        } catch (\Throwable $e) {
            Log::warning('resume_text_extraction_failed', [
                'path' => $resumePath,
                'extension' => $extension,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function resolvePath(string $resumePath): ?string
    {
        if (filter_var($resumePath, FILTER_VALIDATE_URL)) {
            // Remote/external resume storage isn't something this extractor
            // fetches over the network — out of scope, not a failure.
            return null;
        }

        $cleanPath = ltrim(str_replace('..', '', preg_replace('/^\/?(storage\/)?/i', '', $resumePath)), '/');

        $candidates = [
            storage_path('app/public/' . $cleanPath),
            storage_path('app/' . $cleanPath),
            storage_path('app/public/candidate-documents/' . basename($cleanPath)),
            storage_path('app/candidate-documents/' . basename($cleanPath)),
            public_path('storage/' . $cleanPath),
        ];

        foreach ($candidates as $path) {
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    private function extractPdf(string $path): ?string
    {
        $parser = new PdfParser();
        $text = $parser->parseFile($path)->getText();

        return trim($text) !== '' ? $text : null;
    }

    private function extractDocx(string $path): ?string
    {
        $phpWord = WordIOFactory::load($path, 'Word2007');

        return $this->extractPhpWordText($phpWord);
    }

    private function extractDoc(string $path): ?string
    {
        // PhpWord's legacy .doc reader is best-effort (binary format, no
        // official spec support). Failure here is expected for some files
        // and handled by the caller returning null, not throwing.
        $phpWord = WordIOFactory::load($path, 'MsDoc');

        return $this->extractPhpWordText($phpWord);
    }

    private function extractPhpWordText(\PhpOffice\PhpWord\PhpWord $phpWord): ?string
    {
        $text = '';

        foreach ($phpWord->getSections() as $section) {
            foreach ($section->getElements() as $element) {
                if (method_exists($element, 'getText')) {
                    $value = $element->getText();
                    $text .= (is_string($value) ? $value : '') . "\n";
                } elseif (method_exists($element, 'getElements')) {
                    foreach ($element->getElements() as $inner) {
                        if (method_exists($inner, 'getText')) {
                            $value = $inner->getText();
                            $text .= (is_string($value) ? $value : '') . ' ';
                        }
                    }
                }
            }
        }

        return trim($text) !== '' ? $text : null;
    }
}
