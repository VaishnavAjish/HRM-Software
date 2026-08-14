<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * position_history — immutable audit trail for position lifecycle (03.03).
 *
 * Records: Creation, Approval, Assignment, Transfer, Freeze, Unfreeze, Reclassification, Closure, Reopening.
 * Never overwrites history.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('position_history')) {
            return;
        }

        Schema::create('position_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('position_id');
            $table->string('event_type', 40); // created, requested, approved, rejected, opened, assigned, transferred, frozen, unfrozen, reclassified, closed, reopened, cancelled, expired
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->unsignedBigInteger('changed_by')->nullable();
            $table->text('reason')->nullable();
            $table->json('metadata')->nullable(); // Additional context: approval_chain, assignment_details, etc.
            $table->timestamps();

            $table->index('position_id');
            $table->index('event_type');
            $table->index('changed_by');
            $table->index('created_at');

            $table->foreign('position_id')->references('id')->on('organization_positions')->cascadeOnDelete();
            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('position_history');
    }
};
