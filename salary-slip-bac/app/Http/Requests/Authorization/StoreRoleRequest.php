<?php

namespace App\Http\Requests\Authorization;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:190', Rule::unique('roles', 'name')],
            'code' => ['nullable', 'string', 'max:190', 'regex:/^[a-z0-9._-]+$/', Rule::unique('roles', 'code')],
            'description' => ['nullable', 'string', 'max:1000'],
            'roleType' => ['nullable', 'string', 'max:32'],
            'tenantId' => ['nullable', 'string', 'max:190'],
            'defaultScopeType' => ['nullable', 'string', 'max:32'],
            'isAssignable' => ['nullable', 'boolean'],
            'isSensitive' => ['nullable', 'boolean'],
            'requiresApproval' => ['nullable', 'boolean'],
        ];
    }

    /**
     * Validate the code that will actually be stored, not just a supplied one.
     *
     * `code` is nullable, and when it is omitted the service derives it from the
     * name with Str::slug(). That derived value never passed through the unique
     * rule above, so creating a role named "EMP" while a role coded `emp`
     * already existed cleared validation and then died on the database
     * constraint — surfacing the raw INSERT, table and column names to the
     * browser instead of a field error.
     *
     * Deriving it here means one value is checked and stored.
     */
    protected function prepareForValidation(): void
    {
        if (blank($this->input('code')) && filled($this->input('name'))) {
            $this->merge(['code' => Str::slug((string) $this->input('name'), '_')]);
        }
    }

    /**
     * Name the collision and who owns it.
     *
     * The code is usually derived from the name rather than typed, so a bare
     * "already been taken" points at a field the administrator never filled in
     * and does not explain which role holds it. Saying that "EMP" resolves to
     * `emp`, which belongs to "Admin", is the difference between a dead end and
     * an obvious next step.
     */
    public function messages(): array
    {
        $code = (string) $this->input('code');
        $owner = $code === '' ? null : Role::query()->where('code', $code)->value('name');

        return [
            'code.unique' => $owner
                ? "The code \"{$code}\" is already used by the role \"{$owner}\". Enter a different code."
                : 'The code ":input" is already in use. Enter a different code.',
            'name.unique' => 'A role with this name already exists.',
        ];
    }

    public function payload(): array
    {
        return $this->validated();
    }
}
