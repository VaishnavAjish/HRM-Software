<?php

return [
    /*
     * Category weights for the resume-to-requisition match score. Must sum
     * to 100. Kept here (not hardcoded in the service) so they can be tuned
     * without a deploy, and so a future admin-settings screen has a single
     * place to read/write.
     *
     * There is deliberately no "education" category: Candidate has no
     * structured education field, and scoring against data that doesn't
     * exist would just be a fabricated number dressed up as a match.
     */
    'weights' => [
        'skills' => (int) env('ATS_WEIGHT_SKILLS', 45),
        'experience' => (int) env('ATS_WEIGHT_EXPERIENCE', 30),
        'keywords' => (int) env('ATS_WEIGHT_KEYWORDS', 25),
    ],

    // Common English stopwords excluded from keyword-overlap scoring so the
    // match isn't dominated by "the", "and", "with", etc.
    'stopwords' => [
        'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of', 'in', 'on',
        'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'this', 'that', 'these', 'those', 'it', 'its', 'we', 'you', 'they', 'he', 'she',
        'will', 'shall', 'should', 'would', 'can', 'could', 'may', 'might', 'must',
        'have', 'has', 'had', 'do', 'does', 'did', 'not', 'no', 'yes', 'so', 'than', 'into',
        'about', 'across', 'after', 'before', 'between', 'through', 'per', 'etc', 'role',
        'candidate', 'candidates', 'job', 'company', 'work', 'working', 'years', 'year',
        'experience', 'required', 'preferred', 'responsibilities', 'requirements', 'skills',
    ],

    // Minimum word length considered in keyword matching.
    'min_keyword_length' => 3,
];
