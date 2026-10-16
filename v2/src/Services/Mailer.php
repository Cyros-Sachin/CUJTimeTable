<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Minimal dependency-free SMTP client (plain / STARTTLS / implicit SSL, AUTH LOGIN).
 * Configured from SMTP_HOST, SMTP_PORT, SMTP_SECURE (none|starttls|ssl),
 * SMTP_USER, SMTP_PASSWORD, MAIL_FROM. send() never throws: a mail outage must
 * not undo the action that triggered the mail.
 */
class Mailer
{
    public static function configured(): bool
    {
        return (getenv('SMTP_HOST') ?: '') !== '';
    }

    /** @return array{sent:bool,error:?string} */
    public static function send(string $to, string $subject, string $text, string $html): array
    {
        if (!self::configured()) {
            return ['sent' => false, 'error' => 'Email is not configured (SMTP_HOST is empty)'];
        }
        try {
            self::deliver($to, $subject, $text, $html);
            return ['sent' => true, 'error' => null];
        } catch (\Throwable $e) {
            error_log('[mailer] ' . $e->getMessage());
            return ['sent' => false, 'error' => $e->getMessage()];
        }
    }

    private static function deliver(string $to, string $subject, string $text, string $html): void
    {
        $host = (string) getenv('SMTP_HOST');
        $port = (int) (getenv('SMTP_PORT') ?: 587);
        $secure = strtolower((string) (getenv('SMTP_SECURE') ?: 'starttls'));
        $user = (string) (getenv('SMTP_USER') ?: '');
        $pass = (string) (getenv('SMTP_PASSWORD') ?: '');
        $from = (string) (getenv('MAIL_FROM') ?: 'CUJ Exam Cell <no-reply@cuj.local>');
        $fromAddr = preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : $from;

        $target = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $fp = @stream_socket_client($target, $errno, $errstr, 15);
        if (!$fp) {
            throw new \RuntimeException("Cannot connect to SMTP server {$host}:{$port} ({$errstr})");
        }
        stream_set_timeout($fp, 15);

        try {
            self::expect($fp, [220]);
            $ehloHost = gethostname() ?: 'localhost';
            self::command($fp, "EHLO {$ehloHost}", [250]);
            if ($secure === 'starttls') {
                self::command($fp, 'STARTTLS', [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('STARTTLS negotiation failed');
                }
                self::command($fp, "EHLO {$ehloHost}", [250]);
            }
            if ($user !== '') {
                self::command($fp, 'AUTH LOGIN', [334]);
                self::command($fp, base64_encode($user), [334]);
                self::command($fp, base64_encode($pass), [235]);
            }
            self::command($fp, "MAIL FROM:<{$fromAddr}>", [250]);
            self::command($fp, "RCPT TO:<{$to}>", [250, 251]);
            self::command($fp, 'DATA', [354]);

            $boundary = 'b' . bin2hex(random_bytes(8));
            $headers = [
                'Date: ' . date('r'),
                'From: ' . $from,
                'To: <' . $to . '>',
                'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
                'Message-ID: <' . bin2hex(random_bytes(8)) . '@cuj.local>',
                'MIME-Version: 1.0',
                "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
            ];
            $body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($text))
                . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($html))
                . "--{$boundary}--\r\n";
            // base64 output never contains a leading '.', so no dot-stuffing is needed.
            fwrite($fp, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.\r\n");
            self::expect($fp, [250]);
            self::command($fp, 'QUIT', [221]);
        } finally {
            fclose($fp);
        }
    }

    private static function command($fp, string $line, array $okCodes): string
    {
        fwrite($fp, $line . "\r\n");
        return self::expect($fp, $okCodes);
    }

    private static function expect($fp, array $okCodes): string
    {
        $reply = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $reply .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($reply, 0, 3);
        if (!in_array($code, $okCodes, true)) {
            throw new \RuntimeException('SMTP error: ' . trim($reply));
        }
        return $reply;
    }

    public static function passwordResetMessage(string $to, string $name, ?string $departmentName, string $tempPassword): array
    {
        $appUrl = rtrim((string) (getenv('APP_URL') ?: 'http://localhost:8090'), '/');
        $loginUrl = $appUrl . '/login';
        $dept = $departmentName ? " ({$departmentName})" : '';
        $e = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

        $text = implode("\n", [
            "Dear {$name}{$dept},",
            '',
            'Your password for the CUJ Exam Date Sheet system has been reset by the Exam Cell.',
            '',
            "Login: {$loginUrl}",
            "Email: {$to}",
            "Temporary password: {$tempPassword}",
            '',
            'You will be asked to choose a new password the first time you sign in.',
            '',
            'Regards,',
            'Examination Cell, Central University of Jammu',
        ]);
        $html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:520px">'
            . '<h2 style="color:#1e3a8a;margin:0 0 12px">Password reset</h2>'
            . '<p>Dear ' . $e($name . $dept) . ',</p>'
            . '<p>Your password for the <strong>CUJ Exam Date Sheet</strong> system has been reset by the Exam Cell.</p>'
            . '<table style="border-collapse:collapse;margin:12px 0">'
            . '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Login</td><td><a href="' . $e($loginUrl) . '">' . $e($loginUrl) . '</a></td></tr>'
            . '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td>' . $e($to) . '</td></tr>'
            . '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary password</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:15px">' . $e($tempPassword) . '</code></td></tr>'
            . '</table>'
            . '<p>You will be asked to choose a new password the first time you sign in.</p>'
            . '<p style="color:#6b7280">Examination Cell, Central University of Jammu</p></div>';

        return [
            'subject' => 'CUJ Exam Date Sheet – your password has been reset',
            'text' => $text,
            'html' => $html,
        ];
    }
}
