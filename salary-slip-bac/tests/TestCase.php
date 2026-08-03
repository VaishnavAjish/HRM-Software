<?php

namespace Tests;

use App\Services\Authorization\SchemaSupport;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // SchemaSupport memoises its column/table probes for the life of the
        // process, which is right for a request but wrong here: the suite
        // rebuilds the schema per test inside a single process, so a class that
        // migrates down would otherwise leave every later test believing the
        // enterprise columns are gone.
        SchemaSupport::flush();
    }
}
