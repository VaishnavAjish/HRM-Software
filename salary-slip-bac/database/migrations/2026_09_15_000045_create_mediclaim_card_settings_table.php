<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_card_settings')) {
            Schema::create('mediclaim_card_settings', function (Blueprint $table) {
                $table->id();
                $table->string('company_code')->unique();
                $table->string('name')->nullable();
                $table->string('legal_name')->nullable();
                $table->string('tagline')->nullable();
                $table->string('side_slogan')->nullable();
                $table->string('back_slogan')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('helpline')->nullable();
                $table->string('website')->nullable();
                $table->text('address')->nullable();
                $table->string('insurer_name')->nullable();
                $table->string('tpa_code')->nullable();
                $table->json('instructions')->nullable();
                $table->json('field_toggles')->nullable();
                $table->longText('logo')->nullable();
                $table->longText('signature_url')->nullable();
                $table->string('signature_title')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_card_settings');
    }
};
