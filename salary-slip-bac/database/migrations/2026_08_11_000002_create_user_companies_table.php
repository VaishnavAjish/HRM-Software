<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Company membership, normalised.
 *
 * A user belonging to several companies is a real requirement that the codebase
 * already meets by storing "nidhi-impex,silver-star" in one column and splitting
 * it wherever it is read. That works — ScopeMatcher explodes it deliberately —
 * but it cannot be presented as a list of choices, cannot be constrained by a
 * foreign key, and cannot be joined.
 *
 * This table is additive and, for now, read by nothing but the admin UI. The
 * authorization layer continues to use users.company_code, which every write
 * keeps in step. Moving authorization onto these rows is a separate migration
 * with its own cache and scope-matching work.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_companies')) {
            return;
        }

        Schema::create('user_companies', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('company_id');
            $table->timestamps();

            $table->unique(['user_id', 'company_id']);
            $table->index('company_id');

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_companies');
    }
};
