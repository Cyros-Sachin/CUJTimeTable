<?php

declare(strict_types=1);

// Applies db/migrations/*.sql in filename order, once each (tracked in `schema_migrations`).
// Migration files must be idempotent (INSERT IGNORE / INSERT ... SELECT ... WHERE NOT EXISTS), so
// data that already exists is left untouched and only missing rows are added.
// Runs automatically from docker/entrypoint.sh on every container start; safe to run by hand:
//   docker compose exec app php bin/migrate.php

require __DIR__ . '/../vendor/autoload.php';

use App\Core\Db;

Db::waitForConnection();
$pdo = Db::conn();

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (
       filename VARCHAR(190) PRIMARY KEY,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB'
);

$applied = $pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(__DIR__ . '/../db/migrations/*.sql') ?: [];
sort($files);

$ran = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (in_array($name, $applied, true)) {
        continue;
    }

    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    $statements = array_filter(array_map('trim', preg_split('/;\s*(?:\r?\n|$)/', $sql)));

    try {
        foreach ($statements as $statement) {
            $pdo->exec($statement);
        }
        $pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (:f)')->execute(['f' => $name]);
        fwrite(STDOUT, "[migrate] Applied {$name}\n");
        $ran++;
    } catch (Throwable $e) {
        fwrite(STDERR, "[migrate] FAILED {$name}: {$e->getMessage()}\n");
        exit(1);
    }
}

if ($ran === 0) {
    fwrite(STDOUT, "[migrate] Nothing to apply\n");
}
