# Deploy with Docker

The recommended way to run keyhall, on your own computer or on any server. The image is
published for `linux/amd64` and `linux/arm64` at `ghcr.io/luizgustavosaraiva/keyhall`.

Check the [requirements](../requirements.md) first. In short: Docker with the Compose plugin,
512 MB of RAM and 1 GB of disk.

- [1. Get the files](#1-get-the-files)
- [2. Generate the secrets](#2-generate-the-secrets)
- [3a. On your own computer](#3a-on-your-own-computer)
- [3b. On a server, with HTTPS from Caddy](#3b-on-a-server-with-https-from-caddy)
- [3c. Behind a proxy or platform you already have](#3c-behind-a-proxy-or-platform-you-already-have)
- [4. First sign-in](#4-first-sign-in)
- [Plain `docker run`](#plain-docker-run)

## 1. Get the files

```bash
mkdir keyhall && cd keyhall
base=https://raw.githubusercontent.com/luizgustavosaraiva/keyhall/main/deploy
curl -fsSLO $base/docker-compose.yml
curl -fsSL $base/.env.example -o .env
```

## 2. Generate the secrets

Open `.env` and fill in the two secrets, each with the output of `openssl rand -base64 32`:

```bash
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env
sed -i "s|^KEYHALL_ENCRYPTION_KEY=.*|KEYHALL_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
chmod 600 .env
```

> [!IMPORTANT]
> `KEYHALL_ENCRYPTION_KEY` encrypts every credential keyhall stores. Copy it to a password
> manager now. If you lose it, the database (and any backup of it) cannot be decrypted.

On macOS, use `sed -i ''` instead of `sed -i`, or just edit the file by hand.

## 3a. On your own computer

The default `docker-compose.yml` publishes keyhall on `http://localhost:8787` only, which is
all you need to use it from the same machine.

```bash
docker compose up -d
```

`KEYHALL_URL` stays `http://localhost:8787`. Browsers treat `localhost` as secure, and
OAuth providers that accept loopback callbacks work as well.

To reach it from other devices on your network, set `KEYHALL_BIND=0.0.0.0` and
`KEYHALL_URL=http://<machine-ip>:8787`. Do this only on a network you trust: without HTTPS,
passwords and tokens travel in clear text.

## 3b. On a server, with HTTPS from Caddy

For a VPS (or any machine reachable from the internet) that has nothing else serving HTTPS.
keyhall only speaks plain HTTP, so something has to add TLS in front of it.
[Caddy](https://caddyserver.com) does that with automatic Let's Encrypt certificates.

1. Create a DNS record (`A`, and `AAAA` if you have IPv6) for your domain, e.g.
   `keyhall.example.com`, pointing to the server.
2. Open ports **80** and **443** in the server's firewall. Port 80 is used by Let's Encrypt to
   validate the certificate and to redirect to HTTPS.
3. Use the Caddy variant instead of the default compose file:

   ```bash
   curl -fsSLO $base/caddy/docker-compose.yml
   curl -fsSLO $base/caddy/Caddyfile
   ```

4. In `.env`, set `KEYHALL_DOMAIN=keyhall.example.com` (`KEYHALL_URL` is ignored here).
5. Start it:

   ```bash
   docker compose up -d
   ```

Caddy gets the certificate within a few seconds and keyhall answers on
`https://keyhall.example.com`. Nothing besides Caddy is published to the internet.

> [!TIP]
> keyhall is a door to all your credentials. If only you and your machines use it, consider
> keeping it off the public internet: a VPN, a firewall allow-list, or the optional
> [Tailscale guide](tailscale.md).

## 3c. Behind a proxy or platform you already have

If the server already runs nginx, Traefik, a Cloudflare Tunnel, or a platform such as Dokploy,
Coolify, CapRover or Portainer, keep using it:

- Run the image with the default compose file (or the platform's "Docker image" option) and
  the variables from [configuration](../configuration.md).
- Route your domain to the container's port **8787**, with HTTPS.
- Set `KEYHALL_URL` (or `BETTER_AUTH_URL` and `TRUSTED_ORIGINS`) to the public HTTPS URL.
- Mount a persistent volume at `/data`.
- Don't buffer responses: MCP uses streaming HTTP. Traefik and Caddy stream by default; on
  nginx add `proxy_buffering off;` to the location.

Platforms that build from Git can also build the repository's `Dockerfile` directly.

## 4. First sign-in

```bash
docker compose logs keyhall
```

The log shows a line like:

```
keyhall: first-run setup pending. Setup code: ABCD-EFGH
```

Open keyhall in the browser, type that code, and create your account and organization. That
first account is the administrator, and sign-up closes for good afterwards. The code exists so
nobody else can claim an instance that is reachable before you finish the setup.

Continue with [Getting started](../getting-started.md).

## Plain `docker run`

If you prefer not to use Compose:

```bash
docker volume create keyhall-data
docker run -d --name keyhall --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v keyhall-data:/data \
  -e BETTER_AUTH_SECRET="<saved secret>" \
  -e KEYHALL_ENCRYPTION_KEY="<saved key>" \
  -e BETTER_AUTH_URL=http://localhost:8787 \
  -e TRUSTED_ORIGINS=http://localhost:8787 \
  ghcr.io/luizgustavosaraiva/keyhall:latest
```

Keep `BETTER_AUTH_SECRET` and `KEYHALL_ENCRYPTION_KEY` stable across restarts: a new
`BETTER_AUTH_SECRET` signs everyone out, and a new encryption key makes stored credentials
unreadable.

Next: [operations](../operations.md) (upgrades, backups, key rotation).
