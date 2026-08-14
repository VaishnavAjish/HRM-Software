<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('candidate_accounts')) {
            Schema::create('candidate_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->string('password');
                $table->string('phone', 30)->nullable();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('verification_token')->nullable()->index();
                $table->timestamp('verification_token_expires_at')->nullable();
                $table->string('reset_password_token')->nullable()->index();
                $table->timestamp('reset_password_token_expires_at')->nullable();
                $table->json('skills')->nullable();
                $table->string('current_company')->nullable();
                $table->string('current_designation')->nullable();
                $table->decimal('experience_years', 4, 1)->default(0);
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('candidates') && ! Schema::hasColumn('candidates', 'candidate_account_id')) {
            Schema::table('candidates', function (Blueprint $table) {
                $table->foreignId('candidate_account_id')->nullable()->after('requisition_id')
                    ->constrained('candidate_accounts')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('candidates') && Schema::hasColumn('candidates', 'candidate_account_id')) {
            Schema::table('candidates', function (Blueprint $table) {
                $table->dropConstrainedForeignId('candidate_account_id');
            });
        }

        Schema::dropIfExists('candidate_accounts');
    }
};
