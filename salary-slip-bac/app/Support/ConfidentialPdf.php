<?php

namespace App\Support;

/**
 * A minimal, dependency-free PDF writer for confidential identity documents.
 *
 * Why not dompdf/mPDF: the documented production deploy copies source
 * directories onto the box and never runs `composer install`, so a new composer
 * requirement would resolve locally and then fatal in production. This emits a
 * valid PDF 1.4 using only the two core Type1 fonts every reader ships with —
 * no vendor package, no font files, no HTML engine.
 *
 * It is not a general-purpose renderer. It lays out a title, a confidential
 * banner, label/value rows and a footer, which is exactly what this document is,
 * and no more. Content streams are left uncompressed: the file is small, and a
 * reviewer or a test can read the bytes directly to confirm what did and did not
 * end up inside.
 */
class ConfidentialPdf
{
    /** A4 in PostScript points. */
    private const PAGE_WIDTH = 595.28;

    private const PAGE_HEIGHT = 841.89;

    private const MARGIN = 42.0;

    private const LABEL_WIDTH = 150.0;

    private const LINE_HEIGHT = 16.0;

    /** Reserved at the bottom of every page for the footer block. */
    private const FOOTER_RESERVE = 76.0;

    /**
     * @param  array{
     *     title?: string,
     *     subtitle?: string,
     *     banner?: list<string>,
     *     sections?: list<array{heading?: string, fields?: list<array{0: string, 1: string}>}>,
     *     footer?: list<string>,
     *     watermark?: string
     * }  $spec
     */
    public static function render(array $spec): string
    {
        $pages = self::layout($spec);

        $objects = [];

        // 1 Catalog, 2 Pages, 3 Helvetica, 4 Helvetica-Bold, then page/content
        // pairs. Object numbers have to be known before the bodies reference each
        // other, so the fixed ones come first.
        $firstPageObject = 5;
        $pageObjectNumbers = [];

        foreach (array_keys($pages) as $index) {
            $pageObjectNumbers[] = $firstPageObject + ($index * 2);
        }

        $kids = implode(' ', array_map(static fn ($n) => "{$n} 0 R", $pageObjectNumbers));

        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[2] = '<< /Type /Pages /Kids ['.$kids.'] /Count '.count($pages).' >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

        foreach ($pages as $index => $stream) {
            $pageNumber = $firstPageObject + ($index * 2);
            $contentNumber = $pageNumber + 1;

            $objects[$pageNumber] = '<< /Type /Page /Parent 2 0 R '
                .'/MediaBox [0 0 '.self::PAGE_WIDTH.' '.self::PAGE_HEIGHT.'] '
                .'/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> '
                ."/Contents {$contentNumber} 0 R >>";

            $objects[$contentNumber] = '<< /Length '.strlen($stream)." >>\nstream\n".$stream."\nendstream";
        }

        ksort($objects);

        return self::assemble($objects);
    }

    /**
     * Build one content stream per page.
     *
     * @return list<string>
     */
    private static function layout(array $spec): array
    {
        $watermark = (string) ($spec['watermark'] ?? 'CONFIDENTIAL');
        $footer = array_values(array_filter((array) ($spec['footer'] ?? [])));

        $pages = [];
        $current = '';
        $y = self::PAGE_HEIGHT - self::MARGIN;

        $startPage = function () use (&$current, &$y, $watermark) {
            $current = self::watermarkOps($watermark);
            $y = self::PAGE_HEIGHT - self::MARGIN;
        };

        $startPage();

        // Banner first, so a page found on a desk is identifiable before anything
        // else is read.
        foreach ((array) ($spec['banner'] ?? []) as $offset => $line) {
            $size = $offset === 0 ? 13.0 : 9.0;
            $current .= self::centredText((string) $line, $y, $size, true);
            $y -= $size + 5;
        }

        if (! empty($spec['banner'])) {
            $y -= 4;
            $current .= self::rule($y);
            $y -= 18;
        }

        if (! empty($spec['title'])) {
            $current .= self::centredText((string) $spec['title'], $y, 15.0, true);
            $y -= 22;
        }

        if (! empty($spec['subtitle'])) {
            $current .= self::centredText((string) $spec['subtitle'], $y, 10.0, false);
            $y -= 18;
        }

        $current .= self::rule($y);
        $y -= 22;

        foreach ((array) ($spec['sections'] ?? []) as $section) {
            $heading = (string) ($section['heading'] ?? '');
            $fields = (array) ($section['fields'] ?? []);

            // Keep a heading with at least its first row rather than orphaning it
            // at the foot of a page.
            if ($heading !== '') {
                if ($y - (self::LINE_HEIGHT * 2) < self::MARGIN + self::FOOTER_RESERVE) {
                    $pages[] = $current;
                    $startPage();
                }

                $current .= self::text($heading, self::MARGIN, $y, 10.0, true);
                $y -= 6;
                $current .= self::rule($y);
                $y -= 16;
            }

            foreach ($fields as $field) {
                if ($y - self::LINE_HEIGHT < self::MARGIN + self::FOOTER_RESERVE) {
                    $pages[] = $current;
                    $startPage();
                }

                $label = (string) ($field[0] ?? '');
                $value = (string) ($field[1] ?? '');

                $current .= self::text($label, self::MARGIN, $y, 9.0, true);
                $current .= self::text(':', self::MARGIN + self::LABEL_WIDTH - 8, $y, 9.0, true);
                $current .= self::text(
                    self::truncate($value, 74),
                    self::MARGIN + self::LABEL_WIDTH,
                    $y,
                    10.0,
                    false
                );

                $y -= self::LINE_HEIGHT;
            }

            $y -= 10;
        }

        $pages[] = $current;

        // The footer carries who generated the document and when, which is the
        // part that makes a stray printout traceable. Every page gets it.
        $total = count($pages);

        foreach ($pages as $index => $stream) {
            $pages[$index] = $stream.self::footerOps($footer, $index + 1, $total);
        }

        return $pages;
    }

    /** Diagonal watermark, drawn first so text sits on top of it. */
    private static function watermarkOps(string $text): string
    {
        if ($text === '') {
            return '';
        }

        // 45 degrees, running from lower-left to upper-right.
        $cos = 0.7071;
        $sin = 0.7071;

        return "q\n0.88 0.88 0.88 rg\nBT\n/F2 62 Tf\n"
            .sprintf("%.4f %.4f %.4f %.4f %.2f %.2f Tm\n", $cos, $sin, -$sin, $cos, 96.0, 190.0)
            .'('.self::escape($text).") Tj\nET\nQ\n";
    }

    /** @param list<string> $lines */
    private static function footerOps(array $lines, int $page, int $total): string
    {
        $y = self::MARGIN + 46.0;
        $ops = self::rule($y);
        $y -= 13;

        foreach ($lines as $line) {
            $ops .= self::text((string) $line, self::MARGIN, $y, 8.0, false, 0.25);
            $y -= 11;
        }

        $ops .= self::text(
            "Page {$page} of {$total}",
            self::PAGE_WIDTH - self::MARGIN - 52,
            self::MARGIN + 33.0,
            8.0,
            false,
            0.25
        );

        return $ops;
    }

    private static function rule(float $y): string
    {
        return sprintf(
            "q\n0.6 w\n0.2 0.2 0.2 RG\n%.2f %.2f m\n%.2f %.2f l\nS\nQ\n",
            self::MARGIN,
            $y,
            self::PAGE_WIDTH - self::MARGIN,
            $y
        );
    }

    private static function text(
        string $value,
        float $x,
        float $y,
        float $size,
        bool $bold,
        float $grey = 0.0
    ): string {
        if ($value === '') {
            return '';
        }

        $font = $bold ? 'F2' : 'F1';

        return sprintf("q\n%.2f %.2f %.2f rg\nBT\n/%s %.1f Tf\n%.2f %.2f Td\n", $grey, $grey, $grey, $font, $size, $x, $y)
            .'('.self::escape($value).") Tj\nET\nQ\n";
    }

    private static function centredText(string $value, float $y, float $size, bool $bold): string
    {
        // Helvetica averages a little under half the point size per character;
        // close enough to centre a heading without embedding a metrics table.
        $width = strlen(self::sanitise($value)) * $size * 0.5;
        $x = max(self::MARGIN, (self::PAGE_WIDTH - $width) / 2);

        return self::text($value, $x, $y, $size, $bold);
    }

    private static function truncate(string $value, int $limit): string
    {
        $clean = self::sanitise($value);

        return strlen($clean) > $limit ? substr($clean, 0, $limit - 1).'.' : $clean;
    }

    /** Core fonts are WinAnsi; anything outside it would render as garbage. */
    private static function sanitise(string $value): string
    {
        $value = preg_replace('/\s+/', ' ', $value) ?? $value;

        return trim((string) preg_replace('/[^\x20-\x7E]/', '', $value));
    }

    private static function escape(string $value): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], self::sanitise($value));
    }

    /** @param array<int, string> $objects keyed 1..n in order */
    private static function assemble(array $objects): string
    {
        $pdf = "%PDF-1.4\n";
        $offsets = [];

        foreach ($objects as $number => $body) {
            $offsets[$number] = strlen($pdf);
            $pdf .= $number." 0 obj\n".$body."\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $size = count($objects) + 1;

        $pdf .= "xref\n0 {$size}\n0000000000 65535 f \n";

        for ($number = 1; $number <= count($objects); $number++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$number]);
        }

        $pdf .= "trailer\n<< /Size {$size} /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF\n";

        return $pdf;
    }
}
