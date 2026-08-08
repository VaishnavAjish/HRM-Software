<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('job_requisitions') && !Schema::hasColumn('job_requisitions', 'indeed_job_id')) {
            Schema::table('job_requisitions', function (Blueprint $table) {
                $table->string('indeed_job_id')->nullable()->after('status');
                $table->boolean('published_to_indeed')->default(false)->after('indeed_job_id');
                $table->timestamp('published_to_indeed_at')->nullable()->after('published_to_indeed');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('job_requisitions') && Schema::hasColumn('job_requisitions', 'indeed_job_id')) {
            Schema::table('job_requisitions', function (Blueprint $table) {
                $table->dropColumn(['indeed_job_id', 'published_to_indeed', 'published_to_indeed_at']);
            });
        }
    }
};
