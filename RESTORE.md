# Restoring studee-budee

The app keeps data in two places, and each one is backed up differently:

| Data | Where it lives | Backed up by |
|---|---|---|
| Everything in the database (projects, topics, sessions, notes, flashcards, settings, …) | `pgdata` volume | Nightly `pg_dump` into `./backups` (02:00 `TZ`, newest 14 kept), and **Settings → Export** |
| Uploaded files | `uploads` volume | **Settings → Export** (with "Include uploaded files"), or a manual tarball (see below) |

The commands below assume the default `POSTGRES_USER=studee` and `POSTGRES_DB=studee`. Use your values if you changed them. Run everything from the project directory.

## Before you start

- **Pick the dump.** Each dump is `backups/studee-YYYY-MM-DD_HHMMSS.dump`. Choose the newest one from *before* the problem happened. Anything written after that dump is lost.
- **Check the dump is readable:**

  ```sh
  docker run --rm -v "$PWD/backups":/b:ro postgres:16-alpine \
    pg_restore --list /b/studee-YYYY-MM-DD_HHMMSS.dump | grep -c "TABLE DATA"
  ```

  You should get a count of tables (around 33), not an error.
- **Take a dump of the current state first** if the database still runs, so you can go back if the restore makes things worse:

  ```sh
  docker compose exec backup /backup.sh now
  ```

## Case 1: the app runs, but the data is wrong

Use this when you deleted something by mistake, an import went wrong, and so on.

```sh
docker compose stop app
docker compose exec -T db pg_restore -U studee -d studee --clean --if-exists --no-owner \
  < backups/studee-YYYY-MM-DD_HHMMSS.dump
docker compose start app
```

`--clean --if-exists` drops the current tables and recreates them from the dump. The app is stopped during the restore, so nothing writes to the database halfway through.

## Case 2: the database is gone

Use this when the `pgdata` volume was deleted (for example by `docker compose down -v`) or you're setting up on a new machine.

1. On a new machine, copy over the project directory, your `.env` and the dump file(s) into `backups/`.
2. Start only the database. This creates a fresh, empty Postgres:

   ```sh
   docker compose up -d db
   ```

3. Restore the dump:

   ```sh
   docker compose exec -T db pg_restore -U studee -d studee --clean --if-exists --no-owner \
     < backups/studee-YYYY-MM-DD_HHMMSS.dump
   ```

4. Start everything else:

   ```sh
   docker compose up -d
   ```

The app runs `prisma migrate deploy` on start. If the dump is from an older version of the app, any newer migrations are applied on top automatically.

## Case 3: restoring from an export zip

**Settings → Export** makes `studee-budee-export-YYYY-MM-DD.zip` with all tables *and* uploaded files (if "Include uploaded files" was ticked). It's the only backup that covers both.

1. `docker compose up -d` (on a new machine, the database starts empty).
2. Sign in with `APP_PASSWORD`.
3. **Settings → Import**, choose the zip.

Import **replaces all data**. The file is checked before anything changes, and the database part runs in one transaction, so a failed import leaves your data as it was. Uploads that no file record points to after the import are deleted.

## Uploaded files

Nightly dumps **do not include uploads**. After restoring a dump alone, file records point at files that may no longer exist, and those files show as missing in the app.

To keep them safe, either export regularly with "Include uploaded files" ticked, or back up the volume by hand:

```sh
# Back up (writes backups/uploads-YYYY-MM-DD.tar.gz)
docker run --rm -v studee-budee_uploads:/data:ro -v "$PWD/backups":/b alpine \
  tar czf /b/uploads-$(date +%F).tar.gz -C /data .

# Restore (stop the app first)
docker compose stop app
docker run --rm -v studee-budee_uploads:/data -v "$PWD/backups":/b:ro alpine \
  tar xzpf /b/uploads-YYYY-MM-DD.tar.gz -C /data
docker compose start app
```

Restore the uploads tarball from the same day as the database dump, so file records and files match.

## Check the restore worked

```sh
docker compose ps                                    # app should be "healthy"
curl -s http://localhost:3000/api/health
docker compose exec db psql -U studee -d studee -c \
  'SELECT (SELECT count(*) FROM "Note") AS notes, (SELECT count(*) FROM "Session") AS sessions, (SELECT count(*) FROM "Topic") AS topics;'
```

Then open the app, check your projects, recent notes and a few uploaded files.

## Things backups don't protect against

- **Losing the disk.** `./backups` is on the same disk as the database volume. Copy dumps (and export zips) somewhere else regularly: another drive, a NAS or cloud storage.
- **Problems you notice late.** Only the newest 14 dumps are kept (`BACKUP_KEEP` in `docker-compose.yml`). If you find a problem after that, the dumps from before it are already gone.
- **The last few hours.** Dumps run once a day. Run `docker compose exec backup /backup.sh now` before anything risky (upgrades, imports, big clean-ups).
