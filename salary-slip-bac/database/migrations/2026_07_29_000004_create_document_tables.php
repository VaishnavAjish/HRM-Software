<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Normalised document model: a logical `documents` row per (owner, type), with
 * one immutable `document_versions` row per uploaded file, plus a dedicated
 * audit trail.
 *
 * Replaces the flat `document_uploads` table, whose rows are backfilled below
 * so nothing already uploaded is lost.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();

            // The app scopes by company_code rather than a numeric org id.
            $table->string('organization_code')->nullable();

            $table->string('owner_type')->default('employee'); // employee|user|vendor|...
            $table->unsignedBigInteger('owner_id')->nullable();
            $table->string('owner_ref')->nullable();           // emp_code, denormalised

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('document_type');
            $table->unsignedInteger('current_version')->default(0);
            $table->string('status')->default('ACTIVE');
            $table->text('description')->nullable();

            $table->boolean('is_deleted')->default(false);
            $table->timestamp('deleted_at')->nullable();
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_code']);
            $table->index(['owner_type', 'owner_id']);
            $table->index(['owner_ref', 'document_type']);
            $table->index(['document_type']);
            $table->index(['status']);
            $table->index(['is_deleted']);
            $table->index(['user_id', 'document_type']);
        });

        Schema::create('document_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
            $table->unsignedInteger('version');

            $table->string('original_file_name');
            $table->string('generated_file_name');
            $table->string('bucket_name')->nullable();
            $table->string('s3_object_key', 1024);
            $table->string('folder_path', 1024)->nullable();
            $table->string('file_extension', 20);
            $table->unsignedBigInteger('file_size');
            $table->string('mime_type');

            $table->string('checksum_algorithm', 20)->default('sha256');
            $table->string('checksum', 64)->nullable();
            $table->string('etag')->nullable();
            $table->string('s3_version_id')->nullable();
            $table->string('storage_class')->nullable();
            $table->string('encryption_type')->nullable();
            $table->string('kms_key_id')->nullable();

            $table->string('upload_status')->default('PENDING_UPLOAD');
            $table->string('scan_status')->default('NOT_SCANNED');

            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('uploaded_at')->nullable();
            $table->string('idempotency_key')->nullable();
            $table->timestamps();

            // Makes a duplicate version number impossible even if two requests
            // race past the row lock in DocumentService.
            $table->unique(['document_id', 'version']);
            $table->unique(['idempotency_key']);

            $table->index(['upload_status']);
            $table->index(['scan_status']);
            $table->index(['uploaded_at']);
            $table->index(['uploaded_by']);
            $table->index(['checksum']);
        });

        Schema::create('document_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->foreignId('document_version_id')->nullable()->constrained('document_versions')->nullOnDelete();
            $table->string('organization_code')->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('action');
            $table->string('permission')->nullable();
            $table->string('permission_result')->nullable(); // GRANTED | DENIED
            $table->string('ip_address')->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('request_id')->nullable();
            $table->string('correlation_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['document_id']);
            $table->index(['actor_user_id']);
            $table->index(['action']);
            $table->index(['created_at']);
        });

        // Constraints Blueprint cannot express portably. SQLite cannot ALTER in
        // CHECK constraints at all, so they are Postgres/MySQL only — the
        // application enforces the same rules regardless.
        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['pgsql', 'mysql'], true)) {
            DB::statement('ALTER TABLE document_versions ADD CONSTRAINT chk_document_version_positive CHECK (version > 0)');
            DB::statement('ALTER TABLE document_versions ADD CONSTRAINT chk_document_size_non_negative CHECK (file_size >= 0)');
        }

        $this->backfillFromDocumentUploads();
    }

    /**
     * Carry rows from the flat document_uploads table across, one logical
     * document per (user_id|emp_code, document_type) with its versions attached.
     */
    private function backfillFromDocumentUploads(): void
    {
        if (!Schema::hasTable('document_uploads')) {
            return;
        }

        DB::table('document_uploads')->orderBy('id')->chunkById(200, function ($rows) {
            foreach ($rows as $row) {
                $ownerRef = $row->emp_code ?: ($row->user_id ? 'USR' . str_pad((string) $row->user_id, 6, '0', STR_PAD_LEFT) : null);

                $documentId = DB::table('documents')
                    ->where('document_type', $row->document_type)
                    ->when($row->user_id, fn ($q) => $q->where('user_id', $row->user_id))
                    ->when(!$row->user_id, fn ($q) => $q->where('owner_ref', $ownerRef))
                    ->value('id');

                if (!$documentId) {
                    $documentId = DB::table('documents')->insertGetId([
                        'owner_type'      => 'employee',
                        'owner_id'        => $row->user_id,
                        'owner_ref'       => $ownerRef,
                        'user_id'         => $row->user_id,
                        'document_type'   => $row->document_type,
                        'current_version' => 0,
                        'status'          => 'ACTIVE',
                        'created_by'      => $row->uploaded_by ?? null,
                        'created_at'      => $row->created_at ?? now(),
                        'updated_at'      => $row->updated_at ?? now(),
                    ]);
                }

                DB::table('document_versions')->insert([
                    'document_id'         => $documentId,
                    'version'             => $row->version ?: 1,
                    'original_file_name'  => $row->original_name ?: $row->generated_name,
                    'generated_file_name' => $row->generated_name,
                    'bucket_name'         => null,
                    // Legacy rows live on local disk; the migrate command
                    // rewrites this to a real S3 key once uploaded.
                    's3_object_key'       => $row->storage_path,
                    'folder_path'         => dirname((string) $row->storage_path),
                    'file_extension'      => $row->extension ?: 'bin',
                    'file_size'           => $row->size ?: 0,
                    'mime_type'           => $row->mime_type ?: 'application/octet-stream',
                    'checksum_algorithm'  => 'sha256',
                    'checksum'            => $row->checksum,
                    'storage_class'       => 'LOCAL',
                    'upload_status'       => 'ACTIVE',
                    'scan_status'         => 'NOT_SCANNED',
                    'uploaded_by'         => $row->uploaded_by ?? null,
                    'uploaded_at'         => $row->uploaded_at ?? $row->created_at ?? now(),
                    'created_at'          => $row->created_at ?? now(),
                    'updated_at'          => $row->updated_at ?? now(),
                ]);

                DB::table('documents')->where('id', $documentId)->update([
                    'current_version' => DB::table('document_versions')->where('document_id', $documentId)->max('version'),
                    'updated_at'      => now(),
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_audit_logs');
        Schema::dropIfExists('document_versions');
        Schema::dropIfExists('documents');
    }
};
