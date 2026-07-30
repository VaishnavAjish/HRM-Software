<?php

namespace App\Services\Aadhaar;

use App\Exceptions\DocumentException;
use App\Models\AadhaarExportAuthorization;
use App\Models\User;
use App\Services\Documents\DocumentAudit;
use App\Support\AadhaarExportAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Issues and spends authorizations for confidential (full-Aadhaar) exports.
 *
 * The audit entry and the authorization are written in one transaction, so there
 * is no ordering in which an export is approved but unrecorded. If the audit
 * insert fails the authorization never exists, and the caller has nothing to
 * present to the PDF endpoint — the export fails closed rather than proceeding
 * untraceably.
 */
class AadhaarExportAuthorizer
{
    /**
     * Approve one export and return the record plus its single raw token.
     *
     * The raw token is returned, never stored: the row keeps only a SHA-256 hash,
     * so a dump of this table cannot be replayed against the PDF endpoint.
     *
     * @return array{authorization: AadhaarExportAuthorization, token: string}
     */
    public static function issue(
        User $actor,
        User $target,
        string $surface,
        string $exportType,
        string $aadhaarLast4
    ): array {
        $surface = strtoupper($surface);
        $exportType = strtoupper($exportType);
        $permission = AadhaarExportAccess::permissionFor($surface, $exportType);

        if ($permission === null) {
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_DENIED,
                'That export type is not supported.',
                422
            );
        }

        $rawToken = bin2hex(random_bytes(32));

        try {
            return DB::transaction(function () use (
                $actor, $target, $surface, $exportType, $permission, $rawToken, $aadhaarLast4
            ) {
                // Audit first. Not for ordering — the transaction makes both
                // writes atomic — but so the audit id can be stored on the
                // authorization and the two can be tied together afterwards.
                $entry = DocumentAudit::record(
                    self::authorizedAction($surface, $exportType),
                    null,
                    null,
                    [
                        'target_user_id' => $target->id,
                        'organization_code' => $target->company_code,
                        'unit' => $target->unit,
                        'surface' => $surface,
                        'export_type' => $exportType,
                        'permission_checked' => $permission,
                        'authorization_result' => 'ALLOWED',
                        // Last four only. The trail proves which record was
                        // exported without becoming a second copy of the number.
                        'aadhaar_last4' => $aadhaarLast4,
                    ],
                    $permission,
                    'ALLOWED'
                );

                if (! $entry) {
                    // Nothing observed this write, so nothing may be exported.
                    throw new DocumentException(
                        DocumentException::AADHAAR_EXPORT_AUDIT_FAILED,
                        'Confidential export could not be authorized.',
                        500
                    );
                }

                $authorization = AadhaarExportAuthorization::create([
                    'uuid' => (string) Str::uuid(),
                    'token_hash' => AadhaarExportAuthorization::hashToken($rawToken),
                    'actor_user_id' => $actor->id,
                    'target_user_id' => $target->id,
                    'surface' => $surface,
                    'export_type' => $exportType,
                    'permission' => $permission,
                    'organization_code' => $target->company_code,
                    'unit' => $target->unit,
                    'expires_at' => now()->addSeconds(AadhaarExportAccess::tokenTtlSeconds()),
                    'request_id' => request()->header('X-Request-Id'),
                    'audit_log_id' => $entry->id,
                ]);

                return ['authorization' => $authorization, 'token' => $rawToken];
            });
        } catch (DocumentException $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);

            // Any failure in that transaction — including the audit insert —
            // leaves no authorization behind and denies the export.
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_AUDIT_FAILED,
                'Confidential export could not be authorized.',
                500
            );
        }
    }

    /**
     * Spend a token for a PDF download.
     *
     * The update is conditional on used_at still being null and returns the
     * number of affected rows, so two concurrent requests carrying the same token
     * cannot both produce a file — the loser sees zero rows and is refused.
     */
    public static function consumeForPdf(
        User $actor,
        User $target,
        string $rawToken
    ): AadhaarExportAuthorization {
        $authorization = AadhaarExportAuthorization::where(
            'token_hash',
            AadhaarExportAuthorization::hashToken($rawToken)
        )->first();

        if (! $authorization || ! $authorization->permits(
            (int) $actor->id,
            (int) $target->id,
            AadhaarExportAccess::TYPE_PDF
        )) {
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_TOKEN_INVALID,
                'This confidential export authorization is no longer valid. Request a new export.',
                403
            );
        }

        $spent = AadhaarExportAuthorization::where('id', $authorization->id)
            ->whereNull('used_at')
            ->update(['used_at' => now()]);

        if ($spent !== 1) {
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_TOKEN_INVALID,
                'This confidential export authorization has already been used.',
                403
            );
        }

        return $authorization->fresh();
    }

    /**
     * Verify a token for a print, without spending it.
     *
     * A print is not a download: the browser may re-render the print view (a
     * cancelled dialog reopened, a second copy from the same sheet of state) and
     * burning the token on the first attempt would fail those legitimately. The
     * TTL still bounds it.
     */
    public static function verifyForPrint(
        User $actor,
        User $target,
        string $rawToken
    ): AadhaarExportAuthorization {
        $authorization = AadhaarExportAuthorization::where(
            'token_hash',
            AadhaarExportAuthorization::hashToken($rawToken)
        )->first();

        if (! $authorization || ! $authorization->permits(
            (int) $actor->id,
            (int) $target->id,
            AadhaarExportAccess::TYPE_PRINT
        )) {
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_TOKEN_INVALID,
                'This confidential export authorization is no longer valid. Request a new export.',
                403
            );
        }

        return $authorization;
    }

    public static function authorizedAction(string $surface, string $exportType): string
    {
        $prefix = strtoupper($surface) === AadhaarExportAccess::SURFACE_EMPLOYEE
            ? 'EMPLOYEE'
            : 'APPOINTMENT';

        return strtoupper($exportType) === AadhaarExportAccess::TYPE_PRINT
            ? $prefix.'_FULL_AADHAAR_PRINT_AUTHORIZED'
            : $prefix.'_FULL_AADHAAR_PDF_AUTHORIZED';
    }

    public static function deniedAction(string $surface): string
    {
        return (strtoupper($surface) === AadhaarExportAccess::SURFACE_EMPLOYEE
            ? 'EMPLOYEE'
            : 'APPOINTMENT').'_FULL_AADHAAR_EXPORT_DENIED';
    }

    public static function downloadedAction(string $surface): string
    {
        return (strtoupper($surface) === AadhaarExportAccess::SURFACE_EMPLOYEE
            ? 'EMPLOYEE'
            : 'APPOINTMENT').'_CONFIDENTIAL_PDF_DOWNLOADED';
    }
}
