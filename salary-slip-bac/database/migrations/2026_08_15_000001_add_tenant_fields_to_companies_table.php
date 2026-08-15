<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add tenant/subscription fields to companies table for Domain 00.1 Tenant Management.
 *
 * These fields extend the existing companies table to support tenant-level
 * configuration, subscription tracking, branding, and isolation features.
 * Migration is additive — no existing columns are modified or removed.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->string('subscription_plan')->nullable()->after('currency');
            $table->string('subscription_status')->nullable()->after('subscription_plan');
            $table->date('subscription_start_date')->nullable()->after('subscription_status');
            $table->date('subscription_end_date')->nullable()->after('subscription_start_date');
            $table->integer('employee_limit')->nullable()->after('subscription_end_date');
            $table->integer('user_limit')->nullable()->after('employee_limit');
            $table->string('data_residency_region')->nullable()->after('user_limit');
            $table->boolean('is_demo')->nullable()->default(false)->after('data_residency_region');
            $table->boolean('audit_trail_enabled')->nullable()->default(true)->after('is_demo');
            $table->string('application_name')->nullable()->after('audit_trail_enabled');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn([
                'subscription_plan',
                'subscription_status',
                'subscription_start_date',
                'subscription_end_date',
                'employee_limit',
                'user_limit',
                'data_residency_region',
                'is_demo',
                'audit_trail_enabled',
                'application_name',
            ]);
        });
    }
};