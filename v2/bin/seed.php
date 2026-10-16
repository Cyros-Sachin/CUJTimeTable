<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Core\Db;

Db::waitForConnection();
$pdo = Db::conn();

// Subject types are restricted to Core / Elective. Idempotent: safe on every boot,
// and migrates databases created with the older 8-type seed.
$pdo->exec("INSERT IGNORE INTO subject_types (name) VALUES ('Core'), ('Elective')");
$pdo->exec("UPDATE subject_types SET is_active = 1 WHERE name IN ('Core', 'Elective')");
$electiveId = (int) $pdo->query("SELECT id FROM subject_types WHERE name = 'Elective'")->fetch()['id'];
$pdo->prepare(
    "UPDATE exam_entries SET subject_type_id = :id
     WHERE subject_type_id NOT IN (SELECT id FROM subject_types WHERE name IN ('Core', 'Elective'))"
)->execute(['id' => $electiveId]);
$pdo->exec("DELETE FROM subject_types WHERE name NOT IN ('Core', 'Elective')");

$count = (int) $pdo->query('SELECT COUNT(*) AS c FROM users')->fetch()['c'];
if ($count > 0) {
    fwrite(STDOUT, "[seed] Users already present, skipping seed\n");
    exit(0);
}

$adminName = getenv('ADMIN_NAME') ?: 'Exam Cell Incharge';
$adminEmail = getenv('ADMIN_EMAIL') ?: 'examcell@cuj.local';
$adminPassword = getenv('ADMIN_PASSWORD') ?: 'ChangeMe#12345';

$hash = password_hash($adminPassword, PASSWORD_DEFAULT);
$stmt = $pdo->prepare(
    "INSERT INTO users (name, email, password_hash, role, department_id, must_change_password)
     VALUES (:name, :email, :hash, 'EXAM_CELL', NULL, 1)"
);
$stmt->execute(['name' => $adminName, 'email' => mb_strtolower($adminEmail), 'hash' => $hash]);
fwrite(STDOUT, "[seed] Seeded EXAM_CELL admin user ({$adminEmail})\n");

if ((getenv('SEED_DEMO_USERS') ?: 'true') === 'true') {
    $demoUsers = [
        ['code' => 'CMB', 'email' => 'coordinator.cmb@cuj.local', 'name' => 'CMB Coordinator'],
        ['code' => 'CSIT', 'email' => 'coordinator.csit@cuj.local', 'name' => 'CSIT Coordinator'],
    ];

    foreach ($demoUsers as $demo) {
        $deptStmt = $pdo->prepare('SELECT id FROM departments WHERE code = :code LIMIT 1');
        $deptStmt->execute(['code' => $demo['code']]);
        $dept = $deptStmt->fetch();
        if (!$dept) {
            continue;
        }
        $demoHash = password_hash($adminPassword, PASSWORD_DEFAULT);
        $insert = $pdo->prepare(
            "INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
             VALUES (:name, :email, :hash, 'DEPT_COORDINATOR', :deptId, 1)"
        );
        $insert->execute(['name' => $demo['name'], 'email' => $demo['email'], 'hash' => $demoHash, 'deptId' => $dept['id']]);
    }
    fwrite(STDOUT, "[seed] Seeded demo department coordinators\n");
}
