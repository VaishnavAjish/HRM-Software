<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\Setting;

/**
 * Sent when HR assigns a quiz to a candidate from the Assessment tab. Carries
 * the same candidate-facing link the UI's "copy link" action already builds
 * (FRONTEND_URL + /quiz/{access_token}) so the candidate doesn't depend on
 * HR remembering to paste it somewhere.
 */
class AssessmentInviteMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $roleTitle,
        public string $quizTitle,
        public int $durationMinutes,
        public int $passingScore,
        public ?string $quizUrl,
        public ?string $startsAt,
        public ?string $expiresAt,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Assessment invite: {$this->roleTitle}",
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
                        if (isset($tpl['id']) && $tpl['id'] === 'assessment') {
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
                ['{candidate_name}', '{quiz_title}', '{duration}', '{deadline}'],
                [$this->candidateName, $this->quizTitle, $this->durationMinutes . ' minutes', $this->deadlineFormatted ?? 'N/A'],
                $customBody
            );
        }

        return new Content(
            htmlString: view('emails.assessment-invite', [
                'candidateName' => $this->candidateName,
                'roleTitle' => $this->roleTitle,
                'quizTitle' => $this->quizTitle,
                'durationMinutes' => $this->durationMinutes,
                'passingScore' => $this->passingScore,
                'quizUrl' => $this->quizUrl,
                'startsAt' => $this->startsAt,
                'expiresAt' => $this->expiresAt,
            
                'customBody' => $customBody,
            ])->render(),
        );
    }
}
