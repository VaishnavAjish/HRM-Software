<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * financial_organizations — financial structure (DOMAIN 02.05).
 *
 * Cost Centers, Profit Centers, Budget Centers, Payroll Areas, Expense Units,
 * Finance Business Units, Project Cost Codes, Internal Orders.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_organizations')) {
            return;
        }

        Schema::create('financial_organizations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('type', 40); // cost_center, profit_center, budget_center, payroll_area, expense_unit, finance_business_unit, project_cost_code, internal_order
            $table->string('status', 20)->default('active'); // active, inactive, closed
            $table->text('description')->nullable();
            $table->unsignedBigInteger('manager_user_id')->nullable();
            $table->unsignedBigInteger('legacy_cost_center_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('parent_id');
            $table->index('type');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('parent_id')->references('id')->on('financial_organizations')->nullOnDelete();
            $table->foreign('manager_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_organizations');
    }
};