<?php

namespace App\Http\Requests\Admin;

use App\Services\Authorization\SchemaSupport;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = (int) $this->route('id');

        $rules = [
            'name' => ['sometimes', 'required', 'string', 'max:190'],
            'email' => ['sometimes', 'required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($id)],
            'empCode' => ['sometimes', 'required', 'string', 'max:64', Rule::unique('users', 'emp_code')->ignore($id)],
            'mobile' => ['sometimes', 'nullable', 'string', 'max:20', Rule::unique('users', 'mobile_number')->ignore($id)],
            'role' => ['sometimes', 'integer', Rule::in([0, 1, 2, 3, 4])],
            'companyCode' => ['sometimes', 'required', 'string', 'max:190'],
            'unit' => ['sometimes', 'nullable', 'string', 'max:190'],
            'department' => ['sometimes', 'nullable', 'string', 'max:190'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:190'],
            'branch' => ['sometimes', 'nullable', 'string', 'max:190'],
            'joiningDate' => ['sometimes', 'nullable', 'string', 'max:32'],
            'managerName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'businessReason' => ['nullable', 'string', 'max:1000'],
        ];

        if (SchemaSupport::hasColumn('users', 'username')) {
            $rules['username'] = [
                'sometimes', 'nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('users', 'username')->ignore($id),
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

        $map = [
            'name' => 'name',
            'email' => 'email',
            'empCode' => 'emp_code',
            'mobile' => 'mobile_number',
            'companyCode' => 'company_code',
            'unit' => 'unit',
            'department' => 'department',
            'designation' => 'designation',
            'branch' => 'branch',
            'joiningDate' => 'joining_date',
            'managerName' => 'manager_name',
            'username' => 'username',
        ];

        $out = [];

        foreach ($map as $input => $column) {
            if (array_key_exists($input, $data)) {
                $out[$column] = $data[$input];
            }
        }

        if (array_key_exists('role', $data)) {
            $out['role'] = (int) $data['role'];
        }

        $out['businessReason'] = $data['businessReason'] ?? null;

        return $out;
    }
}
