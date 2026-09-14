<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds an optional `scope_key` discriminator to `documents`.
 *
 * DocumentService::reserveVersion() historically finds-or-creates a `Document`
 * row keyed only by (document_type, owner) — correct for "one evolving
 * document per employee" types (a resume, a PAN card, ...), but wrong for a
 * caller that genuinely needs MULTIPLE independent documents of the SAME type
 * for the SAME employee: e.g. one Mediclaim INSURANCE_CARD per covered family
 * member, one MEDICLAIM_CLAIM_FORM per claim, or one HOSPITAL_BILL per claim.
 * Without a discriminator, the second such document silently becomes a new
 * *version* of the first `Document` row instead of a separate one, so every
 * existing link to the first document then resolves to the second one's
 * content.
 *
 * NULL is the default and preserves current behaviour exactly for every
 * existing document_type/caller in the app (Aadhaar docs, appointment
 * documents, employee documents, ...): DocumentService only folds
 * `scope_key` into its lookup/creation when a caller opts in by passing a
 * non-null scope key. See DocumentService::reserveVersion().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('scope_key', 191)->nullable()->after('document_type');

            $table->index(['document_type', 'user_id', 'scope_key']);
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropIndex(['document_type', 'user_id', 'scope_key']);
            $table->dropColumn('scope_key');
        });
    }
};
