# Run from source (without Docker)

keyhall is a regular Node.js application: one process that serves the API, the MCP endpoint
and the panel. Use this when you can't or don't want to run containers.

Requirements: Node.js 24+, pnpm 12, Git. See [requirements](../requirements.md).

## 1. Build a release

```bash
git clone --branch v0.1.0 https://github.com/luizgustavosaraiva/keyhall.git
cd keyhall
npm install -g pnpm@12
pnpm install --frozen-lockfile
pnpm build
```

Pick the latest tag from the [releases page](https://github.com/luizgustavosaraiva/keyhall/releases).
`main` also works but may contain unreleased changes.

## 2. Configure

```bash
cp .env.example .env
```

Fill in `BETTER_AUTH_SECRET` and `KEYHALL_ENCRYPTION_KEY` (each `openssl rand -base64 32`), and
set `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` to the address you'll open in the browser, e.g.
`http://127.0.0.1:8787`. All variables are described in [configuration](../configuration.md).

## 3. Run

```bash
pnpm start
```

The server reads `.env`, applies database migrations, and listens on `http://127.0.0.1:8787`.
The setup code for the first sign-in is printed in the output. Then follow
[Getting started](../getting-started.md).

The server must run from the `server/` directory (that's what `pnpm start` does): the panel is
served from `../web/dist` and the database defaults to `../data/keyhall.db`.

## Running it as a service (Linux, systemd)

```bash
sudo useradd --system --home /var/lib/keyhall --create-home keyhall
sudo git clone --branch v0.1.0 https://github.com/luizgustavosaraiva/keyhall.git /opt/keyhall
cd /opt/keyhall && sudo pnpm install --frozen-lockfile && sudo pnpm build
sudo install -d -m 700 -o keyhall /etc/keyhall
sudo install -m 600 -o keyhall /dev/null /etc/keyhall/keyhall.env
sudoedit /etc/keyhall/keyhall.env
```

`/etc/keyhall/keyhall.env`:

```bash
BETTER_AUTH_SECRET=...
KEYHALL_ENCRYPTION_KEY=...
BETTER_AUTH_URL=https://keyhall.example.com
TRUSTED_ORIGINS=https://keyhall.example.com
DATABASE_PATH=/var/lib/keyhall/keyhall.db
HOST=127.0.0.1
PORT=8787
```

Install the unit from [`deploy/systemd/keyhall.service`](../../deploy/systemd/keyhall.service)
and start it:

```bash
sudo cp deploy/systemd/keyhall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now keyhall
journalctl -u keyhall      # setup code
```

Put a reverse proxy with HTTPS in front of `127.0.0.1:8787` (Caddy, nginx…), as described in
[Deploy with Docker → 3c](docker.md#3c-behind-a-proxy-or-platform-you-already-have).

## Maintenance scripts

The operations in [operations](../operations.md) use `node dist/scripts/<name>.js` inside the
container. From source, run them from `server/` with the same environment:

```bash
cd server
node --env-file=../.env dist/scripts/backup.js ../keyhall-backup.db
node --env-file=../.env dist/scripts/reset-password.js you@example.com
```

With the systemd setup above, load the same file as the service user:

```bash
sudo -u keyhall sh -c 'set -a; . /etc/keyhall/keyhall.env; cd /opt/keyhall/server &&
  node dist/scripts/backup.js /var/lib/keyhall/backup.db'
```

## Upgrading

```bash
cd /opt/keyhall
sudo git fetch --tags && sudo git checkout v0.2.0
sudo pnpm install --frozen-lockfile && sudo pnpm build
sudo systemctl restart keyhall
```

Migrations run on start. Back up first (see [operations](../operations.md#backup)).
