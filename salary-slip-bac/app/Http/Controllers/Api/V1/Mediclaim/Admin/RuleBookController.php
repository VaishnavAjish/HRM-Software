<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Exceptions\DocumentException;
use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Mediclaim\MediclaimRuleBook;
use App\Services\Documents\DocumentService;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * `GET,POST /rule-books`, `POST /rule-books/{id}/publish`.
 *
 * `store()` uploads the trilingual rule-book PDF via the existing
 * `DocumentService` (the `RULE_BOOK` slug added to `DocumentType` in B2) and
 * links it via `mediclaim_document_links` — this is a plain document upload
 * of an admin-prepared file, not PDF *generation*, so it is in scope here
 * (B6 is only the card/claim-form PDF *rendering*). Per B2's own note, the
 * actual PDF is never committed to source control or embedded here — this
 * endpoint just accepts whatever file the admin screen uploads post-launch.
 */
class RuleBookController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimRuleBook::query()->with(['documentLinks.document.currentVersionRecord', 'publishedBy:id,name,email']);
        $this->applyCompanyScope($query, $request);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['required', 'string', 'max:60'],
            'version_label' => ['required', 'string', 'max:100'],
            'effective_from' => ['sometimes', 'nullable', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
            'file' => ['required', 'file'],
        ]);

        $actor = auth('api')->user();

        try {
            $ruleBook = DB::transaction(function () use ($data, $actor) {
                $ruleBook = MediclaimRuleBook::create([
                    'company_code' => $data['company_code'],
                    'version_label' => $data['version_label'],
                    'status' => 'draft',
                    'effective_from' => $data['effective_from'] ?? null,
                    'effective_to' => $data['effective_to'] ?? null,
                    'created_by' => $actor->id,
                ]);

                MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_CREATED', 'mediclaim_rule_book', $ruleBook->id, null, $ruleBook->toArray(), 'Rule book created.', $ruleBook->company_code);

                return $ruleBook;
            });

            $version = DocumentService::make()->upload(
                $request->file('file'),
                $actor,
                'RULE_BOOK',
                $actor->id,
                $request->header('Idempotency-Key')
            );

            MediclaimDocumentLink::create([
                'document_id' => $version->document_id,
                'linkable_type' => MediclaimRuleBook::class,
                'linkable_id' => $ruleBook->id,
                'document_role' => 'RULE_BOOK',
                'created_by' => $actor->id,
            ]);

            return $this->ok($ruleBook->fresh(['documentLinks.document.currentVersionRecord']), 201);
        } catch (DocumentException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }
    }

    public function publish(Request $request, int $ruleBook): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->status = 'published';
        $model->published_at = now();
        $model->published_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_PUBLISHED', 'mediclaim_rule_book', $model->id, $before, $model->fresh()->toArray(), 'Rule book published.', $model->company_code);

        return $this->ok($model->fresh(['documentLinks.document.currentVersionRecord']));
    }

    private function scoped(Request $request, int $id): ?MediclaimRuleBook
    {
        $query = MediclaimRuleBook::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
