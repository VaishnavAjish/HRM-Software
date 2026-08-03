<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->string('asset_tag')->unique();
            $table->string('category'); // laptop | desktop | monitor | keyboard | mouse | mobile | sim_card | headset | id_card | access_card | vehicle | uniform | software_license
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('serial_number')->nullable()->unique();
            $table->date('purchase_date')->nullable();
            $table->decimal('purchase_cost', 12, 2)->nullable();
            $table->date('warranty_expiry')->nullable();
            $table->date('amc_expiry')->nullable();
            $table->string('status')->default('available'); // available | assigned | returned | damaged | lost | retired
            $table->string('condition')->default('new'); // new | good | fair | damaged
            $table->string('qr_code_value')->nullable();
            $table->text('notes')->nullable();
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_code', 'unit', 'status']);
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assets');
    }
};
