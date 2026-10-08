<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use PDO;

class AuditService
{
    public static function log(
        ?int $userId,
        string $action,
        ?string $entity = null,
        ?string $entityId = null,
        ?array $details = null,
        ?string $ip = null,
        ?PDO $conn = null,
    ): void {
        $pdo = $conn ?? Db::conn();
        $stmt = $pdo->prepare(
            'INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip)
             VALUES (:userId, :action, :entity, :entityId, :details, :ip)'
        );
        $stmt->execute([
            'userId' => $userId,
            'action' => $action,
            'entity' => $entity,
            'entityId' => $entityId,
            'details' => $details !== null ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
            'ip' => $ip,
        ]);
    }
}
