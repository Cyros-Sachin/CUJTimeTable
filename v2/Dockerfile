FROM php:8.3-apache
# Devanagari PDF font: NOT fonts-noto-core. Verified against this exact mPDF
# version (8.3.1) that Noto Sans Devanagari — both the Debian package build and
# a fresh copy straight from Google's noto-fonts repo — breaks mPDF's OTL
# (OpenType Layout) shaping engine: the Debian build sends TTFontFile's GSUB
# parser into an infinite loop (memory-exhaustion fatal), and the current
# Google release throws "GPOS Lookup Type 5, Format 3 not supported". Lohit
# Devanagari (fonts-lohit-deva) uses simpler, older-style OpenType tables that
# mPDF's parser handles correctly, and still shapes conjuncts properly (see
# README's "Notes on this stack" section). The web UI still uses real Noto
# Sans Devanagari via Google Fonts — this substitution is PDF-generation-only.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libonig-dev libicu-dev unzip git fonts-lohit-deva \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql mysqli gd zip mbstring intl bcmath opcache \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-app.ini
WORKDIR /var/www/html
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts
COPY . .
RUN composer dump-autoload --optimize --no-dev \
 && mkdir -p resources/fonts storage/tmp storage/pdf storage/uploads storage/sessions storage/branding \
 && cp /usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf resources/fonts/LohitDevanagari-Regular.ttf \
 && test -f resources/fonts/LohitDevanagari-Regular.ttf \
 && chown -R www-data:www-data storage && sed -i 's/[[:cntrl:]]$//' docker/entrypoint.sh && chmod +x docker/entrypoint.sh
ENTRYPOINT ["/var/www/html/docker/entrypoint.sh"]
CMD ["apache2-foreground"]
