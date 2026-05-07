# status

Feature-health dashboard for the services on
**https://ai-native.japaneast.cloudapp.azure.com/**.

This is intentionally **not** a generic uptime checker — that role is filled
by an external pinger (UptimeRobot) that hits the public URLs from outside
the VM. If the VM is down, you can't read this page anyway.

What this page answers instead: *the box is up, but is each service
actually doing what it's supposed to be doing?* Examples of things this
catches that liveness checks don't:

- ai-feed agent silently producing 0 digest files because cron stopped firing
- vpn-monitor collector running but failing to write to the DB
  (e.g. the missing `geo_cache` table — that exact bug was the
  motivating example for this project)
- Umami tracking script blocked by mixed-content / CORS / cert issues
- TLS cert about to expire
- Disk filling up before it actually fails

## Layout

```
status/
├── docker-compose.yml          web container, joins traffic-monitor's network
├── nginx/status.conf           reverse-proxy snippet at /status
└── web/
    ├── Dockerfile              multi-stage Node 22 / Next 14 standalone
    ├── package.json
    ├── next.config.js          basePath /status
    └── src/
        ├── app/
        │   ├── page.tsx        the rendered status page
        │   └── api/checks/     JSON endpoint (200 OK / 503 if any FAIL)
        ├── components/CheckRow.tsx
        ├── lib/
        │   ├── runner.ts       runs all checks in parallel with timeout
        │   ├── pg.ts           ad-hoc Postgres client
        │   └── checks/         one file per service group
        └── types/check.ts
```

## Checks (21 in v1)

| Group         | Probe                                             | Source           |
| ------------- | ------------------------------------------------- | ---------------- |
| host          | disk / memory / swap / load / uptime              | `/proc`, `df`    |
| host          | Postgres ping (`SELECT 1`)                        | pg over net      |
| host          | service catalog at `/`                            | https probe      |
| tls           | cert expiry days                                  | `tls.connect`    |
| ai-feed       | `/feed/login` HTTP 200                            | https probe      |
| ai-feed       | latest digest `<date>.json` mtime                 | mounted dir      |
| ai-feed       | today's three artifacts present (md+json+zh.json) | mounted dir      |
| ai-feed       | cron pulse (cron.log mtime)                       | mounted file     |
| vpn           | Hysteria pipeline freshness (`traffic_snapshot`)  | pg query         |
| vpn           | active connections (`online_snapshot`)            | pg query         |
| vpn           | dashboard `/vpn` HTTP 200                         | https probe      |
| ai-playground | `/chat` HTTP 200                                  | https probe      |
| umami         | `/umami` HTTP 200                                 | https probe      |
| umami         | `/umami/script.js` HTTP 200                       | https probe      |
| umami         | recent pageviews (last 1h)                        | pg query         |
| traffic       | GoAccess report mtime (cron is 5min)              | mounted file     |
| myblog        | `/myblog` HTTP 200                                | https probe      |

The Hysteria VPN server has no web UI; it's monitored indirectly by
checking that the vpn-monitor collector keeps writing fresh
`traffic_snapshot` rows. Stale rows = something in the
`Hysteria → collector → DB` pipeline is broken.

## HTTP semantics

- `/status` — HTML page, always 200 (so the page itself stays viewable)
- `/status/api/checks` — JSON, **HTTP 503 if any check is FAIL**, 200 otherwise

The 503 behavior makes `/status/api/checks` useful as an UptimeRobot
target: a 503 there means a feature is broken even though the host is up.

## Severity rules

| Status | When                                                                  |
| ------ | --------------------------------------------------------------------- |
| OK     | nominal                                                               |
| WARN   | informational alert; e.g. disk > 80%, cert < 14d, digest > 14h stale  |
| FAIL   | actionable; e.g. disk > 95%, cert < 3d, digest > 30h stale, http 5xx  |

Probes time out after 5s; on timeout or unhandled error, the check
emits FAIL rather than throwing — one bad probe never breaks the page.

## Bring it up

```bash
cd ~/src/status
cp .env.example .env   # fill in DB passwords from vpn-monitor and traffic-monitor
docker compose build
docker compose up -d
sudo cp nginx/status.conf /etc/nginx/snippets/
# add `include snippets/status.conf;` to the personal-site server block
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://ai-native.japaneast.cloudapp.azure.com/status   # → 200
```

## What's not here yet

- **Historical retention.** The page only shows current state. A small
  table of `(check_id, ts, status, detail)` rows would let you see
  "this fail started 3 hours ago" — about an hour of work.
- **Custom thresholds.** All thresholds are hard-coded. Could move to env.
- **systemd-unit checks.** Currently we infer `vpn-monitor-collector` and
  `hysteria-server` health from DB freshness. A direct check would need
  DBus access into the container or a host-side helper.
- **Cost / token tracking.** Separate concern, separate page.
