<?php

namespace App\Http\Requests\Authorization;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $roleId = $this->route('role');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:190', Rule::unique('roles', 'name')->ignore($roleId)],
            'code' => ['sometimes', 'nullable', 'string', 'max:190', 'regex:/^[a-z0-9._-]+$/', Rule::unique('roles', 'code')->ignore($roleId)],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'roleType' => ['sometimes', 'nullable', 'string', 'max:32'],
            'tenantId' => ['sometimes', 'nullable', 'string', 'max:190'],
            'defaultScopeType' => ['sometimes', 'nullable', 'string', 'max:32'],
            'isAssignable' => ['sometimes', 'boolean'],
            'isSensitive' => ['sometimes', 'boolean'],
            'requiresApproval' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
        ];
    }

    public function payload(): array
    {
        return $this->validated();
    }
}
