<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ScopesCompanyOrAllCompanies;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimRuleBookLanguage;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET,POST,PUT,DELETE /rule-book-languages` — full CRUD for the languages
 * HR can write Mediclaim rule book content in (not a fixed EN/HI/GU list).
 * Deleting a language cascades to its rule book and rules (see the
 * `language_id` FK migration's docblock) — rule-book content is pure
 * admin-authored text, not something needing historical retention.
 */
class RuleBookLanguageController extends Controller
{
    use ScopesCompanyOrAllCompanies;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimRuleBookLanguage::query();
        $this->applyCompanyOrAllCompaniesScope($query, $request);

        return $this->ok($query->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request));

        $actor = auth('api')->user();
        $language = MediclaimRuleBookLanguage::create($data + [
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ]);

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_LANGUAGE_CREATED', 'mediclaim_rule_book_language', $language->id, null, $language->toArray(), 'Rule book language added.', $language->company_code);

        return $this->ok($language->fresh(), 201);
    }

    public function update(Request $request, int $language): JsonResponse
    {
        $model = $this->scoped($request, $language);

        if (! $model) {
            return $this->missing('Language not found.');
        }

        $data = $request->validate($this->rules($request, $model));

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->updated_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_LANGUAGE_UPDATED', 'mediclaim_rule_book_language', $model->id, $before, $model->fresh()->toArray(), 'Rule book language updated.', $model->company_code);

        return $this->ok($model->fresh());
    }

    public function destroy(Request $request, int $language): JsonResponse
    {
        $model = $this->scoped($request, $language);

        if (! $model) {
            return $this->missing('Language not found.');
        }

        $actor = auth('api')->user();
        $before = $model->toArray();
        $companyCode = $model->company_code;
        $model->delete();

        MediclaimActivityLogSupport::log($actor, 'RULE_BOOK_LANGUAGE_DELETED', 'mediclaim_rule_book_language', $before['id'], $before, null, 'Rule book language deleted.', $companyCode);

        return $this->ok(['id' => $language]);
    }

    private function rules(Request $request, ?MediclaimRuleBookLanguage $model = null): array
    {
        $isUpdate = (bool) $model;

        return [
            'company_code' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:60'],
            'name' => [
                $isUpdate ? 'sometimes' : 'required', 'string', 'max:60',
                Rule::unique('mediclaim_rule_book_languages', 'name')
                    ->where('company_code', $request->input('company_code', $model?->company_code))
                    ->ignore($model?->id),
            ],
            'native_name' => ['sometimes', 'nullable', 'string', 'max:60'],
        ];
    }

    private function scoped(Request $request, int $id): ?MediclaimRuleBookLanguage
    {
        $query = MediclaimRuleBookLanguage::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
