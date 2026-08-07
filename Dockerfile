FROM nginx:1.27-alpine

# Substitute only our SQL_* env vars plus the resolver list at startup,
# leaving nginx's own $variables alone
ENV NGINX_ENVSUBST_FILTER="^(SQL_|NGINX_LOCAL_RESOLVERS$)"

# Make the stock entrypoint export NGINX_LOCAL_RESOLVERS (the pod's
# /etc/resolv.conf nameservers) so the template's `resolver` directive can
# re-resolve the AWS gateway at request time. Without it nginx caches the
# gateway IP at startup and 503s when AWS rotates it (2026-08-07 outage).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Empty defaults so the container still boots if the deployer forgot to set the
# env vars — /api/sql just fails at AWS with a clear 400 instead of nginx
# crash-looping on an unknown variable. Override these at deploy time.
ENV SQL_IDENTITY=""
ENV SQL_SECRET=""

# Static dashboard
COPY index.html /usr/share/nginx/html/

# In-container config: the dashboard calls same-origin /api/sql.
# nginx attaches X-Identity / X-Internal-Secret server-side so the browser
# never sees the credential.
RUN printf "window.SQL_CONFIG = { url: '/api/sql', headers: {} };\n" \
    > /usr/share/nginx/html/config.js

# nginx config template — SQL_IDENTITY and SQL_SECRET are substituted from the
# container's runtime env vars by the official nginx image's entrypoint.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Diagnostic: writes /debug-env.json with env var lengths (no values) at startup.
COPY 30-debug-env.sh /docker-entrypoint.d/30-debug-env.sh
RUN chmod +x /docker-entrypoint.d/30-debug-env.sh

EXPOSE 80
