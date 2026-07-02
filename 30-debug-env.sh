#!/bin/sh
# Writes a small JSON file revealing whether the SQL_* env vars actually reached
# the running container. Values are never written — only presence and length —
# so it's safe to expose at /debug-env.json behind SSO.
set -e

id_len=$(printf '%s' "$SQL_IDENTITY" | wc -c | tr -d ' ')
secret_len=$(printf '%s' "$SQL_SECRET" | wc -c | tr -d ' ')
sql_env_names=$(env | awk -F= '/^SQL_/ {print $1}' | sort | tr '\n' ',' | sed 's/,$//')

cat > /usr/share/nginx/html/debug-env.json <<EOF
{
  "identity_present": $([ -n "$SQL_IDENTITY" ] && echo true || echo false),
  "identity_len": ${id_len},
  "secret_present": $([ -n "$SQL_SECRET" ] && echo true || echo false),
  "secret_len": ${secret_len},
  "sql_env_names": "${sql_env_names}",
  "envsubst_filter": "${NGINX_ENVSUBST_FILTER:-}"
}
EOF
