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
      echo "upload_max_filesize=10M"; \
      echo "post_max_size=12M"; \
      echo "memory_limit=128M"; \
      echo "expose_php=Off"; \
      echo "display_errors=Off"; \
      echo "log_errors=On"; \
    } > /usr/local/etc/php/conf.d/ams.ini

# Never execute scripts or list files inside uploads. This replaces
# backend/uploads/.htaccess, which a mounted volume would hide.
RUN { \
      echo "<Directory /var/www/html>"; \
      echo "  Options -Indexes"; \
      echo "</Directory>"; \
      echo "<Directory /var/www/html/uploads>"; \
      echo "  php_admin_flag engine off"; \
      echo "  Options -Indexes"; \
      echo "</Directory>"; \
    } > /etc/apache2/conf-enabled/ams.conf

# The backend becomes the web root: /api/login.php, /uploads/..., config.php one level up.
COPY backend/ /var/www/html/
RUN mkdir -p /var/www/html/uploads && chown -R www-data:www-data /var/www/html/uploads

# Railway provides $PORT. Re-own the uploads folder at start because a freshly
# mounted volume belongs to root.
CMD sed -i "s/Listen 80/Listen ${PORT:-80}/" /etc/apache2/ports.conf \
 && sed -i "s/<VirtualHost \*:80>/<VirtualHost *:${PORT:-80}>/" /etc/apache2/sites-available/000-default.conf \
 && chown -R www-data:www-data /var/www/html/uploads \
 && exec apache2-foreground
