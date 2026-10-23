# Optional: private access with Tailscale

This guide is an extra. keyhall works the same with any of the setups in
[Deploy with Docker](docker.md) or [Run from source](from-source.md). Use it if you want keyhall
reachable **only from your own devices**, with valid HTTPS, without opening any port or owning a
domain.

[Tailscale](https://tailscale.com) puts keyhall on your private network (tailnet) under a name
like `https://keyhall.your-tailnet.ts.net`, with a certificate Tailscale manages for you. Devices
outside your tailnet can't reach it at all.

## Before you start

In the [Tailscale admin console](https://login.tailscale.com/admin):

1. **DNS:** enable **MagicDNS** and **HTTPS Certificates**.
2. **Settings → Keys:** generate an **auth key** (reusable is not needed; tag it if your policy
   uses tags).

Your tailnet name is shown on the DNS page (`your-tailnet.ts.net`).

## With Docker (sidecar container)

keyhall shares the network of a Tailscale container, and Tailscale Serve proxies HTTPS to it.

```bash
mkdir keyhall && cd keyhall
base=https://raw.githubusercontent.com/luizgustavosaraiva/keyhall/main/deploy
curl -fsSLO $base/tailscale/docker-compose.yml
mkdir config && curl -fsSL $base/tailscale/config/serve.json -o config/serve.json
curl -fsSL $base/.env.example -o .env
```

In `.env`:

- generate `BETTER_AUTH_SECRET` and `KEYHALL_ENCRYPTION_KEY` as in
  [Deploy with Docker → 2](docker.md#2-generate-the-secrets);
- `TS_AUTHKEY=` the key from the admin console;
- `KEYHALL_URL=https://keyhall.your-tailnet.ts.net` (change `keyhall` if you set `TS_HOSTNAME`).

```bash
docker compose up -d
docker compose logs keyhall    # setup code
```

Open `https://keyhall.your-tailnet.ts.net` from any device in your tailnet. The first request
can take a few seconds while Tailscale obtains the certificate.

`serve.json` keeps Funnel (public exposure) explicitly off. Don't turn it on: the whole point of
this setup is that keyhall is not on the internet.

## Without Docker

If keyhall already runs on a machine that has Tailscale installed (from source, or the default
compose file bound to `127.0.0.1:8787`):

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8787
```

Set `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` (or `KEYHALL_URL`) to
`https://<machine-name>.your-tailnet.ts.net` and restart keyhall. Use `tailscale serve`, never
`tailscale funnel`.

## Clients outside your tailnet

Hosted agents and bots that run in someone else's cloud can't reach a tailnet address unless
they can join your tailnet themselves. If you need those, use a public setup
([Caddy](docker.md#3b-on-a-server-with-https-from-caddy) or your own proxy) and rely on keyhall's
tokens, or restrict access with your [Tailscale access policy](https://tailscale.com/kb/1018/acls)
and tags for the devices that do join.

## OAuth and tailnet addresses

OAuth providers redirect your browser back to keyhall, so callbacks to a `ts.net` address work
as long as the browser you authorize from is in your tailnet. Some providers refuse bare
`http://100.x.y.z` addresses, which is one more reason to use the HTTPS name.
