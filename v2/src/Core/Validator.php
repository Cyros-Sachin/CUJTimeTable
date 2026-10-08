<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Small rule-based validator. Rules are given as pipe-free arrays of strings,
 * e.g. ['required', 'int', 'min:1', 'max:5000']. validate() returns the
 * cleaned/coerced data; throws a 422 HttpException with a `fields` map on
 * any failure, matching the API error contract used across every endpoint.
 */
class Validator
{
    /**
     * @param array<string,mixed> $data
     * @param array<string,array<int,string>> $rules
     * @return array<string,mixed> cleaned data (coerced per rule)
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        $clean = [];

        foreach ($rules as $field => $fieldRules) {
            $value = $data[$field] ?? null;
            $isPresent = $value !== null && $value !== '';
            $isRequired = in_array('required', $fieldRules, true);

            if (!$isPresent) {
                if ($isRequired) {
                    $errors[$field] = 'Required';
                }
                continue;
            }

            $fieldError = null;
            foreach ($fieldRules as $rule) {
                [$name, $param] = str_contains($rule, ':') ? explode(':', $rule, 2) : [$rule, null];

                switch ($name) {
                    case 'required':
                        break;
                    case 'string':
                        $value = trim((string) $value);
                        break;
                    case 'upper':
                        $value = strtoupper(trim((string) $value));
                        break;
                    case 'int':
                        if (!is_numeric($value) || (string) (int) $value !== (string) (int) round((float) $value)) {
                            $fieldError = 'Must be a whole number';
                        } else {
                            $value = (int) $value;
                        }
                        break;
                    case 'bool':
                        // Stored as 0/1, never a PHP bool: PDO's array-form execute()
                        // casts scalars to string before binding, and (string) false
                        // is '' — not '0' — which MySQL's strict mode rejects for a
                        // TINYINT column. An int sidesteps that entirely.
                        $value = in_array($value, [1, '1', true, 'true', 'on'], true) ? 1 : 0;
                        break;
                    case 'email':
                        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                            $fieldError = 'Must be a valid email address';
                        }
                        break;
                    case 'min':
                        if (is_string($value) && !is_numeric($value)) {
                            if (mb_strlen($value) < (int) $param) {
                                $fieldError = "Must be at least {$param} characters";
                            }
                        } elseif ((float) $value < (float) $param) {
                            $fieldError = "Must be at least {$param}";
                        }
                        break;
                    case 'max':
                        if (is_string($value) && !is_numeric($value)) {
                            if (mb_strlen($value) > (int) $param) {
                                $fieldError = "Must be at most {$param} characters";
                            }
                        } elseif ((float) $value > (float) $param) {
                            $fieldError = "Must be at most {$param}";
                        }
                        break;
                    case 'in':
                        $options = explode(',', (string) $param);
                        if (!in_array((string) $value, $options, true)) {
                            $fieldError = 'Must be one of: ' . implode(', ', $options);
                        }
                        break;
                    case 'regex':
                        if (!preg_match($param, (string) $value)) {
                            $fieldError = 'Invalid format';
                        }
                        break;
                    case 'date':
                        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $value)) {
                            $fieldError = 'Must be a date (YYYY-MM-DD)';
                        }
                        break;
                }

                if ($fieldError !== null) {
                    break;
                }
            }

            if ($fieldError !== null) {
                $errors[$field] = $fieldError;
            } else {
                $clean[$field] = $value;
            }
        }

        if ($errors) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', $errors);
        }

        return $clean;
    }
}
