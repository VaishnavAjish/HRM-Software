<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_change_approvals — ordered approval steps for change requests (DOMAIN 02.09).
 *
 * Every request requires Organization Owner approval. Restructure, merge, split,
 * closure, manager reassignment, and mass movement also require HR approval.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_change_approvals')) {
            return;
        }

        Schema::create('organization_change_approvals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('change_request_id');
            $table->unsignedInteger('sequence');
            $table->string('approver_role', 40); // organization_owner, hr_approver
            $table->unsignedBigInteger('approver_user_id')->nullable();
            $table->string('status', 30)->default('pending'); // pending, approved, rejected
            $table->date('acted_at')->nullable();
            $table->text('comments')->nullable();
            $table->timestamps();

            $table->unique(['change_request_id', 'sequence']);
            $table->index('change_request_id');
            $table->index('approver_role');
            $table->index('approver_user_id');
            $table->index('status');

            $table->foreign('change_request_id')->references('id')->on('organization_change_requests')->cascadeOnDelete();
            $table->foreign('approver_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_change_approvals');
    }
};