<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('salary_slips')) {
            return;
        }

        Schema::create('salary_slips', function (Blueprint $table) {
            $table->id();
            $table->string('month')->default(1)->index();
            $table->integer('year')->default(1)->index();
            $table->integer('emp_code')->nullable()->index();
            $table->string('emp_name')->nullable();
            $table->string('main_department')->nullable();
            $table->string('department')->nullable();
            $table->string('designation')->nullable();
            $table->float('book_salary')->default(0);
            $table->float('paid_day')->default(0);
            $table->float('basic')->default(0);
            $table->float('da')->default(0);
            $table->float('hra')->default(0);
            $table->float('wa')->default(0);
            $table->float('conv_a')->default(0);
            $table->float('edu_a')->default(0);
            $table->float('owa')->default(0);
            $table->float('ppa')->default(0);
            $table->float('pda')->default(0);
            $table->float('med_a')->default(0);
            $table->float('mob_a')->default(0);
            $table->float('product_incentive')->default(0);
            $table->float('gross_salary')->default(0);
            $table->float('pt')->default(0);
            $table->float('pf')->default(0);
            $table->float('esi')->default(0);
            $table->float('tds')->default(0);
            $table->float('lwf')->default(0);
            $table->float('advance')->default(0);
            $table->float('total_deduct')->default(0);
            $table->float('net_payable')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('salary_slips');
    }
};
