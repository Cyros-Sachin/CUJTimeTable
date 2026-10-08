<?php

declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;

class Db
{
    private static ?PDO $pdo = null;

    public static function conn(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = self::connect();
        }
        return self::$pdo;
    }

    private static function connect(): PDO
    {
        $host = getenv('DB_HOST') ?: 'db';
        $port = getenv('DB_PORT') ?: '3306';
        $name = getenv('DB_NAME') ?: 'cuj_datesheet';
        $user = getenv('DB_USER') ?: 'cuj_app';
        $pass = getenv('DB_PASSWORD') ?: '';

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET time_zone = '+05:30'");

        return $pdo;
    }

    /**
     * Wait for MySQL to accept connections. Used at container startup before
     * seeding — a cold `mysql:8.0` first-init can take 20-30s and the app
     * container otherwise crash-loops on the first few attempts.
     */
    public static function waitForConnection(int $maxAttempts = 30, int $delaySeconds = 2): void
    {
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                self::conn()->query('SELECT 1');
                return;
            } catch (PDOException $e) {
                fwrite(STDERR, "[seed] DB not ready (attempt {$attempt}/{$maxAttempts}): {$e->getMessage()}\n");
                self::$pdo = null;
                sleep($delaySeconds);
            }
        }
        throw new \RuntimeException('Could not connect to the database after multiple attempts');
    }

    /**
     * @template T
     * @param callable(PDO):T $fn
     * @return T
     */
    public static function transaction(callable $fn)
    {
        $pdo = self::conn();
        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
