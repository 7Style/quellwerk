FROM nginx:1.25-alpine

RUN apk add --no-cache \
    bash \
    openssl \
    curl

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY error-pages/ /etc/nginx/error-pages/

RUN mkdir -p /etc/nginx/ssl /etc/nginx/conf.d

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
