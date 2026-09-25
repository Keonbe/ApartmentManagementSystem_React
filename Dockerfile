FROM php:8.2-apache

# mysqli (with mysqlnd) is the only extension not bundled in the base image;
# curl, openssl, fileinfo and json already are. ca-certificates lets
# create_checkout_session.php verify PayMongo's TLS certificate.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && docker-php-ext-install mysqli \
 && rm -rf /var/lib/apt/lists/*

# upload_max_filesize / post_max_size cannot be changed with ini_set() at
# runtime, so config.php's calls have no effect — set them here instead.
RUN { \
      echo "upload_max_filesize=25M"; \
      echo "post_max_size=32M"; \
      echo "memory_limit=128M"; \
      echo "expose_php=Off"; \
      echo "display_errors=Off"; \
      echo "log_errors=On"; \
    } > /usr/local/etc/php/conf.d/ams.ini

# Never execute scripts, list files, or serve raw reads inside uploads. This
# replaces backend/uploads/.htaccess, which a mounted volume would hide.
# Uploaded documents (gov IDs, NBI clearances, payment proofs, leases) are
# only ever read back through the authenticated download_file.php endpoint,
# never as a static file (H2/B-8).
RUN { \
      echo "<Directory /var/www/html>"; \
      echo "  Options -Indexes"; \
      echo "</Directory>"; \
      echo "<Directory /var/www/html/uploads>"; \
      echo "  php_admin_flag engine off"; \
      echo "  Options -Indexes"; \
      echo "  Require all denied"; \
      echo "</Directory>"; \
    } > /etc/apache2/conf-enabled/ams.conf

# The backend becomes the web root: /api/login.php, /uploads/..., config.php one level up.
COPY backend/ /var/www/html/
RUN mkdir -p /var/www/html/uploads && chown -R www-data:www-data /var/www/html/uploads

# mod_php requires the prefork MPM. On Railway the container has started with a
# second MPM enabled (AH00534 "More than one MPM loaded"), so drop the others both
# at build time and again at start.
RUN rm -f /etc/apache2/mods-enabled/mpm_event.* /etc/apache2/mods-enabled/mpm_worker.* \
 && a2enmod mpm_prefork

# Railway provides $PORT. The substitutions are anchored so a restarted container
# (same filesystem) doesn't turn "Listen 8080" into "Listen 808080". Re-own the
# uploads folder at start because a freshly mounted volume belongs to root.
# The environment check only reports to the deploy log (the database may not be
# up yet), so it never blocks the start; run it by hand to see a clean result.
CMD rm -f /etc/apache2/mods-enabled/mpm_event.* /etc/apache2/mods-enabled/mpm_worker.* \
 && sed -i "s/^Listen [0-9]*$/Listen ${PORT:-80}/" /etc/apache2/ports.conf \
 && sed -i "s/<VirtualHost \*:[0-9]*>/<VirtualHost *:${PORT:-80}>/" /etc/apache2/sites-available/000-default.conf \
 && chown -R www-data:www-data /var/www/html/uploads \
 && { su -s /bin/sh www-data -c "php /var/www/html/cron/check_environment.php" || true; } \
 && exec apache2-foreground
