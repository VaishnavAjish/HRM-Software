<?php

namespace App\Http\Controllers\Admin\Hr\Concerns;

use App\Models\User;
use App\Services\Authorization\Matrix\EmployeeScopeGuard;
use App\Support\AuditLogger;

/**
 * Target-employee authorization for HR endpoints that act on someone else's
 * record.
 *
 * `exists:users,id` is validation, not authorization: it proves the employee
 * exists and says nothing about whether this actor may touch them. Every write
 * that takes an employee id from the request has to answer the second question
 * separately, and has to answer it *before* it mutates anything.
 *
 * Deliberately narrow. This is the standalone security patch, so it enforces
 * scope and nothing else; response field projection is rebuilt separately rather
 * than half-implemented here.
 */
trait AuthorizesEmployeeTarget
{
    /**
     * Refuse a target employee outside the actor's company scope.
     *
     * Returns a response to send, or null to continue. Call it immediately after
     * validation and before any write.
     */
    protected function denyUnlessEmployeeInScope(int|string|null $userId): ?\Illuminate\Http\JsonResponse
    {
        if ($userId === null) {
            return null;
        }

        $target = User::find($userId);

        if ($target === null) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $actor = auth('api')->user();
        $guard = app(EmployeeScopeGuard::class);
        $result = $guard->check($actor, $target);

        if ($result === EmployeeScopeGuard::ALLOWED) {
            return null;
        }

        $this->recordCrossCompanyAttempt($actor, $target, $result);

        // 404 rather than 403: whether an employee of another company exists is
        // not something this endpoint should confirm.
        return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
    }

    /**
     * Refuse a company-bound record outside the actor's scope.
     *
     * A route id identifies a record; it does not authorize it. Without this an
     * actor could allocate, transfer, retire or re-status another company's
     * asset or resignation simply by knowing its id.
     */
    protected function denyUnlessRecordInScope(?object $record): ?\Illuminate\Http\JsonResponse
    {
        if ($record === null) {
            return null;
        }

        $actor = auth('api')->user();
        $guard = app(EmployeeScopeGuard::class);

        $result = $guard->allowsCompany(
            $actor,
            $record->company_code ?? null,
            $record->unit ?? null,
        );

        if ($result === EmployeeScopeGuard::ALLOWED) {
            return null;
        }

        return response()->json(['status' => false, 'message' => 'Not found'], 404);
    }

    private function recordCrossCompanyAttempt(?User $actor, User $target, string $result): void
    {
        if (! class_exists(AuditLogger::class)) {
            return;
        }

        try {
            AuditLogger::log(request(), 'HR_TARGET_SCOPE_DENIED', 'Authorization', null, [
                'actor_id' => $actor?->id,
                'actor_company' => $actor?->company_code,
                'target_user_id' => $target->id,
                'target_company' => $target->company_code,
                'reason' => $result,
                'route' => request()?->path(),
            ]);
        } catch (\Throwable) {
            // Telemetry must never turn a denial into a 500.
        }
    }
}
