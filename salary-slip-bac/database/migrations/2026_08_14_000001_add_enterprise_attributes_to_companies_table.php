<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Enterprise attributes on the company record (DOMAIN 02.01 Enterprise Master).
 *
 * The company is the tenant. `code`, `name` and `is_active` are load-bearing —
 * users.company_code, ScopeMatcher and the authorization cache partition on the
 * code — so the enterprise layer deliberately adds columns around them instead
 * of reshaping them. Everything here is nullable configuration: it enriches the
 * record Access Control already manages without touching any scope decision.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('companies')) {
            return;
        }

        Schema::table('companies', function (Blueprint $table) {
            if (! Schema::hasColumn('companies', 'legal_name')) {
                $table->string('legal_name', 190)->nullable()->after('name');
            }
            if (! Schema::hasColumn('companies', 'registration_number')) {
                $table->string('registration_number', 100)->nullable()->after('legal_name');
            }
            if (! Schema::hasColumn('companies', 'tax_identification')) {
                $table->string('tax_identification', 100)->nullable()->after('registration_number');
            }
            if (! Schema::hasColumn('companies', 'incorporation_date')) {
                $table->date('incorporation_date')->nullable()->after('tax_identification');
            }
            if (! Schema::hasColumn('companies', 'country_code')) {
                $table->char('country_code', 2)->nullable()->after('incorporation_date');
            }
            if (! Schema::hasColumn('companies', 'timezone')) {
                $table->string('timezone', 64)->nullable()->default('Asia/Kolkata')->after('country_code');
            }
            if (! Schema::hasColumn('companies', 'primary_address')) {
                $table->text('primary_address')->nullable()->after('timezone');
            }
            if (! Schema::hasColumn('companies', 'contact_email')) {
                $table->string('contact_email', 190)->nullable()->after('primary_address');
            }
            if (! Schema::hasColumn('companies', 'contact_phone')) {
                $table->string('contact_phone', 32)->nullable()->after('contact_email');
            }
            if (! Schema::hasColumn('companies', 'fiscal_year_start')) {
                $table->char('fiscal_year_start', 5)->nullable()->after('contact_phone');
            }
            if (! Schema::hasColumn('companies', 'currency')) {
                $table->char('currency', 3)->nullable()->default('INR')->after('fiscal_year_start');
            }
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            foreach (['currency', 'fiscal_year_start', 'contact_phone', 'contact_email', 'primary_address', 'timezone', 'country_code', 'incorporation_date', 'tax_identification', 'registration_number', 'legal_name'] as $column) {
                if (Schema::hasColumn('companies', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
