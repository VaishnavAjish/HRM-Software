<?php

namespace App\Http\Requests\Authorization;

use Illuminate\Foundation\Http\FormRequest;
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

    public function payload(): array
    {
        return $this->validated();
    }
}
