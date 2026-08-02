#!/bin/sh
# Worker container entrypoint.
#
# Replaces the old CMD `npx prisma migrate deploy && node dist/index.js --serve & node dist/worker.js`:
# POSIX `&` binds looser than `&&`, so the migration was BACKGROUNDED and the email
# worker started against a possibly-unmigrated DB. `sh -c` was also PID 1 without
# signal forwarding, so SIGTERM never reached either node process and the worker's
# graceful shutdown (release of in-flight queue claims) was dead code under Docker.

set -e

# 1. Migrations must run to completion before anything starts.
npx prisma migrate deploy

# 2. Start the job poller (Maps scraping) and the email worker.
node dist/index.js --serve &
POLLER_PID=$!
node dist/worker.js &
WORKER_PID=$!

# 3. Forward TERM/INT to both children so their shutdown handlers run.
forward() {
    kill -TERM "$POLLER_PID" "$WORKER_PID" 2>/dev/null || true
}
trap forward TERM INT

# 4. Wait for both children. A trapped signal interrupts `wait`, so wait again —
#    the second round returns once the children have actually exited.
wait "$POLLER_PID" || true
wait "$WORKER_PID" || true
wait "$POLLER_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true
