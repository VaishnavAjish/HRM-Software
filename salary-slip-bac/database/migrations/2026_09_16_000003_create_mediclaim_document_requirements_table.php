<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_document_requirements — HR-configurable replacement for the
 * previously hardcoded 8-row document checklist
 * (`CLAIM_DOCUMENT_CHECKLIST`/`documentChecklistRules.js` on the frontend).
 * HR can now add/retire document types, flip a row between required and
 * optional, and set a per-type max upload size, instead of that being fixed
 * in source.
 *
 * `conditional_rule` reproduces the two conditional requirements the old
 * hardcoded logic had (Discharge Summary required only if
 * hospitalized/surgery; FIR/MLC required only if medico-legal) as data
 * instead of code — `null` means `is_required` applies unconditionally, so
 * HR can also turn either conditional row into a flat always-required or
 * always-optional document simply by clearing this field.
 *
 * Seeded with the same 8 rows the hardcoded checklist had, so no existing
 * claim's document requirements change the moment this table starts being
 * read instead of the old constant.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            Schema::create('mediclaim_document_requirements', function (Blueprint $table) {
                $table->id();
                $table->string('document_type')->unique();
                $table->string('label');
                $table->boolean('is_required')->default(true);
                // 'hospitalized_or_surgery' | 'medico_legal' | null
                $table->string('conditional_rule')->nullable();
                $table->unsignedInteger('max_file_size_kb')->default(5120);
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('mediclaim_document_requirements') && DB::table('mediclaim_document_requirements')->count() === 0) {
            $now = now();
            $rows = [
                ['document_type' => 'MEDICLAIM_CLAIM_FORM', 'label' => 'Duly Filled Claim Form', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 1],
                ['document_type' => 'PRESCRIPTION', 'label' => 'Doctor Prescription', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 2],
                ['document_type' => 'MEDICAL_REPORT', 'label' => 'Medical Reports', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 3],
                ['document_type' => 'HOSPITAL_BILL', 'label' => 'Hospital Main Bill & Break-up', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 4],
                ['document_type' => 'MEDICINE_BILL', 'label' => 'Medicine Bills', 'is_required' => true, 'conditional_rule' => null, 'sort_order' => 5],
                ['document_type' => 'DISCHARGE_SUMMARY', 'label' => 'Discharge Summary', 'is_required' => false, 'conditional_rule' => 'hospitalized_or_surgery', 'sort_order' => 6],
                ['document_type' => 'FIR_MLC', 'label' => 'FIR / MLC', 'is_required' => false, 'conditional_rule' => 'medico_legal', 'sort_order' => 7],
                ['document_type' => 'OTHER', 'label' => 'Any Other Supporting Documents', 'is_required' => false, 'conditional_rule' => null, 'sort_order' => 8],
            ];

            DB::table('mediclaim_document_requirements')->insert(array_map(
                fn (array $row) => $row + ['max_file_size_kb' => 5120, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
                $rows
            ));
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_document_requirements');
    }
};
