#!/bin/sh
set -e

echo "Applying database migrations…"
prisma migrate deploy --schema=/app/prisma/schema.prisma

exec "$@"
