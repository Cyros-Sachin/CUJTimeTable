#!/bin/sh
set -e
mkdir -p storage/tmp storage/pdf storage/uploads storage/sessions storage/branding
chown -R www-data:www-data storage
php bin/seed.php
exec "$@"
