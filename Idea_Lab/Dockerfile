FROM php:8.2-apache
RUN apt-get update && apt-get install -y sqlite3 libsqlite3-dev
RUN a2enmod rewrite
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/
EXPOSE 80
