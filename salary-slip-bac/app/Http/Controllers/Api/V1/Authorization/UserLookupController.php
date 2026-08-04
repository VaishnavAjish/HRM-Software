<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserLookupController extends Controller
{
    private const LIMIT = 20;

    public function index(Request $request)
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'ids' => ['nullable', 'array', 'max:50'],
            'ids.*' => ['integer'],
        ]);

        $actor = auth('api')->user();
        $term = trim($data['q'] ?? '');
        $operator = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

        $query = DB::table('users')
            ->where('is_deleted', 0)
            ->when((int) $actor->role !== 0 && $actor->company_code, function ($q) use ($actor) {
                return $q->whereIn('company_code', array_filter(array_map('trim', explode(',', (string) $actor->company_code))));
            });

        if (!empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif ($term !== '') {
            $like = '%' . $term . '%';
            $query->where(function ($q) use ($like, $term, $operator) {
                $q->where('name', $operator, $like)
                    ->orWhere('emp_code', $operator, $like)
                    ->orWhere('email', $operator, $like);

                if (ctype_digit($term)) {
                    $q->orWhere('id', (int) $term);
                }
            });
        } else {
            return response()->json(['success' => true, 'data' => []]);
        }

        $users = $query->orderBy('name')->limit(self::LIMIT)->get([
            'id', 'name', 'emp_code', 'company_code', 'unit', 'department', 'status',
        ]);

        return response()->json([
            'success' => true,
            'data' => $users->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'empCode' => $user->emp_code,
                'companyCode' => $user->company_code,
                'unit' => $user->unit,
                'department' => $user->department,
                'label' => trim(sprintf(
                    '%s%s%s',
                    $user->name,
                    $user->emp_code ? ' · ' . $user->emp_code : '',
                    $user->unit ? ' · ' . $user->unit : ''
                )),
            ]),
        ]);
    }
}
