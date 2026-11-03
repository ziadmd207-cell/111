#!/bin/sh
set -eu

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=database_name="$POSTGRES_DB" <<'SQL'
\getenv app_password POSTGRES_APP_PASSWORD
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeus_app')
    THEN format('ALTER ROLE zeus_app WITH LOGIN PASSWORD %L', :'app_password')
  ELSE format('CREATE ROLE zeus_app LOGIN PASSWORD %L', :'app_password')
END \gexec
GRANT CONNECT, TEMPORARY ON DATABASE :"database_name" TO zeus_app;
GRANT USAGE, CREATE ON SCHEMA public TO zeus_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zeus_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zeus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zeus IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO zeus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zeus IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO zeus_app;
DO $$
DECLARE
  object_name text;
BEGIN
  FOR object_name IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO zeus_app', object_name);
  END LOOP;
  FOR object_name IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO zeus_app', object_name);
  END LOOP;
END;
$$;
SQL
