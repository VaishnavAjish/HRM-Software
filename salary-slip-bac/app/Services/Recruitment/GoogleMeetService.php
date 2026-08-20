<?php

namespace App\Services\Recruitment;

use App\Models\Interview;
use Illuminate\Support\Str;

/**
 * Creates real Google Meet-backed Calendar events for interviews via a
 * service account with domain-wide delegation — see
 * docs/google-meet-setup.md for how that's provisioned.
 *
 * Deliberately fails closed: if credentials aren't configured or Google API SDK
 * is missing, this never fabricates a meeting link.
 */
class GoogleMeetService
{
    private const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

    public function isConfigured(): bool
    {
        if (!class_exists('\Google\Client') || !class_exists('\Google\Service\Calendar')) {
            return false;
        }

        $path = config('services.google.service_account_path');
        $impersonate = config('services.google.impersonate');

        return $path && $impersonate && is_file($path);
    }

    /**
     * Creates a Calendar event with a Google Meet conference attached and
     * persists the result onto the interview.
     */
    public function createMeeting(Interview $interview): Interview
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Google Calendar integration is not configured or missing SDK dependencies.');
        }

        $service = $this->calendarService();

        $event = new \Google\Service\Calendar\Event([
            'summary' => $this->summary($interview),
            'description' => $this->description($interview),
            'start' => new \Google\Service\Calendar\EventDateTime([
                'dateTime' => $interview->scheduled_at->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'end' => new \Google\Service\Calendar\EventDateTime([
                'dateTime' => $interview->scheduled_at->copy()
                    ->addMinutes((int) ($interview->duration_minutes ?: 30))
                    ->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'attendees' => $this->attendees($interview),
            'conferenceData' => new \Google\Service\Calendar\ConferenceData([
                'createRequest' => new \Google\Service\Calendar\CreateConferenceRequest([
                    'requestId' => (string) Str::uuid(),
                    'conferenceSolutionKey' => new \Google\Service\Calendar\ConferenceSolutionKey(['type' => 'hangoutsMeet']),
                ]),
            ]),
        ]);

        $created = $service->events->insert('primary', $event, [
            'conferenceDataVersion' => 1,
            'sendUpdates' => 'all',
        ]);

        $interview->forceFill([
            'meeting_link' => $created->getHangoutLink(),
            'google_event_id' => $created->getId(),
            'meeting_status' => 'created',
            'meeting_error' => null,
            'meeting_created_at' => now(),
        ])->save();

        return $interview;
    }

    /** Patches the existing Calendar event's time. */
    public function updateMeetingTime(Interview $interview): Interview
    {
        if (!$interview->google_event_id) {
            return $this->createMeeting($interview);
        }

        if (!$this->isConfigured()) {
            throw new \RuntimeException('Google Calendar integration is not configured.');
        }

        $service = $this->calendarService();

        $event = new \Google\Service\Calendar\Event([
            'start' => new \Google\Service\Calendar\EventDateTime([
                'dateTime' => $interview->scheduled_at->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'end' => new \Google\Service\Calendar\EventDateTime([
                'dateTime' => $interview->scheduled_at->copy()
                    ->addMinutes((int) ($interview->duration_minutes ?: 30))
                    ->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
        ]);

        $updated = $service->events->patch('primary', $interview->google_event_id, $event, [
            'sendUpdates' => 'all',
        ]);

        $interview->forceFill([
            'meeting_link' => $updated->getHangoutLink() ?: $interview->meeting_link,
            'meeting_status' => 'created',
            'meeting_error' => null,
        ])->save();

        return $interview;
    }

    /** Deletes the Calendar event on interview cancellation. */
    public function deleteMeeting(Interview $interview): void
    {
        if (!$interview->google_event_id) {
            return;
        }

        if (!$this->isConfigured()) {
            return;
        }

        $service = $this->calendarService();
        $service->events->delete('primary', $interview->google_event_id, ['sendUpdates' => 'all']);

        $interview->forceFill([
            'google_event_id' => null,
            'meeting_status' => null,
        ])->save();
    }

    private function calendarService(): mixed
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Google Calendar integration is not configured.');
        }

        $clientClass = '\Google\Client';
        $calendarClass = '\Google\Service\Calendar';

        $client = new $clientClass();
        $client->setAuthConfig(config('services.google.service_account_path'));
        $client->setScopes(self::SCOPES);
        $client->setSubject(config('services.google.impersonate'));

        return new $calendarClass($client);
    }

    private function attendees(Interview $interview): array
    {
        $emails = [];

        if ($interview->candidate?->email) {
            $emails[] = $interview->candidate->email;
        }

        foreach ($interview->panelists as $panelist) {
            if ($panelist->user?->email) {
                $emails[] = $panelist->user->email;
            }
        }

        $attendeeClass = '\Google\Service\Calendar\EventAttendee';

        return collect($emails)
            ->unique()
            ->map(fn ($email) => new $attendeeClass(['email' => $email]))
            ->values()
            ->all();
    }

    private function summary(Interview $interview): string
    {
        $role = $interview->requisition?->title ?? $interview->candidate?->requisition?->title;

        return trim(($interview->round_name ?: 'Interview') . ' — ' . ($interview->candidate?->name ?? 'Candidate') . ($role ? " ({$role})" : ''));
    }

    private function description(Interview $interview): string
    {
        return "Interview round: {$interview->round_name}\nCandidate: " . ($interview->candidate?->name ?? '—')
            . "\nScheduled via NISS HRMS.";
    }
}
