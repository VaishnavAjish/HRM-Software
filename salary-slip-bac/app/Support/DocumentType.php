<?php

namespace App\Support;

/**
 * Catalogue of document types a user may upload.
 *
 * The slug (e.g. PAN_CARD) is what goes into generated filenames and storage
 * paths, so it is the stable identifier — labels may be reworded freely, slugs
 * must not change once files exist on disk.
 */
class DocumentType
{
    public const CATEGORIES = [
        'Identity' => [
            'AADHAR_CARD'         => 'Aadhaar Card',
            'PAN_CARD'            => 'PAN Card',
            'PASSPORT'            => 'Passport',
            'DRIVING_LICENSE'     => 'Driving License',
            'VOTER_ID'            => 'Voter ID',
        ],
        'Bank' => [
            'CANCELLED_CHEQUE'    => 'Cancelled Cheque',
            'BANK_PASSBOOK'       => 'Passbook',
            'BANK_STATEMENT'      => 'Bank Statement',
        ],
        'Employment' => [
            'OFFER_LETTER'        => 'Offer Letter',
            'APPOINTMENT_LETTER'  => 'Appointment Letter',
            'SALARY_SLIP'         => 'Salary Slip',
            'EXPERIENCE_LETTER'   => 'Experience Letter',
            'RELIEVING_LETTER'    => 'Relieving Letter',
            'EMPLOYMENT_ID'       => 'Employment ID',
        ],
        'Education' => [
            'SSC'                 => 'SSC',
            'HSC'                 => 'HSC',
            'GRADUATION'          => 'Graduation',
            'DIPLOMA'             => 'Diploma',
            'DEGREE_CERTIFICATE'  => 'Degree Certificate',
            'MARKSHEET'           => 'Marksheet',
        ],
        'Address' => [
            'ELECTRICITY_BILL'    => 'Electricity Bill',
            'WATER_BILL'          => 'Water Bill',
            'GAS_BILL'            => 'Gas Bill',
            'RENT_AGREEMENT'      => 'Rent Agreement',
        ],
        'Tax' => [
            'FORM_16'             => 'Form 16',
            'ITR'                 => 'ITR',
        ],
        'Medical' => [
            'MEDICAL_CERTIFICATE' => 'Medical Certificate',
            'INSURANCE_CARD'      => 'Insurance Card',
        ],
        'Others' => [
            'PHOTOGRAPH'          => 'Photograph',
            'SIGNATURE'           => 'Signature',
            'RESUME'              => 'Resume',
            'CV'                  => 'CV',
            'OTHER'               => 'Other',
        ],
    ];

    /** Legacy per-column fields on `users` mapped onto catalogue slugs. */
    public const LEGACY_FIELD_MAP = [
        'photo'        => 'PHOTOGRAPH',
        'adhar_image'  => 'AADHAR_CARD',
        'pan_image'    => 'PAN_CARD',
        'check_image'  => 'CANCELLED_CHEQUE',
        'account_book' => 'BANK_PASSBOOK',
    ];

    /** @return array<string,string> slug => label */
    public static function all(): array
    {
        return array_merge(...array_values(self::CATEGORIES));
    }

    public static function slugs(): array
    {
        return array_keys(self::all());
    }

    public static function isValid(?string $slug): bool
    {
        return $slug !== null && array_key_exists($slug, self::all());
    }

    public static function label(string $slug): ?string
    {
        return self::all()[$slug] ?? null;
    }

    public static function categoryOf(string $slug): ?string
    {
        foreach (self::CATEGORIES as $category => $types) {
            if (array_key_exists($slug, $types)) {
                return $category;
            }
        }

        return null;
    }

    /**
     * Turn a free-text label into a catalogue-shaped slug:
     * "Driving License" -> DRIVING_LICENSE, "PAN  Card!" -> PAN_CARD.
     * Returns OTHER when nothing recognisable survives.
     */
    public static function normalise(?string $value): string
    {
        if ($value === null || trim($value) === '') {
            return 'OTHER';
        }

        // Strip anything that is not a letter or digit (covers punctuation,
        // emoji and non-ASCII), collapse runs to a single underscore, uppercase.
        $slug = preg_replace('/[^A-Za-z0-9]+/u', '_', $value);
        $slug = strtoupper(trim($slug, '_'));

        return self::isValid($slug) ? $slug : 'OTHER';
    }
}
