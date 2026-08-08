<?php

namespace App\Http\Controllers;

use App\Models\JobRequisition;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class IndeedFeedController extends Controller
{
    public function index(Request $request)
    {
        $requisitions = JobRequisition::whereIn('status', ['posted', 'approved'])
            ->orderByDesc('id')
            ->get();

        $token = config('services.candidate_intake.token');
        $baseUrl = config('app.url', 'https://niss.pro');
        $applyUrl = "{$baseUrl}/api/candidate-intake/{$token}";

        $xml = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><source></source>');
        $xml->addChild('publisher', 'NISS HRMS');
        $xml->addChild('publisherurl', $baseUrl);
        $xml->addChild('lastBuildDate', now()->toRfc2822String());

        foreach ($requisitions as $req) {
            $job = $xml->addChild('job');
            $job->addChild('title', htmlspecialchars($req->title));
            $job->addChild('date', htmlspecialchars($req->created_at?->toRfc2822String() ?? now()->toRfc2822String()));
            $job->addChild('referencenumber', 'NISS-REQ-' . $req->id);
            $job->addChild('url', htmlspecialchars($applyUrl));
            $job->addChild('company', htmlspecialchars($req->company_code ? Str::headline($req->company_code) : 'Nidhi Impex'));
            $job->addChild('city', htmlspecialchars($req->unit ?? 'Surat'));
            $job->addChild('state', 'Gujarat');
            $job->addChild('country', 'IN');
            $job->addChild('description', htmlspecialchars(strip_tags($req->description ?? "Job opening for {$req->title}.")));
            $job->addChild('salary', htmlspecialchars('₹' . number_format($req->salary_min ?? 300000) . ' - ₹' . number_format($req->salary_max ?? 600000) . ' per year'));
            $job->addChild('jobtype', htmlspecialchars($req->employment_type ?? 'fulltime'));
        }

        return response($xml->asXML(), 200, [
            'Content-Type' => 'application/xml; charset=utf-8',
        ]);
    }
}
