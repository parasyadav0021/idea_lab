FROM php:8.2-apache
RUN a2enmod rewrite
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/
RUN chmod -R 777 /var/www/html/
EXPOSE 80
