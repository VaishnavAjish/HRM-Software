<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimCardSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CardSettingController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $companyCode = $request->query('company_code');
        $query = MediclaimCardSetting::query();

        if ($companyCode && $companyCode !== 'all') {
            $query->where('company_code', $companyCode);
        }

        $records = $query->get();
        $mapped = [];
        foreach ($records as $r) {
            $mapped[$r->company_code] = [
                'company_code' => $r->company_code,
                'name' => $r->name,
                'legalName' => $r->legal_name,
                'tagline' => $r->tagline,
                'sideSlogan' => $r->side_slogan,
                'backSlogan' => $r->back_slogan,
                'email' => $r->email,
                'phone' => $r->phone,
                'helpline' => $r->helpline,
                'website' => $r->website,
                'address' => $r->address,
                'insurerName' => $r->insurer_name,
                'tpaCode' => $r->tpa_code,
                'instructions' => $r->instructions,
                'fieldToggles' => $r->field_toggles,
                'logo' => $r->logo,
                'signatureUrl' => $r->signature_url,
                'signatureTitle' => $r->signature_title,
            ];
        }

        return $this->ok($mapped);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['required', 'string', 'max:80'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'legalName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sideSlogan' => ['sometimes', 'nullable', 'string', 'max:255'],
            'backSlogan' => ['sometimes', 'nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:255'],
            'helpline' => ['sometimes', 'nullable', 'string', 'max:255'],
            'website' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'insurerName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'tpaCode' => ['sometimes', 'nullable', 'string', 'max:255'],
            'instructions' => ['sometimes', 'nullable', 'array'],
            'fieldToggles' => ['sometimes', 'nullable', 'array'],
            'logo' => ['sometimes', 'nullable', 'string'],
            'signatureUrl' => ['sometimes', 'nullable', 'string'],
            'signatureTitle' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $actor = auth('api')->user();
        $setting = MediclaimCardSetting::updateOrCreate(
            ['company_code' => $data['company_code']],
            [
                'name' => $data['name'] ?? null,
                'legal_name' => $data['legalName'] ?? null,
                'tagline' => $data['tagline'] ?? null,
                'side_slogan' => $data['sideSlogan'] ?? null,
                'back_slogan' => $data['backSlogan'] ?? null,
                'email' => $data['email'] ?? null,
                'phone' => $data['phone'] ?? null,
                'helpline' => $data['helpline'] ?? null,
                'website' => $data['website'] ?? null,
                'address' => $data['address'] ?? null,
                'insurer_name' => $data['insurerName'] ?? null,
                'tpa_code' => $data['tpaCode'] ?? null,
                'instructions' => $data['instructions'] ?? null,
                'field_toggles' => $data['fieldToggles'] ?? null,
                'logo' => $data['logo'] ?? null,
                'signature_url' => $data['signatureUrl'] ?? null,
                'signature_title' => $data['signatureTitle'] ?? null,
                'updated_by' => $actor?->id,
            ]
        );

        return $this->ok([
            'company_code' => $setting->company_code,
            'name' => $setting->name,
            'legalName' => $setting->legal_name,
            'tagline' => $setting->tagline,
            'sideSlogan' => $setting->side_slogan,
            'backSlogan' => $setting->back_slogan,
            'email' => $setting->email,
            'phone' => $setting->phone,
            'helpline' => $setting->helpline,
            'website' => $setting->website,
            'address' => $setting->address,
            'insurerName' => $setting->insurer_name,
            'tpaCode' => $setting->tpa_code,
            'instructions' => $setting->instructions,
            'fieldToggles' => $setting->field_toggles,
            'logo' => $setting->logo,
            'signatureUrl' => $setting->signature_url,
            'signatureTitle' => $setting->signature_title,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $companyCode = $request->input('company_code');
        if ($companyCode) {
            MediclaimCardSetting::where('company_code', $companyCode)->delete();
        }

        return $this->ok(['reset' => true, 'company_code' => $companyCode]);
    }
}
