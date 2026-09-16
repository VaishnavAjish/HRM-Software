<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ScopesCompanyOrAllCompanies;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimRuleBook;
use App\Models\Mediclaim\MediclaimRuleBookLanguage;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * `GET,POST /rule-books`, `PUT /rule-books/{id}`, `POST /rule-books/{id}/publish`,
 * `POST,PUT,DELETE /rule-books/{id}/items[/{item}]`, `PUT /rule-books/{id}/items-reorder`.
 *
 * A rule book belongs to one language (`mediclaim_rule_book_languages`,
 * managed separately via `RuleBookLanguageController`) and is filled with
 * individual rule text entries added one at a time — never a PDF upload.
 * At most one rule book exists per language (enforced in `store()`).
 */
class RuleBookController extends Controller
{
    use ScopesCompanyOrAllCompanies;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimRuleBook::query()->with(['language', 'items', 'publishedBy:id,name,email']);
        $this->applyCompanyOrAllCompaniesScope($query, $request);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('language_id')) {
            $query->where('language_id', (int) $request->query('language_id'));
        }

        return $this->ok($query->orderByDesc('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['required', 'string', 'max:60'],
            'language_id' => [
                'required', 'integer',
                Rule::exists('mediclaim_rule_book_languages', 'id')->where('company_code', $request->input('company_code')),
            ],
            'version_label' => ['sometimes', 'nullable', 'string', 'max:100'],
            'effective_from' => ['sometimes', 'nullable', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        if (MediclaimRuleBook::where('language_id', $data['language_id'])->exists()) {
            throw ValidationException::withMessages(['language_id' => 'A rule book already exists for this language.']);
        }

        $actor = auth('api')->user();

        $ruleBook = MediclaimRuleBook::create([
            'company_code' => $data['company_code'],
            'language_id' => $data['language_id'],
            'version_label' => $data['version_label'] ?? null,
            'status' => 'draft',
            'effective_from' => $data['effective_from'] ?? null,
            'effective_to' => $data['effective_to'] ?? null,
            'created_by' => $actor->id,
        ]);

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_CREATED', 'mediclaim_rule_book', $ruleBook->id, null, $ruleBook->toArray(), 'Rule book created.', $ruleBook->company_code);

        return $this->ok($ruleBook->fresh(['language', 'items']), 201);
    }

    public function update(Request $request, int $ruleBook): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $data = $request->validate([
            'version_label' => ['sometimes', 'nullable', 'string', 'max:100'],
            'effective_from' => ['sometimes', 'nullable', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_UPDATED', 'mediclaim_rule_book', $model->id, $before, $model->fresh()->toArray(), 'Rule book updated.', $model->company_code);

        return $this->ok($model->fresh(['language', 'items']));
    }

    public function publish(Request $request, int $ruleBook): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        if ($model->items()->count() === 0) {
            throw ValidationException::withMessages(['items' => 'Add at least one rule before publishing.']);
        }

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->status = 'published';
        $model->published_at = now();
        $model->published_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_PUBLISHED', 'mediclaim_rule_book', $model->id, $before, $model->fresh()->toArray(), 'Rule book published.', $model->company_code);

        return $this->ok($model->fresh(['language', 'items']));
    }

    public function addItem(Request $request, int $ruleBook): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $data = $request->validate([
            'rule_text' => ['required', 'string', 'max:2000'],
        ]);

        $actor = auth('api')->user();
        $nextOrder = (int) ($model->items()->max('sort_order') ?? 0) + 1;

        $item = $model->items()->create([
            'rule_text' => trim($data['rule_text']),
            'sort_order' => $nextOrder,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ]);

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_ITEM_ADDED', 'mediclaim_rule_book', $model->id, null, $item->toArray(), 'Rule added.', $model->company_code);

        return $this->ok($model->fresh(['language', 'items']), 201);
    }

    public function updateItem(Request $request, int $ruleBook, int $item): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $row = $model->items()->where('id', $item)->first();

        if (! $row) {
            return $this->missing('Rule not found.');
        }

        $data = $request->validate([
            'rule_text' => ['required', 'string', 'max:2000'],
        ]);

        $actor = auth('api')->user();
        $before = $row->toArray();

        $row->rule_text = trim($data['rule_text']);
        $row->updated_by = $actor->id;
        $row->save();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_ITEM_UPDATED', 'mediclaim_rule_book', $model->id, $before, $row->fresh()->toArray(), 'Rule updated.', $model->company_code);

        return $this->ok($model->fresh(['language', 'items']));
    }

    public function deleteItem(Request $request, int $ruleBook, int $item): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $row = $model->items()->where('id', $item)->first();

        if (! $row) {
            return $this->missing('Rule not found.');
        }

        $actor = auth('api')->user();
        $before = $row->toArray();
        $row->delete();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_ITEM_DELETED', 'mediclaim_rule_book', $model->id, $before, null, 'Rule removed.', $model->company_code);

        return $this->ok($model->fresh(['language', 'items']));
    }

    public function reorderItems(Request $request, int $ruleBook): JsonResponse
    {
        $model = $this->scoped($request, $ruleBook);

        if (! $model) {
            return $this->missing('Rule book not found.');
        }

        $data = $request->validate([
            'item_ids' => ['required', 'array', 'min:1'],
            'item_ids.*' => ['integer'],
        ]);

        $submitted = $data['item_ids'];
        $validIds = $model->items()->pluck('id')->all();

        sort($submitted);
        $sortedValid = $validIds;
        sort($sortedValid);

        if ($submitted !== $sortedValid) {
            throw ValidationException::withMessages(['item_ids' => 'The rule list does not match the current rules for this rule book.']);
        }

        DB::transaction(function () use ($data) {
            foreach ($data['item_ids'] as $index => $id) {
                DB::table('mediclaim_rule_book_items')->where('id', $id)->update(['sort_order' => $index + 1, 'updated_at' => now()]);
            }
        });

        return $this->ok($model->fresh(['language', 'items']));
    }

    private function scoped(Request $request, int $id): ?MediclaimRuleBook
    {
        $query = MediclaimRuleBook::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
