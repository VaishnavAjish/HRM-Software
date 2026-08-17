<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\Setting;

/** Sent whenever an interview is scheduled or rescheduled — see InterviewController::store/reschedule. */
class InterviewScheduledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $roleTitle,
        public string $roundName,
        public string $scheduledAtFormatted,
        public int $durationMinutes,
        public string $mode,
        public ?string $meetingLink,
        public bool $isReschedule,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: ($this->isReschedule ? 'Interview rescheduled: ' : 'Interview scheduled: ') . $this->roleTitle,
        );
    }

    public function content(): Content
    {
        
        $customBody = null;
        try {
            $templatesJson = Setting::where('key', 'hr.mail_templates')->value('value');
            if ($templatesJson) {
                $templates = json_decode($templatesJson, true);
                if (is_array($templates)) {
                    foreach ($templates as $tpl) {
                        if (isset($tpl['id']) && $tpl['id'] === 'interview') {
                            $customBody = $tpl['body'] ?? null;
                            break;
                        }
                    }
                }
            }
        } catch (\Exception $e) {
            // Ignore
        }

        if ($customBody) {
            $customBody = str_replace(
                ['{candidate_name}', '{interview_title}', '{interview_date}', '{interview_time}', '{interview_link}', '{interview_notes}'],
                [$this->candidateName, $this->interviewTitle, $this->dateFormatted, $this->timeFormatted, $this->link ?? 'N/A', $this->notes ?? 'N/A'],
                $customBody
            );
        }

        return new Content(
            htmlString: view('emails.interview-scheduled', [
                'candidateName' => $this->candidateName,
                'roleTitle' => $this->roleTitle,
                'roundName' => $this->roundName,
                'scheduledAtFormatted' => $this->scheduledAtFormatted,
                'durationMinutes' => $this->durationMinutes,
                'mode' => $this->mode,
                'meetingLink' => $this->meetingLink,
                'isReschedule' => $this->isReschedule,
            
                'customBody' => $customBody,
            ])->render(),
        );
    }
}
