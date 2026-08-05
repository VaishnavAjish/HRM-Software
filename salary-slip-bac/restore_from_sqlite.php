<?php

/**
 * Restore business data from the pre-Postgres SQLite snapshot.
 *
 *   php restore_from_sqlite.php --dry-run     inspect only, writes nothing
 *   php restore_from_sqlite.php --apply       perform the restore
 *
 * Copies only rows whose id does not already exist, so it is safe to re-run and
 * cannot overwrite anything created since. Only columns present in BOTH schemas
 * are copied; anything the current schema dropped is left behind rather than
 * failing the whole restore.
 */

$apply = in_array('--apply', $argv, true);

$env = [];
foreach (file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line[0] === '#' || !str_contains($line, '=')) {
        continue;
    }
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim($v, " \t\"'");
}

$dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s',
    $env['DB_HOST'] ?? '127.0.0.1', $env['DB_PORT'] ?? '5432', $env['DB_DATABASE'] ?? 'niss_hrms');

$pg = new PDO($dsn, $env['DB_USERNAME'] ?? 'postgres', $env['DB_PASSWORD'] ?? '');
$pg->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$backup = __DIR__ . '/database/database.sqlite.pre-postgres-20260803-180204.bak';
$lite = new PDO('sqlite:' . $backup);
$lite->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

echo "source : " . basename($backup) . PHP_EOL;
echo "target : " . ($env['DB_DATABASE'] ?? '?') . PHP_EOL;
echo "mode   : " . ($apply ? 'APPLY' : 'DRY RUN') . PHP_EOL . PHP_EOL;

// Parents before children: documents and attendances reference users.
$tables = ['users', 'documents', 'attendances'];
$totals = [];

/*
 * The seeded placeholder admin blocks the real one.
 *
 * DatabaseSeeder recreated admin@niss.pro at id 1 while the database was empty.
 * The genuine account is id 413 in the backup, and users.email is unique — so
 * the placeholder does not merely duplicate it, it prevents the restore from
 * inserting it at all. Removing the placeholder first lets the real row land
 * with its original id, which is what documents, attendances and every audit
 * reference point at.
 */
if ($apply) {
    $dupes = $pg->query('select id, email from users where id = 1')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($dupes as $d) {
        $inBackup = $lite->prepare('select count(*) from users where email = ?');
        $inBackup->execute([$d['email']]);
        if ((int) $inBackup->fetchColumn() > 0) {
            $pg->prepare('delete from users where id = ?')->execute([$d['id']]);
            echo 'removed seeded placeholder id=' . $d['id']
                . ' (' . $d['email'] . ') — the real account is in the backup' . PHP_EOL . PHP_EOL;
        }
    }
}

foreach ($tables as $table) {
    $pgCols = [];
    $q = $pg->prepare('select column_name from information_schema.columns
                        where table_schema = ? and table_name = ?');
    $q->execute(['public', $table]);
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $c) {
        $pgCols[] = $c;
    }

    if (!$pgCols) {
        echo "$table: not present in target, skipped" . PHP_EOL;
        continue;
    }

    $liteCols = [];
    foreach ($lite->query("PRAGMA table_info(\"$table\")") as $r) {
        $liteCols[] = $r['name'];
    }
    if (!$liteCols) {
        echo "$table: not present in backup, skipped" . PHP_EOL;
        continue;
    }

    $shared = array_values(array_intersect($pgCols, $liteCols));
    if (!in_array('id', $shared, true)) {
        echo "$table: no shared id column, skipped" . PHP_EOL;
        continue;
    }

    $existing = $pg->query("select id from \"$table\"")->fetchAll(PDO::FETCH_COLUMN);
    $existing = array_flip(array_map('strval', $existing));

    $rows = $lite->query('select ' . implode(',', array_map(fn ($c) => "\"$c\"", $shared)) . " from \"$table\"")
        ->fetchAll(PDO::FETCH_ASSOC);

    $toInsert = array_values(array_filter($rows, fn ($r) => !isset($existing[strval($r['id'])])));

    /*
     * Dangling user references become NULL rather than losing the row.
     *
     * documents and attendances point at users through created_by, updated_by,
     * deleted_by, user_id and marked_by. Many of those ids belong to the
     * tombstone accounts (24-253) that were deleted long before this restore,
     * so the references were already dangling in the original database — the
     * backup simply preserves them. Every one of these constraints is declared
     * ON DELETE SET NULL, so NULL is exactly what the schema says should happen
     * when the referenced user goes away. Dropping 38 documents to protect a
     * pointer that was already broken would be the wrong trade.
     */
    $fkColumns = [];
    $fkQuery = $pg->prepare("
        select a.attname
          from pg_constraint c
          join unnest(c.conkey) k on true
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
         where c.contype = 'f'
           and c.conrelid = ?::regclass
           and c.confrelid = 'users'::regclass");
    $fkQuery->execute([$table]);
    foreach ($fkQuery->fetchAll(PDO::FETCH_COLUMN) as $col) {
        if (in_array($col, $shared, true)) {
            $fkColumns[] = $col;
        }
    }

    if ($fkColumns) {
        $validIds = array_flip(array_map('strval',
            $pg->query('select id from users')->fetchAll(PDO::FETCH_COLUMN)));

        $nulled = 0;
        foreach ($toInsert as &$row) {
            foreach ($fkColumns as $col) {
                if ($row[$col] !== null && !isset($validIds[strval($row[$col])])) {
                    $row[$col] = null;
                    $nulled++;
                }
            }
        }
        unset($row);

        if ($nulled) {
            echo '   ' . $nulled . ' dangling user reference(s) across ['
                . implode(', ', $fkColumns) . '] set to NULL' . PHP_EOL;
        }
    }

    echo str_pad($table, 14) . 'backup=' . count($rows)
        . '  already present=' . (count($rows) - count($toInsert))
        . '  to insert=' . count($toInsert)
        . '  columns=' . count($shared) . PHP_EOL;

    $totals[$table] = count($toInsert);

    if (!$apply || !$toInsert) {
        continue;
    }

    $placeholders = '(' . implode(',', array_fill(0, count($shared), '?')) . ')';
    $sql = 'insert into "' . $table . '" (' . implode(',', array_map(fn ($c) => "\"$c\"", $shared)) . ')'
        . ' values ' . $placeholders . ' on conflict (id) do nothing';
    $stmt = $pg->prepare($sql);

    // A SAVEPOINT per row. Postgres aborts the entire transaction on the first
    // error — every later statement then fails with 25P02 regardless of whether
    // it would have worked. Without this, one duplicate email killed all 338
    // rows and the per-row try/catch reported 338 failures for one real fault.
    $pg->beginTransaction();
    $ok = 0;
    $failed = 0;
    $reported = 0;
    foreach ($toInsert as $row) {
        $pg->exec('SAVEPOINT row_restore');
        try {
            $stmt->execute(array_values($row));
            $pg->exec('RELEASE SAVEPOINT row_restore');
            $ok++;
        } catch (Throwable $e) {
            $pg->exec('ROLLBACK TO SAVEPOINT row_restore');
            $failed++;
            if ($reported < 5) {
                echo '   row id=' . $row['id'] . ' skipped: '
                    . substr(preg_replace('/\s+/', ' ', $e->getMessage()), 0, 120) . PHP_EOL;
                $reported++;
            }
        }
    }
    $pg->commit();

    echo '   inserted=' . $ok . ' failed=' . $failed . PHP_EOL;

    // Keep the identity sequence ahead of the restored ids.
    try {
        $pg->exec("select setval(pg_get_serial_sequence('$table','id'),
                   greatest((select coalesce(max(id),1) from \"$table\"), 1))");
    } catch (Throwable $e) {
        echo '   sequence not reset: ' . substr($e->getMessage(), 0, 80) . PHP_EOL;
    }
}

echo PHP_EOL . ($apply ? 'restore complete' : 'dry run only — re-run with --apply') . PHP_EOL;
