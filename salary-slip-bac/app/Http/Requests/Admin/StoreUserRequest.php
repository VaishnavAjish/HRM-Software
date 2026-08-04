<?php

namespace App\Http\Requests\Admin;

use App\Services\Authorization\SchemaSupport;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:190'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'empCode' => ['required', 'string', 'max:64', Rule::unique('users', 'emp_code')],
            'mobile' => ['nullable', 'string', 'max:20', Rule::unique('users', 'mobile_number')],
            'password' => ['required', 'string', 'min:8', 'max:128'],
            'role' => ['required', 'integer', Rule::in([0, 1, 2, 3, 4])],
            'companyCode' => ['required', 'string', 'max:190'],
            'unit' => ['nullable', 'string', 'max:190'],
            'department' => ['nullable', 'string', 'max:190'],
            'designation' => ['nullable', 'string', 'max:190'],
            'branch' => ['nullable', 'string', 'max:190'],
            'joiningDate' => ['nullable', 'string', 'max:32'],
            'managerName' => ['nullable', 'string', 'max:190'],
            'roleIds' => ['nullable', 'array', 'max:20'],
            'roleIds.*' => ['integer', 'exists:roles,id'],
            'businessReason' => ['nullable', 'string', 'max:1000'],
        ];

        if (SchemaSupport::hasColumn('users', 'username')) {
            $rules['username'] = [
                'nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('users', 'username'),
            ];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'That email address already belongs to another user.',
            'empCode.unique' => 'That employee ID already belongs to another user.',
            'mobile.unique' => 'That mobile number already belongs to another user.',
            'username.unique' => 'That username is already taken.',
            'username.regex' => 'A username may contain letters, numbers, dots, underscores and hyphens only.',
        ];
    }

    public function payload(): array
    {
        $data = $this->validated();

        return [
            'name' => $data['name'],
            'email' => $data['email'],
            'emp_code' => $data['empCode'],
            'mobile_number' => $data['mobile'] ?? null,
            'password' => $data['password'],
            'role' => (int) $data['role'],
            'company_code' => $data['companyCode'],
            'unit' => $data['unit'] ?? null,
            'department' => $data['department'] ?? null,
            'designation' => $data['designation'] ?? null,
            'branch' => $data['branch'] ?? null,
            'joining_date' => $data['joiningDate'] ?? null,
            'manager_name' => $data['managerName'] ?? null,
            'username' => $data['username'] ?? null,
            'roleIds' => $data['roleIds'] ?? [],
            'businessReason' => $data['businessReason'] ?? null,
        ];
    }
}
