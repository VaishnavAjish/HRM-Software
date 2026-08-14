<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\LegalEntityAddress;
use App\Models\LegalEntityBankAccount;
use App\Models\LegalEntityProfile;
use App\Models\LegalEntityRegistration;
use App\Models\LegalEntityRepresentative;
use App\Services\Organization\LegalEntityProfileService;
use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * DOMAIN 02.02 — Legal Entity Profiles.
 *
 * Profiles hang under companies; registrations, addresses, representatives and
 * bank accounts hang under a profile. Documents are read-only here (the upload
 * module owns the rows). Routes carry permission:org.legal_entity.*; the
 * service owns tenancy and primary-flag rules.
 */
class LegalEntityProfileController extends Controller
{
    public function __construct(
        private readonly LegalEntityProfileService $service,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->profiles([
                'companyIds' => $request->query('company_ids', $request->query('companyIds')),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]);
    }

    public function companies(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->service->assignableCompanies(auth('api')->user()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->profileRules());

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->create($data, auth('api')->user())
            ),
        ], 201));
    }

    public function show(int $id): JsonResponse
    {
        $profile = LegalEntityProfile::query()->find($id);

        if (! $profile) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present($profile),
        ]));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = LegalEntityProfile::query()->find($id);

        if (! $profile) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate($this->profileRules(true));

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->update($profile, $data, auth('api')->user())
            ),
        ]));
    }

    public function setStatus(Request $request, int $id): JsonResponse
    {
        $profile = LegalEntityProfile::query()->find($id);

        if (! $profile) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate(['isActive' => ['required', 'boolean']]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->present(
                $this->service->setStatus($profile, (bool) $data['isActive'], auth('api')->user())
            ),
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $profile = LegalEntityProfile::query()->find($id);

        if (! $profile) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(function () use ($profile) {
            $this->service->delete($profile, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $profile->id]]);
        });
    }

    /* --------------------------------------------------------- registrations */

    public function registrations(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->registrations($profileId, [
                'search' => $request->query('search'),
                'type' => $request->query('type'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeRegistration(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate([
            'type' => ['required', 'string', 'max:60'],
            'jurisdiction' => ['sometimes', 'nullable', 'string', 'max:190'],
            'registrationNumber' => ['required', 'string', 'max:100'],
            'registrationDate' => ['sometimes', 'nullable', 'date'],
            'expiryDate' => ['sometimes', 'nullable', 'date', 'after_or_equal:registrationDate'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentRegistration(
                $this->service->createRegistration($profileId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateRegistration(Request $request, int $profileId, int $id): JsonResponse
    {
        $reg = LegalEntityRegistration::query()->find($id);

        if (! $reg) {
            return $this->missing('Registration not found.');
        }

        $data = $request->validate([
            'type' => ['sometimes', 'string', 'max:60'],
            'jurisdiction' => ['sometimes', 'nullable', 'string', 'max:190'],
            'registrationNumber' => ['sometimes', 'string', 'max:100'],
            'registrationDate' => ['sometimes', 'nullable', 'date'],
            'expiryDate' => ['sometimes', 'nullable', 'date'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentRegistration(
                $this->service->updateRegistration($reg, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyRegistration(int $profileId, int $id): JsonResponse
    {
        $reg = LegalEntityRegistration::query()->find($id);

        if (! $reg) {
            return $this->missing('Registration not found.');
        }

        return $this->guarded(function () use ($reg) {
            $this->service->deleteRegistration($reg, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $reg->id]]);
        });
    }

    /* ------------------------------------------------------------ addresses */

    public function addresses(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->addresses($profileId, [
                'type' => $request->query('type'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeAddress(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate([
            'type' => ['required', 'string', 'max:60'],
            'addressLine1' => ['required', 'string', 'max:500'],
            'addressLine2' => ['sometimes', 'nullable', 'string', 'max:500'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', 'string', 'max:120'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'postalCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAddress(
                $this->service->createAddress($profileId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateAddress(Request $request, int $profileId, int $id): JsonResponse
    {
        $address = LegalEntityAddress::query()->find($id);

        if (! $address) {
            return $this->missing('Address not found.');
        }

        $data = $request->validate([
            'type' => ['sometimes', 'string', 'max:60'],
            'addressLine1' => ['sometimes', 'string', 'max:500'],
            'addressLine2' => ['sometimes', 'nullable', 'string', 'max:500'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', 'string', 'max:120'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'postalCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentAddress(
                $this->service->updateAddress($address, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyAddress(int $profileId, int $id): JsonResponse
    {
        $address = LegalEntityAddress::query()->find($id);

        if (! $address) {
            return $this->missing('Address not found.');
        }

        return $this->guarded(function () use ($address) {
            $this->service->deleteAddress($address, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $address->id]]);
        });
    }

    /* -------------------------------------------------------- representatives */

    public function representatives(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->representatives($profileId, [
                'type' => $request->query('type'),
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeRepresentative(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:190'],
            'email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'pan' => ['sometimes', 'nullable', 'string', 'max:20'],
            'din' => ['sometimes', 'nullable', 'string', 'max:30'],
            'type' => ['required', 'string', 'max:60'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
            'appointmentDate' => ['sometimes', 'nullable', 'date'],
            'cessationDate' => ['sometimes', 'nullable', 'date', 'after_or_equal:appointmentDate'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentRepresentative(
                $this->service->createRepresentative($profileId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateRepresentative(Request $request, int $profileId, int $id): JsonResponse
    {
        $rep = LegalEntityRepresentative::query()->find($id);

        if (! $rep) {
            return $this->missing('Representative not found.');
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:190'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:190'],
            'email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'pan' => ['sometimes', 'nullable', 'string', 'max:20'],
            'din' => ['sometimes', 'nullable', 'string', 'max:30'],
            'type' => ['sometimes', 'string', 'max:60'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
            'appointmentDate' => ['sometimes', 'nullable', 'date'],
            'cessationDate' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentRepresentative(
                $this->service->updateRepresentative($rep, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyRepresentative(int $profileId, int $id): JsonResponse
    {
        $rep = LegalEntityRepresentative::query()->find($id);

        if (! $rep) {
            return $this->missing('Representative not found.');
        }

        return $this->guarded(function () use ($rep) {
            $this->service->deleteRepresentative($rep, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $rep->id]]);
        });
    }

    /* ----------------------------------------------------------- bank accounts */

    public function bankAccounts(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->bankAccounts($profileId, [
                'status' => $request->query('status'),
            ], auth('api')->user()),
        ]));
    }

    public function storeBankAccount(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        $data = $request->validate([
            'bankName' => ['required', 'string', 'max:190'],
            'branchName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'ifscCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'accountType' => ['required', 'string', 'max:30'],
            'accountNumber' => ['required', 'string', 'min:6', 'max:40'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentBankAccount(
                $this->service->createBankAccount($profileId, $data, auth('api')->user())
            ),
        ], 201));
    }

    public function updateBankAccount(Request $request, int $profileId, int $id): JsonResponse
    {
        $account = LegalEntityBankAccount::query()->find($id);

        if (! $account) {
            return $this->missing('Bank account not found.');
        }

        $data = $request->validate([
            'bankName' => ['sometimes', 'string', 'max:190'],
            'branchName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'ifscCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'accountType' => ['sometimes', 'string', 'max:30'],
            'accountNumber' => ['sometimes', 'string', 'min:6', 'max:40'],
            'isPrimary' => ['sometimes', 'boolean'],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->presentBankAccount(
                $this->service->updateBankAccount($account, $data, auth('api')->user())
            ),
        ]));
    }

    public function destroyBankAccount(int $profileId, int $id): JsonResponse
    {
        $account = LegalEntityBankAccount::query()->find($id);

        if (! $account) {
            return $this->missing('Bank account not found.');
        }

        return $this->guarded(function () use ($account) {
            $this->service->deleteBankAccount($account, auth('api')->user());

            return response()->json(['success' => true, 'data' => ['id' => $account->id]]);
        });
    }

    /* --------------------------------------------------------------- documents */

    public function documents(Request $request, int $profileId): JsonResponse
    {
        if (! $this->profileExists($profileId)) {
            return $this->missing('Legal entity profile not found.');
        }

        return $this->guarded(fn () => response()->json([
            'success' => true,
            'data' => $this->service->documents($profileId, [
                'kind' => $request->query('kind'),
            ], auth('api')->user()),
        ]));
    }

    /* ----------------------------------------------------------------- helpers */

    private function profileRules(bool $update = false): array
    {
        $rules = [
            'companyId' => ['integer', 'exists:companies,id'],
            'legalName' => ['string', 'max:190'],
            'tradingName' => ['sometimes', 'nullable', 'string', 'max:190'],
            'corporateIdentificationNumber' => ['sometimes', 'nullable', 'string', 'max:100'],
            'incorporationDate' => ['sometimes', 'nullable', 'date'],
            'countryCode' => ['sometimes', 'nullable', 'string', 'size:2', 'alpha'],
            'registeredAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'correspondenceAddress' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'contactEmail' => ['sometimes', 'nullable', 'email', 'max:190'],
            'contactPhone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'website' => ['sometimes', 'nullable', 'string', 'max:190'],
            'isActive' => ['sometimes', 'boolean'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date'],
            'effectiveTo' => ['sometimes', 'nullable', 'date', 'after_or_equal:effectiveFrom'],
        ];

        if ($update) {
            foreach ($rules as $key => $rule) {
                $rules[$key] = array_merge(['sometimes'], $rule);
            }
        } else {
            $rules['companyId'][] = 'required';
            $rules['legalName'][] = 'required';
        }

        return $rules;
    }

    private function profileExists(int $id): bool
    {
        return LegalEntityProfile::query()->whereKey($id)->exists();
    }

    private function guarded(callable $run): JsonResponse
    {
        try {
            return $run();
        } catch (ProvisioningException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }
    }

    private function missing(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => $message],
        ], 404);
    }
}
