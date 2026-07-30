<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DocumentException;
use App\Http\Controllers\Controller;
use App\Models\AadhaarExportAuthorization;
use App\Models\User;
use App\Services\Aadhaar\AadhaarExportAuthorizer;
use App\Services\Documents\DocumentAudit;
use App\Services\Documents\DocumentAuthorizer;
use App\Support\AadhaarExportAccess;
use App\Support\AadhaarReference;
use App\Support\ConfidentialPdf;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Throwable;

/**
 * Confidential (full-Aadhaar) Print and PDF export.
 *
 * Everything here fails closed. A masked export needs none of this and goes
 * through the ordinary client-side path; an export that carries a complete
 * Aadhaar number cannot happen unless this controller has re-authorised it
 * against the database and written an audit entry in the same transaction.
 *
 * The client never supplies the Aadhaar number, the record fields, or the
 * document markup — all three are read here from the stored row. A request body
 * claiming `aadhar_card_no` or `includeFullAadhaar` is ignored outright, because
 * the browser is exactly the place an attacker already controls.
 *
 * What this cannot do: once a PDF is on a disk or a sheet is out of a printer,
 * it is beyond every control in this file. See the honest-limitations note in the
 * task report.
 */
class AadhaarExportController extends Controller
{
    private function requestId(): string
    {
        return request()->header('X-Request-Id') ?: (string) Str::uuid();
    }

    private function ok($data, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => ['requestId' => $this->requestId()],
        ], $status);
    }

    private function fail(DocumentException $e)
    {
        return response()->json($e->toArray($this->requestId()), $e->status);
    }

    /** No-store on everything here: none of it may be cached or replayed. */
    private function noStore($response)
    {
        return $response
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    // ---------------------------------------------------------------- endpoints

    /**
     * POST /v1/{appointments|employees}/{id}/aadhaar/export-authorization
     *
     * Fresh authorization for one export. Deliberately not derived from anything
     * the client learned when the details modal opened: a permission may have
     * been revoked since, and a stale "yes" must not authorise paper.
     */
    public function authorizeExport(Request $request, int $id, string $surface)
    {
        try {
            $exportType = strtoupper((string) $request->input('exportType', ''));

            $this->assertFeatureEnabled();
            [$target, $actor] = $this->findAuthorized($id, $surface);

            if (! in_array($exportType, AadhaarExportAccess::types(), true)) {
                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_DENIED,
                    'Specify a valid export type.',
                    422
                );
            }

            $permission = AadhaarExportAccess::permissionFor($surface, $exportType);

            if (! AadhaarExportAccess::holds($actor, $permission)) {
                $this->auditDenied($target, $surface, $exportType, $permission, 'PERMISSION_MISSING');

                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_DENIED,
                    'You are not permitted to export a full Aadhaar number.',
                    403
                );
            }

            $digits = $this->storedAadhaar($target);

            if ($digits === null) {
                $this->auditDenied($target, $surface, $exportType, $permission, 'AADHAAR_UNAVAILABLE');

                throw new DocumentException(
                    DocumentException::APPOINTMENT_AADHAAR_MISSING,
                    'A valid Aadhaar number is not available for this record.',
                    404
                );
            }

            // Audit and authorization are written together; if the audit cannot
            // be recorded, this throws and no authorization exists.
            $issued = AadhaarExportAuthorizer::issue(
                $actor,
                $target,
                $surface,
                $exportType,
                substr($digits, -4)
            );

            /** @var AadhaarExportAuthorization $authorization */
            $authorization = $issued['authorization'];

            return $this->noStore($this->ok([
                'exportAuthorizationId' => $authorization->uuid,
                'exportToken' => $issued['token'],
                'exportType' => $authorization->export_type,
                'expiresAt' => $authorization->expires_at->toIso8601ZuluString(),
                'exportReference' => $this->exportReference($authorization),
            ], 201));
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    /**
     * POST /v1/{appointments|employees}/{id}/confidential-pdf
     *
     * The PDF is generated here, from the stored row, and streamed back. Nothing
     * about its content comes from the browser — which is the entire reason this
     * endpoint exists rather than rasterising the page.
     */
    public function confidentialPdf(Request $request, int $id, string $surface)
    {
        try {
            $this->assertFeatureEnabled();
            [$target, $actor] = $this->findAuthorized($id, $surface);

            $permission = AadhaarExportAccess::permissionFor($surface, AadhaarExportAccess::TYPE_PDF);

            // Rechecked even though the token was issued against this same
            // permission: the grant can be withdrawn inside the token's lifetime.
            if (! AadhaarExportAccess::holds($actor, $permission)) {
                $this->auditDenied($target, $surface, AadhaarExportAccess::TYPE_PDF, $permission, 'PERMISSION_MISSING');

                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_DENIED,
                    'You are not permitted to export a full Aadhaar number.',
                    403
                );
            }

            $rawToken = (string) $request->input('exportToken', '');

            if ($rawToken === '') {
                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_TOKEN_INVALID,
                    'A confidential export authorization is required.',
                    403
                );
            }

            try {
                $authorization = AadhaarExportAuthorizer::consumeForPdf($actor, $target, $rawToken);
            } catch (DocumentException $e) {
                $this->auditDenied($target, $surface, AadhaarExportAccess::TYPE_PDF, $permission, 'TOKEN_INVALID');

                throw $e;
            }

            $digits = $this->storedAadhaar($target);

            if ($digits === null) {
                throw new DocumentException(
                    DocumentException::APPOINTMENT_AADHAAR_MISSING,
                    'A valid Aadhaar number is not available for this record.',
                    404
                );
            }

            $reference = $this->exportReference($authorization);
            $generatedAt = now();

            $pdf = ConfidentialPdf::render([
                'banner' => [
                    'CONFIDENTIAL',
                    'Contains Sensitive Identity Information',
                ],
                'title' => $surface === AadhaarExportAccess::SURFACE_EMPLOYEE
                    ? 'EMPLOYEE IDENTITY RECORD'
                    : 'APPOINTMENT IDENTITY RECORD',
                'subtitle' => $this->recordLabel($target, $surface),
                'sections' => $this->pdfSections($target, $digits),
                'footer' => [
                    'Generated by: '.($actor->name ?: ('User #'.$actor->id)),
                    'Generated at: '.$generatedAt->timezone(config('app.timezone', 'UTC'))->format('d M Y H:i').' '
                        .$generatedAt->timezone(config('app.timezone', 'UTC'))->format('T'),
                    'Export reference: '.$reference,
                    'Handle according to company privacy policy. This copy is not access-controlled.',
                ],
                'watermark' => 'CONFIDENTIAL',
            ]);

            // Records the download itself, separately from the authorization, so
            // an approval that never produced a file is distinguishable from one
            // that did.
            DocumentAudit::record(
                AadhaarExportAuthorizer::downloadedAction($surface),
                null,
                null,
                [
                    'target_user_id' => $target->id,
                    'organization_code' => $target->company_code,
                    'unit' => $target->unit,
                    'surface' => $surface,
                    'export_type' => AadhaarExportAccess::TYPE_PDF,
                    'permission_checked' => $permission,
                    'authorization_result' => 'ALLOWED',
                    'export_authorization_id' => $authorization->uuid,
                    'export_reference' => $reference,
                    'aadhaar_last4' => substr($digits, -4),
                    'bytes' => strlen($pdf),
                ],
                $permission,
                'ALLOWED'
            );

            // Streamed, not stored. No S3 object, no public URL, nothing to
            // expire or forget to delete — and the filename carries only the
            // record reference.
            return $this->noStore(response($pdf, 200)
                ->header('Content-Type', 'application/pdf')
                ->header('Content-Disposition', 'attachment; filename="'.$this->fileName($target, $surface).'"')
                ->header('Content-Length', (string) strlen($pdf)));
        } catch (DocumentException $e) {
            return $this->fail($e);
        } catch (Throwable $e) {
            report($e);

            return $this->fail(new DocumentException(
                DocumentException::AADHAAR_EXPORT_DENIED,
                'Confidential export could not be completed. The document was not downloaded.',
                500
            ));
        }
    }

    /**
     * POST /v1/{appointments|employees}/{id}/confidential-print-payload
     *
     * The print view model, assembled server-side and bound to a print
     * authorization. The client renders this rather than reading values back out
     * of the page, so what reaches the printer is what the database holds — not
     * whatever a developer console last wrote into the DOM.
     *
     * The token is verified but not spent: a cancelled print dialog reopened
     * within the TTL is a legitimate second render, and burning the token would
     * refuse it. The TTL still bounds the window.
     */
    public function confidentialPrintPayload(Request $request, int $id, string $surface)
    {
        try {
            $this->assertFeatureEnabled();
            [$target, $actor] = $this->findAuthorized($id, $surface);

            $permission = AadhaarExportAccess::permissionFor($surface, AadhaarExportAccess::TYPE_PRINT);

            if (! AadhaarExportAccess::holds($actor, $permission)) {
                $this->auditDenied($target, $surface, AadhaarExportAccess::TYPE_PRINT, $permission, 'PERMISSION_MISSING');

                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_DENIED,
                    'You are not permitted to print a full Aadhaar number.',
                    403
                );
            }

            $rawToken = (string) $request->input('exportToken', '');

            if ($rawToken === '') {
                throw new DocumentException(
                    DocumentException::AADHAAR_EXPORT_TOKEN_INVALID,
                    'A confidential export authorization is required.',
                    403
                );
            }

            try {
                $authorization = AadhaarExportAuthorizer::verifyForPrint($actor, $target, $rawToken);
            } catch (DocumentException $e) {
                $this->auditDenied($target, $surface, AadhaarExportAccess::TYPE_PRINT, $permission, 'TOKEN_INVALID');

                throw $e;
            }

            $digits = $this->storedAadhaar($target);

            if ($digits === null) {
                throw new DocumentException(
                    DocumentException::APPOINTMENT_AADHAAR_MISSING,
                    'A valid Aadhaar number is not available for this record.',
                    404
                );
            }

            $generatedAt = now()->timezone(config('app.timezone', 'UTC'));

            return $this->noStore($this->ok([
                'exportAuthorizationId' => $authorization->uuid,
                'exportReference' => $this->exportReference($authorization),
                'generatedBy' => $actor->name ?: ('User #'.$actor->id),
                'generatedAt' => $generatedAt->format('d M Y H:i').' '.$generatedAt->format('T'),
                'recordLabel' => $this->recordLabel($target, $surface),
                // The only field the print view may not read from anywhere else.
                'aadhaarFull' => $digits,
            ]));
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    // ------------------------------------------------------------------ helpers

    private function assertFeatureEnabled(): void
    {
        if (! AadhaarExportAccess::featureEnabled()) {
            throw new DocumentException(
                DocumentException::AADHAAR_EXPORT_DISABLED,
                'Confidential export is not enabled.',
                503
            );
        }
    }

    /**
     * Authenticate, load the record and check organisation/company/unit scope,
     * in that order — an actor outside the scope must not learn whether the id
     * exists, let alone whether it carries an Aadhaar.
     *
     * @return array{0: User, 1: User}
     */
    private function findAuthorized(int $id, string $surface): array
    {
        $actor = auth('api')->user();

        if (! $actor) {
            throw new DocumentException(
                DocumentException::AUTHENTICATION_REQUIRED,
                'Authentication required.',
                401
            );
        }

        $target = User::find($id);

        if (! $target) {
            throw new DocumentException(
                DocumentException::APPOINTMENT_NOT_FOUND,
                'That record was not found.',
                404
            );
        }

        // Same scope rule the rest of the document surface uses: company and
        // unit, with Super Admin above it.
        if (! DocumentAuthorizer::canAccessOwner($actor, $target)) {
            $this->auditDenied($target, $surface, 'SCOPE', null, 'OUT_OF_SCOPE');

            throw new DocumentException(
                DocumentException::APPOINTMENT_ACCESS_DENIED,
                'You do not have access to this record.',
                403
            );
        }

        return [$target, $actor];
    }

    /** The stored number, or null when there is nothing valid to export. */
    private function storedAadhaar(User $target): ?string
    {
        $digits = AadhaarReference::normalise(
            (string) ($target->getRawOriginal('aadhar_card_no') ?? '')
        );

        return AadhaarReference::isValid($digits) ? $digits : null;
    }

    private function auditDenied(
        ?User $target,
        string $surface,
        string $exportType,
        ?string $permission,
        string $reason
    ): void {
        DocumentAudit::record(
            AadhaarExportAuthorizer::deniedAction($surface),
            null,
            null,
            [
                'target_user_id' => $target?->id,
                'organization_code' => $target?->company_code,
                'unit' => $target?->unit,
                'surface' => strtoupper($surface),
                'export_type' => $exportType,
                'permission_checked' => $permission,
                'authorization_result' => 'DENIED',
                'reason' => $reason,
            ],
            $permission,
            'DENIED'
        );
    }

    /** EXP-XXXXXXXX. Derived from the authorization uuid, never from the Aadhaar. */
    private function exportReference(AadhaarExportAuthorization $authorization): string
    {
        return 'EXP-'.strtoupper(substr(str_replace('-', '', $authorization->uuid), 0, 8));
    }

    private function recordLabel(User $target, string $surface): string
    {
        if (strtoupper($surface) === AadhaarExportAccess::SURFACE_EMPLOYEE) {
            return (string) ($target->emp_code ?: 'EMP-'.str_pad((string) $target->id, 6, '0', STR_PAD_LEFT));
        }

        return 'APT-'.str_pad((string) $target->id, 6, '0', STR_PAD_LEFT);
    }

    /**
     * Appointment_APT-000104_Confidential.pdf
     *
     * The record reference and nothing else: a filename ends up in download
     * histories, chat messages and backup indexes, none of which are places for
     * an identity number.
     */
    private function fileName(User $target, string $surface): string
    {
        $prefix = strtoupper($surface) === AadhaarExportAccess::SURFACE_EMPLOYEE
            ? 'Employee'
            : 'Appointment';

        $label = preg_replace('/[^A-Za-z0-9._-]/', '', $this->recordLabel($target, $surface));

        return $prefix.'_'.$label.'_Confidential.pdf';
    }

    /**
     * The record, read from the database.
     *
     * @return list<array{heading: string, fields: list<array{0: string, 1: string}>}>
     */
    private function pdfSections(User $target, string $digits): array
    {
        $value = static fn ($v) => trim((string) ($v ?? '')) !== '' ? (string) $v : '-';

        return [
            [
                'heading' => 'IDENTITY',
                'fields' => [
                    // Grouped in fours, as printed on the card itself.
                    ['Aadhaar Card No', implode(' ', str_split($digits, 4))],
                    ['PAN Card No', $value($target->pan_card_no)],
                    ['Name', $value($target->name)],
                    ['Date of Birth', $value($target->dob)],
                    ['Gender', $value($target->gender)],
                ],
            ],
            [
                'heading' => 'EMPLOYMENT',
                'fields' => [
                    ['Employee Code', $value($target->emp_code)],
                    ['Joining Date', $value($target->joining_date)],
                    ['Department', $value($target->department)],
                    ['Designation', $value($target->designation)],
                    ['Manager', $value($target->manager_name)],
                    ['Company', $value($target->company_code)],
                    ['Unit', $value($target->unit)],
                ],
            ],
            [
                'heading' => 'CONTACT',
                'fields' => [
                    ['Mobile No', $value($target->mobile_number)],
                    ['Email', $value($target->email)],
                    ['Address', $value($target->address)],
                    ['Village', $value($target->village)],
                    ['Taluka', $value($target->taluka)],
                    ['District', $value($target->district)],
                ],
            ],
            [
                'heading' => 'BANK',
                'fields' => [
                    ['Bank Name', $value($target->bank_name)],
                    ['Account No', $value($target->bank_account_no)],
                    ['IFSC Code', $value($target->bank_ifsc_code)],
                ],
            ],
        ];
    }
}
