<?php

namespace App\Services\Recruitment;

use App\Models\Interview;
use Google\Client as GoogleClient;
use Google\Service\Calendar as GoogleCalendar;
use Google\Service\Calendar\ConferenceData;
use Google\Service\Calendar\ConferenceSolutionKey;
use Google\Service\Calendar\CreateConferenceRequest;
use Google\Service\Calendar\Event;
use Google\Service\Calendar\EventAttendee;
use Google\Service\Calendar\EventDateTime;
use Illuminate\Support\Str;

/**
 * Creates real Google Meet-backed Calendar events for interviews via a
 * service account with domain-wide delegation — see
 * docs/google-meet-setup.md for how that's provisioned.
 *
 * Deliberately fails closed: if credentials aren't configured, or the
 * Google API call itself fails, this never fabricates a meeting link.
 * Callers persist meeting_status/meeting_error so the UI can show an honest
 * "not configured" / "failed" state instead of a fake-looking success.
 */
class GoogleMeetService
{
    private const SCOPES = [GoogleCalendar::CALENDAR_EVENTS];

    public function isConfigured(): bool
    {
        $path = config('services.google.service_account_path');
        $impersonate = config('services.google.impersonate');

        return $path && $impersonate && is_file($path);
    }

    /**
     * Creates a Calendar event with a Google Meet conference attached and
     * persists the result onto the interview. Throws on failure — callers
     * are expected to catch, log, and record meeting_status themselves
     * (matching this codebase's established best-effort pattern for
     * external integrations), since what "best effort" means differs by
     * caller (create vs. reschedule vs. cancel).
     */
    public function createMeeting(Interview $interview): Interview
    {
        $service = $this->calendarService();

        $event = new Event([
            'summary' => $this->summary($interview),
            'description' => $this->description($interview),
            'start' => new EventDateTime([
                'dateTime' => $interview->scheduled_at->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'end' => new EventDateTime([
                'dateTime' => $interview->scheduled_at->copy()
                    ->addMinutes((int) ($interview->duration_minutes ?: 30))
                    ->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'attendees' => $this->attendees($interview),
            'conferenceData' => new ConferenceData([
                'createRequest' => new CreateConferenceRequest([
                    'requestId' => (string) Str::uuid(),
                    'conferenceSolutionKey' => new ConferenceSolutionKey(['type' => 'hangoutsMeet']),
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

    /** Patches the existing Calendar event's time — used on reschedule so a new duplicate meeting isn't created. */
    public function updateMeetingTime(Interview $interview): Interview
    {
        if (!$interview->google_event_id) {
            return $this->createMeeting($interview);
        }

        $service = $this->calendarService();

        $event = new Event([
            'start' => new EventDateTime([
                'dateTime' => $interview->scheduled_at->toRfc3339String(),
                'timeZone' => config('app.timezone'),
            ]),
            'end' => new EventDateTime([
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

    /** Deletes the Calendar event on interview cancellation so it doesn't linger on attendees' calendars. */
    public function deleteMeeting(Interview $interview): void
    {
        if (!$interview->google_event_id) {
            return;
        }

        $service = $this->calendarService();
        $service->events->delete('primary', $interview->google_event_id, ['sendUpdates' => 'all']);

        $interview->forceFill([
            'google_event_id' => null,
            'meeting_status' => null,
        ])->save();
    }

    private function calendarService(): GoogleCalendar
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Google Calendar integration is not configured.');
        }

        $client = new GoogleClient();
        $client->setAuthConfig(config('services.google.service_account_path'));
        $client->setScopes(self::SCOPES);
        $client->setSubject(config('services.google.impersonate'));

        return new GoogleCalendar($client);
    }

    /** @return EventAttendee[] */
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

        return collect($emails)
            ->unique()
            ->map(fn ($email) => new EventAttendee(['email' => $email]))
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
