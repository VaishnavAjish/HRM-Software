<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('training_quizzes', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('requisition_id')->nullable()->constrained('job_requisitions')->nullOnDelete();
            $table->integer('passing_score')->default(60);
            $table->json('questions')->nullable(); // Questions array: [{text, options:[], correct_index}]
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Seed training permissions
        try {
            $group = \App\Models\PermissionGroup::where('name', 'HR Talent & Assets')->first();
            if ($group) {
                $permissions = [
                    'hr.training.read' => 'Hr Training Read',
                    'hr.training.create' => 'Hr Training Create',
                    'hr.training.update' => 'Hr Training Update',
                    'hr.training.delete' => 'Hr Training Delete',
                ];

                foreach ($permissions as $code => $desc) {
                    $parts = explode('.', $code);
                    $action = array_pop($parts);
                    
                    $perm = \App\Models\Permission::firstOrCreate(['code' => $code], [
                        'name' => $code,
                        'code' => $code,
                        'resource' => implode('.', $parts),
                        'action' => $action,
                        'level' => 'ACTION',
                        'group_id' => $group->id,
                        'description' => $desc,
                        'is_sensitive' => $action === 'delete',
                        'is_active' => true,
                    ]);

                    // Assign to admin roles
                    $roles = \App\Models\Role::whereIn('code', ['super_administrator', 'tenant_administrator', 'hr_manager'])->get();
                    foreach ($roles as $role) {
                        \Illuminate\Support\Facades\DB::table('role_permissions')->updateOrInsert(
                            ['role_id' => $role->id, 'permission_id' => $perm->id],
                            ['effect' => 'ALLOW', 'inherit_to_children' => !$perm->is_sensitive]
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback if permission tables are not ready/existent
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('training_quizzes');
    }
};
