FROM nginx:1.27-alpine
COPY client/ /usr/share/nginx/html
COPY nginx/client.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/ || exit 1
