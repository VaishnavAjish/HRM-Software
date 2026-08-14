<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_bank_accounts — encrypted banking details (DOMAIN 02.02).
 *
 * Full account numbers are encrypted at rest. Only masked values and last four
 * digits are returned by normal APIs.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_bank_accounts')) {
            return;
        }

        Schema::create('legal_entity_bank_accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('legal_entity_profile_id');
            $table->string('bank_name', 190);
            $table->string('branch_name', 190)->nullable();
            $table->string('ifsc_code', 20)->nullable();
            $table->string('account_type', 30); // current, savings, cash_credit, overdraft, other
            $table->text('encrypted_account_number'); // AES-256-CBC encrypted
            $table->string('account_number_last_four', 4);
            $table->string('account_number_masked', 30); // e.g., "XXXX XXXX XXXX 1234"
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('legal_entity_profile_id');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('legal_entity_profile_id')->references('id')->on('legal_entity_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_bank_accounts');
    }
};