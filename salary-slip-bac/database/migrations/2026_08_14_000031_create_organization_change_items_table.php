<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_change_items — typed items within a change request (DOMAIN 02.09).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_change_items')) {
            return;
        }

        Schema::create('organization_change_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('change_request_id');
            $table->unsignedInteger('sequence');
            $table->string('item_type', 40); // create_unit, update_unit, delete_unit, create_location, update_location, delete_location, create_financial_org, update_financial_org, delete_financial_org, create_position, update_position, delete_position, assign_employee, reassign_manager, update_leadership, update_calendar, update_hierarchy
            $table->string('target_type', 40); // organization_unit, organization_location, financial_organization, organization_position, employee_organization_assignment, organization_leadership_assignment, organization_calendar, organization_hierarchy
            $table->unsignedBigInteger('target_id')->nullable(); // ID of the target record (null for creates)
            $table->json('before_values')->nullable();
            $table->json('after_values')->nullable();
            $table->string('status', 30)->default('pending'); // pending, applied, failed, skipped
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->unique(['change_request_id', 'sequence']);
            $table->index('change_request_id');
            $table->index('item_type');
            $table->index('target_type');
            $table->index('target_id');
            $table->index('status');

            $table->foreign('change_request_id')->references('id')->on('organization_change_requests')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_change_items');
    }
};