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
            // The tier is legacy and advisory. The account's identity comes from
            // roleId, and the tier is recomputed from that role's code — a
            // request may no longer name a type and a contradicting role.
            'role' => ['nullable', 'integer', Rule::in([0, 1, 2, 3, 4])],
            'roleId' => ['required_without:role', 'nullable', 'integer', 'exists:roles,id'],
            // Either shape is accepted: companyIds is canonical, companyCode is
            // what the form sent before companies were records rather than text.
            'companyCode' => ['required_without:companyIds', 'nullable', 'string', 'max:190'],
            'companyIds' => ['nullable', 'array', 'max:50'],
            'companyIds.*' => ['integer'],
            // unit is the legacy single value the scope queries still match on;
            // unitIds is the membership. Sending unitIds overwrites unit with
            // the primary, so the two cannot disagree.
            'unitIds' => ['nullable', 'array', 'max:50'],
            'unitIds.*' => ['integer'],
            // Which of them is the home unit. Required by the service when more
            // than one is selected, rather than decided by the alphabet.
            'primaryUnitId' => ['nullable', 'integer'],
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
            'role' => isset($data['role']) ? (int) $data['role'] : null,
            'roleId' => $data['roleId'] ?? null,
            'company_code' => $data['companyCode'] ?? '',
            'companyIds' => $data['companyIds'] ?? [],
            'unitIds' => $data['unitIds'] ?? [],
            'primaryUnitId' => $data['primaryUnitId'] ?? null,
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
