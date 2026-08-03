<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cycle_id')->constrained('performance_cycles')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type'); // KPI | KRA | OKR
            $table->string('title');
            $table->text('description')->nullable();
            $table->decimal('weight', 5, 2)->nullable();
            $table->string('target_value')->nullable();
            $table->string('achieved_value')->nullable();
            $table->string('status')->default('not_started'); // not_started | in_progress | completed | missed
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['cycle_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_goals');
    }
};
