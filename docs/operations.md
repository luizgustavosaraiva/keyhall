# Operations

Commands below assume the Docker setup, with the container named `keyhall`. From source, run
the same scripts from `server/` as shown in [Run from source](deploy/from-source.md#maintenance-scripts).

- [Versions and upgrades](#versions-and-upgrades)
- [Backup](#backup)
- [Restore](#restore)
- [Forgot the password](#forgot-the-password)
- [Rotating the encryption key](#rotating-the-encryption-key)
- [Health check and logs](#health-check-and-logs)

## Versions and upgrades

keyhall follows [Semantic Versioning](https://semver.org). Each release is a Git tag (`v0.1.0`),
a [GitHub release](https://github.com/luizgustavosaraiva/keyhall/releases) with notes taken from
the [changelog](../CHANGELOG.md), and a multi-arch image with three tags:

| Tag | Moves when | Use it for |
|---|---|---|
| `0.1.0` | never | Exact, reproducible installs. |
| `0.1` | a new `0.1.x` patch is released | Bug and security fixes only. **Recommended.** |
| `latest` | any release | Always on the newest version. |

While the version is `0.x`, a minor release (`0.1` → `0.2`) may change behavior; read its notes
before upgrading. From `1.0` on, breaking changes happen only in major releases.

The running version is shown in the panel (account menu) and at `/api/health`.

To upgrade:

```bash
# optional: pin the line you want in .env, e.g. KEYHALL_VERSION=0.2
docker compose pull
docker compose up -d
```

Database migrations run automatically on start. Take a [backup](#backup) before upgrading;
downgrading after a migration is not supported. To go back, restore the backup taken with the
older version.

## Backup

```bash
docker exec keyhall node dist/scripts/backup.js /data/backup.db
docker cp keyhall:/data/backup.db ./keyhall-$(date +%F).db
docker exec keyhall rm /data/backup.db
```

The copy is consistent even while keyhall is running. It contains everything: accounts,
connections, tokens, secrets and their history, all still encrypted.

> [!IMPORTANT]
> A backup is useless without `KEYHALL_ENCRYPTION_KEY`, and the key alone is useless without a
> backup. Store both, separately, outside the server.

To automate it, run the same commands from cron (or a systemd timer) on the host and send the
file to another machine or to object storage.

## Restore

```bash
docker compose stop keyhall
docker compose run --rm -v "$PWD/keyhall-2026-01-31.db:/restore.db:ro" keyhall \
  sh -c 'cp /restore.db /data/keyhall.db'
docker compose up -d
```

Start it with the **same** `KEYHALL_ENCRYPTION_KEY` that was in use when the backup was taken.
If the backup is from an older version, the migrations bring it up to date on start.

## Forgot the password

Signed in, change it from the account menu → **Change password**.

Locked out? Anyone with shell access to the server can set a new one. It also signs out every
session of that account:

```bash
docker exec -it keyhall node dist/scripts/reset-password.js you@example.com
```

## Rotating the encryption key

Do this if the key may have leaked, or as routine hygiene. keyhall re-encrypts every stored
credential and every secret version in a single transaction; if the current key is wrong,
nothing changes.

```bash
docker compose stop keyhall
docker compose run --rm \
  -e KEYHALL_NEW_ENCRYPTION_KEY="$(openssl rand -base64 32 | tee new-key.txt)" \
  keyhall node dist/scripts/rotate-key.js
```

Put the content of `new-key.txt` in `KEYHALL_ENCRYPTION_KEY` (in `.env`), save it in your
password manager, delete the file, and start again:

```bash
shred -u new-key.txt
docker compose up -d
```

Backups taken before the rotation still need the **old** key.

## Health check and logs

```bash
curl -s http://127.0.0.1:8787/api/health     # {"ok":true,"version":"0.1.0"}
docker compose logs -f keyhall
```

The image has a built-in Docker health check against the same endpoint, so `docker ps` shows
`healthy` once keyhall is up.
