<?php

namespace App\Models\Mediclaim;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_document_requirements — HR-managed document checklist,
 * replacing the previously hardcoded 8-row constant. See the creating
 * migration's docblock for `conditional_rule`'s semantics.
 */
class MediclaimDocumentRequirement extends Model
{
    public const CONDITIONAL_RULES = ['hospitalized_or_surgery', 'medico_legal'];

    private const HOSPITALIZED_TREATMENT_TYPES = ['hospitalization', 'surgery'];

    /**
     * The same 8 rows `2026_09_16_000003_create_mediclaim_document_requirements_table.php`
     * seeds on `up()` — duplicated here (not read from the migration) so
     * `ensureDefaultsSeeded()` below can insert them without depending on
     * that migration having actually reached this database. See that
     * method's docblock for why this exists at all.
     */
    private const DEFAULT_ROWS = [
        ['document_type' => 'MEDICLAIM_CLAIM_FORM', 'label' => 'Duly Filled Claim Form', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 1],
        ['document_type' => 'PRESCRIPTION', 'label' => 'Doctor Prescription', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 2],
        ['document_type' => 'MEDICAL_REPORT', 'label' => 'Medical Reports', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 3],
        ['document_type' => 'HOSPITAL_BILL', 'label' => 'Hospital Main Bill & Break-up', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 4],
        ['document_type' => 'MEDICINE_BILL', 'label' => 'Medicine Bills', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 5],
        ['document_type' => 'DISCHARGE_SUMMARY', 'label' => 'Discharge Summary', 'is_required' => false, 'conditional_rule' => 'hospitalized_or_surgery', 'sort_order' => 6],
        ['document_type' => 'FIR_MLC', 'label' => 'FIR / MLC', 'is_required' => false, 'conditional_rule' => 'medico_legal', 'sort_order' => 7],
        ['document_type' => 'OTHER', 'label' => 'Any Other Supporting Documents', 'is_required' => false, 'conditional_rule' => null, 'sort_order' => 8],
    ];

    /**
     * Self-healing bootstrap: if this table exists but is completely empty
     * (the seeding migration's `up()` never reached this database — this
     * environment's migrations run against a different, local database than
     * the one the live app actually serves from), insert the same 8 default
     * rows that migration was supposed to seed, the first time ANYTHING
     * asks what's required.
     *
     * Without this, an unmigrated-in-practice production database leaves
     * `mediclaim_document_requirements` permanently empty, which means: (a)
     * nothing is ever "required" so the settlement document-completeness
     * gate never actually blocks anything, and (b) the employee-facing
     * `DocumentChecklist` has zero rows to render, i.e. no upload control at
     * all — indistinguishable from "the upload feature doesn't exist."
     *
     * `insertOrIgnore()` (not `insert()`) because `document_type` is
     * unique — two concurrent requests both observing `count() === 0`
     * would otherwise race into a duplicate-key exception on the second
     * insert; ignoring a duplicate is the correct outcome here; either
     * request having seeded it first is fine.
     *
     * Called from both `resolveRequiredTypesFor()` (so server-side
     * completeness checks are correct even if nobody ever opens the admin
     * screen first) and `Admin\DocumentRequirementController::index()` (so
     * the admin screen and the employee checklist show real rows the very
     * first time either is opened).
     */
    public static function ensureDefaultsSeeded(): void
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return;
        }

        if (static::query()->count() > 0) {
            return;
        }

        $now = now();
        DB::table('mediclaim_document_requirements')->insertOrIgnore(array_map(
            fn (array $row) => $row + ['max_file_size_kb' => 5120, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            self::DEFAULT_ROWS
        ));
    }

    protected $fillable = [
        'document_type',
        'label',
        'is_required',
        'conditional_rule',
        'max_file_size_kb',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'is_active' => 'boolean',
            'max_file_size_kb' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    /** Whether this row is required for a claim with the given treatment type / medico-legal flag. */
    public function isRequiredFor(?string $treatmentType, bool $isMedicoLegal): bool
    {
        return match ($this->conditional_rule) {
            'hospitalized_or_surgery' => in_array($treatmentType, self::HOSPITALIZED_TREATMENT_TYPES, true),
            'medico_legal' => $isMedicoLegal,
            default => (bool) $this->is_required,
        };
    }

    /**
     * @return list<string> document_type codes required for this claim,
     *                      among currently-active requirement rows only.
     *                      Empty (never throws) on a deployment where this
     *                      table hasn't migrated yet — see
     *                      `Admin\DocumentRequirementController`'s docblock
     *                      for why this table isn't part of
     *                      `RequireModuleSchema`'s blocking check.
     */
    public static function resolveRequiredTypesFor(MediclaimClaim $claim): array
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return [];
        }

        static::ensureDefaultsSeeded();

        return static::query()
            ->where('is_active', true)
            ->get()
            ->filter(fn (self $row) => $row->isRequiredFor($claim->treatment_type, (bool) $claim->is_medico_legal_case))
            ->pluck('document_type')
            ->values()
            ->all();
    }

    /**
     * Required types (per `resolveRequiredTypesFor()`) not yet covered by an
     * uploaded `MediclaimDocumentLink` on this claim — the single "what's
     * still missing" computation, previously duplicated verbatim in three
     * places (`ClaimWorkflowService::recordSettlement()`'s document gate,
     * the `mediclaim:remind-missing-documents` daily sweep, and now
     * `MyClaimController::index()`, which needs it to prompt the employee to
     * upload as soon as a claim is approved and awaiting settlement).
     *
     * @return list<string>
     */
    public static function missingTypesFor(MediclaimClaim $claim): array
    {
        $required = static::resolveRequiredTypesFor($claim);
        if (empty($required)) {
            return [];
        }

        $uploadedTypes = MediclaimDocumentLink::query()
            ->where('linkable_type', MediclaimClaim::class)
            ->where('linkable_id', $claim->id)
            ->with('document:id,document_type')
            ->get()
            ->pluck('document.document_type')
            ->filter()
            ->unique()
            ->all();

        return array_values(array_diff($required, $uploadedTypes));
    }
}
