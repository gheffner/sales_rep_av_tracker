FROM nginx:1.27-alpine

# Only substitute our SQL_* env vars at startup, leave nginx's $variables alone
ENV NGINX_ENVSUBST_FILTER=^SQL_

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
