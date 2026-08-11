<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Companies as records rather than strings.
 *
 * Company has only ever existed as the text in users.company_code, so there has
 * been nothing for a form to list, nothing to key a relationship on, and no way
 * to add a company without editing data by hand.
 *
 * `code` is the join back to the legacy world: it holds exactly the token the
 * existing CSV uses ("nidhi-impex"), so a membership can be serialised into
 * users.company_code without a translation table. Authorization keeps reading
 * that column and is untouched by this migration.
 *
 * Note that "all-companies" is deliberately not seeded here. It appears only in
 * request filters, meaning "do not scope this query", and no user holds it — it
 * is a query sentinel, not a company.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('companies')) {
            return;
        }

        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('name', 190);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
