# Deploying Koraa

> **This is not how Koraa is currently deployed.** Production is split: the
> frontend runs on Vercel (project `koraa-web`, serving `koraa.cm`, `www`, and
> every `<slug>.koraa.cm` storefront), and only the Django API runs on the EC2
> host, from `infrastructure/docker/docker-compose.ec2.yml` with
> `infrastructure/nginx/koraa-api.conf`. That stack has no `web` container and no
> certbot container; its certificate comes from
> `infrastructure/aws/setup-letsencrypt.sh`.
>
> Do **not** follow the DNS table below as-is. It points `koraa.cm` and
> `*.koraa.cm` at a single host, which would take the Vercel frontend offline.
> This runbook describes the all-in-one host — one box serving the marketing
> site, the dashboard, every storefront and the API — which is still a supported
> shape and is what `docker-compose.prod.yml` builds. Read it for that.

Production runbook for the Docker Compose stack in
`infrastructure/docker/docker-compose.prod.yml`.

The stack is nine containers on one host: Postgres, Redis, a one-shot migration
job, gunicorn, a Celery worker, Celery beat, the Next.js server, nginx, and
certbot. Only nginx publishes ports; everything else talks over the compose
network.

Examples use `koraa.cm`, the real root domain. If you are deploying a different
one, substitute it throughout — and note that it also has to be replaced in
`infrastructure/nginx/koraa.conf`, which hardcodes it in `server_name`.

---

## 1. Prerequisites

**Host.** 2 vCPU / 4 GB RAM is a realistic floor: three gunicorn workers, a
Celery worker, Postgres, and a Next.js server share it, and the Next.js image
build alone wants ~2 GB. Docker Engine 24+ with the Compose v2 plugin
(`docker compose`, not the older `docker-compose`).

**DNS.** Three records, all pointing at the host's public IP:

| Type | Name | Purpose |
|---|---|---|
| `A` | `koraa.cm` | Marketing site, auth, dashboard |
| `A` | `*.koraa.cm` | Every merchant storefront (`<slug>.koraa.cm`) |
| `A` | `api.koraa.cm` | Django API and admin |

The wildcard is not optional — storefronts are addressed by subdomain, so
without it every merchant store is unreachable.

**DNS API token.** Storefront subdomains need a wildcard TLS certificate, and
Let's Encrypt only issues wildcards over the DNS-01 challenge. That means an API
token for whoever hosts your DNS; HTTP-01 cannot do it regardless of how nginx
is configured. Cloudflare is supported directly. See step 3 for the alternative.

Let DNS propagate before starting. `dig +short storefront-test.koraa.cm`
should return your IP.

---

## 2. Configuration

Two env files, both gitignored, neither committed:

```bash
cp .env.prod.example .env.prod
cp backend/.env.prod.example backend/.env.prod
```

Fill in every blank in both. `.env.prod.example` and
`backend/.env.prod.example` document each variable inline; the values that will
stop the stack from booting if wrong are:

- **`SECRET_KEY`** (`backend/.env.prod`) — generate with
  `python -c 'import secrets; print(secrets.token_urlsafe(64))'`. Production
  settings refuse to start on a short or `django-insecure-` key, because
  SimpleJWT signs access tokens with it and a guessable key mints tokens for any
  merchant.
- **`ALLOWED_HOSTS`** — must include `api.koraa.cm`, `.koraa.cm`, and the
  internal name `backend`. Production settings refuse to start while it is still
  the development default.
- **`POSTGRES_PASSWORD`** (`.env.prod`) — set before the first boot. It is only
  read when the data volume is initialised; changing it later requires an
  `ALTER USER` inside the running database.
- **`NEXT_PUBLIC_ROOT_DOMAIN`** and **`KORAA_ROOT_DOMAIN`** — must be the same
  domain. The first tells the Next.js proxy which hosts are storefront
  subdomains; the second drives the backend's CORS rules.

Compose reads `.env.prod` only when told to. Every command below passes
`--env-file .env.prod`; omitting it produces
`set POSTGRES_USER` style errors from the required-variable guards.

---

## 3. Issue the TLS certificate

Run this **before** the first `up`. nginx will not load a config whose
`ssl_certificate` file is missing, so without a certificate the stack fails at
boot.

```bash
./infrastructure/docker/init-letsencrypt.sh --staging   # prove DNS works first
./infrastructure/docker/init-letsencrypt.sh --force     # then the real one
```

The staging run is worth the two minutes: real certificates are rate-limited to
five per week per domain set, and a wrong DNS token burns a slot. Staging
certificates come from an untrusted root, so browsers reject them — that is
expected, and the reason for the second command.

This uses DNS-01 rather than a webroot challenge, so nothing needs to be
listening on port 80 yet. One certificate is issued covering `koraa.cm` and
`*.koraa.cm`, and copied into `infrastructure/docker/certs/` where nginx
reads it.

**If your DNS is not on Cloudflare**, leave `CLOUDFLARE_DNS_API_TOKEN` empty and
run `./infrastructure/docker/init-letsencrypt.sh --manual`. certbot prints two
TXT records for you to create by hand. Add **both** `_acme-challenge.koraa.cm`
records — one is for the apex, one for the wildcard, and replacing the first with
the second fails validation. Manual issuance cannot be renewed unattended, so
this becomes a calendar reminder every 60 days. Better options are a certbot DNS
plugin for your provider (add it to the `certbot` service image), or terminating
TLS at a proxy that handles it — Cloudflare's own proxy, or Caddy with on-demand
TLS.

---

## 4. First deploy

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

Expect 5–15 minutes on the first run; most of it is the Next.js production
build. Then, in order: Postgres and Redis pass their healthchecks, `migrate`
applies migrations and exits, and the four application containers start.

Migrations deliberately run as their own container rather than in an entrypoint,
so three gunicorn workers cannot race each other applying the same migration.
Static files are collected during the image build, so there is no
`collectstatic` step here.

Create the first admin user:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod exec backend python manage.py createsuperuser
```

It prompts for an email and full name — the user model authenticates by email,
not username.

### Verify

```bash
# All containers up; migrate shows Exited (0), which is correct
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod ps

curl -I https://koraa.cm                 # 200, marketing site
curl -I https://api.koraa.cm/api/schema/ # 200, API
curl -I http://koraa.cm                  # 301 to https
```

Then check in a browser that TLS is trusted on both `https://koraa.cm` and
some `https://anything.koraa.cm` — the second is what proves the wildcard
certificate is the one being served.

Django admin lives at **`https://api.koraa.cm/admin/`**. It is not reachable
on the apex: nginx routes everything except `/api/` and `/media/` there to
Next.js.

---

## 5. Updating

```bash
git pull
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

Migrations reapply automatically. Two things are easy to get wrong:

**`NEXT_PUBLIC_*` changes need `--build`.** Those values are inlined into the
browser bundle at build time, not read at runtime, so a restart keeps serving the
old ones. Everything in `backend/.env.prod`, by contrast, is read at runtime and
needs only a restart.

**The Celery containers do not build.** `celery_worker` and `celery_beat` reuse
the `koraa-backend:latest` tag that `backend` and `migrate` build, so they pick
up new code from the same rebuild — but only if `backend` was rebuilt in that
same command. Rebuilding just the Celery services is a no-op.

---

## 6. Certificate renewal

The `certbot` container checks twice a day and renews inside 30 days of expiry.
On success its deploy hook copies the new certificate into
`infrastructure/docker/certs/`, and nginx — which reloads every six hours —
picks it up. Both halves are needed: nginx reads the certificate once at startup
and would otherwise keep serving the expired one.

Confirm it works well before the 60-day mark:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod run --rm --entrypoint certbot certbot renew --dry-run
```

A dry run exercises the real DNS challenge without touching rate limits. If it
fails, the usual cause is an expired or rotated DNS API token; re-run
`init-letsencrypt.sh` to rewrite the credentials file inside the `letsencrypt`
volume.

---

## 7. Backups

Two volumes hold everything that cannot be rebuilt from git:

- **`postgres_data`** — every store, product, order, and payment record.
- **`media_files`** — uploaded product images, unless `R2_*` is configured in
  `backend/.env.prod`, in which case media lives in Cloudflare R2 and this
  volume is empty.

A third, **`letsencrypt`**, holds the certbot account key and renewal config.
Losing it is recoverable by re-issuing, but re-issuing is rate-limited to five
per week — so it is worth including.

```bash
# Database — logical dump, restorable into any Postgres 16
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --env-file .env.prod exec -T db \
  pg_dump -U koraa koraa_db | gzip > koraa-$(date +%F).sql.gz

# Media
docker run --rm -v koraa_media_files:/data:ro -v "$PWD:/backup" alpine \
  tar czf /backup/media-$(date +%F).tar.gz -C /data .
```

Volume names are prefixed with the compose project name, which defaults to the
directory containing the compose file — `docker volume ls` confirms the actual
names. Store the dumps off the host; a backup on the disk you are protecting
against is not a backup.

---

## 8. Operations

```bash
# Shorthand for the rest of this section
alias kc='docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env.prod'

kc logs -f backend             # gunicorn access + application logs
kc logs -f celery_worker       # background jobs
kc logs --tail=100 nginx
kc exec backend python manage.py shell
kc restart backend             # picks up backend/.env.prod changes
kc down                        # stop; volumes and data survive
```

`kc down -v` deletes the volumes, and with them the database. It is not the
command you want to stop the stack.

Payment and payout failures are logged at INFO under `apps.payments` and
`apps.orders` specifically so they can be found:

```bash
kc logs backend | grep apps.payments
```

---

## 9. Troubleshooting

**`nginx: [emerg] cannot load certificate "/etc/nginx/certs/fullchain.pem"`**
Step 3 has not been run, or it failed. Check that
`infrastructure/docker/certs/fullchain.pem` exists and is non-empty.

**`ImproperlyConfigured: ALLOWED_HOSTS is still the development default`**
`backend/.env.prod` is missing or was not read. Confirm the file exists at that
exact path — the compose `env_file` reference is relative to the compose file, so
a copy left at the repo root is silently ignored.

**`ImproperlyConfigured: SECRET_KEY is the insecure development default`**
Set a real key, at least 50 characters, without the `django-insecure-` prefix.

**A storefront subdomain shows the marketing site.**
`NEXT_PUBLIC_ROOT_DOMAIN` was empty or wrong in the image that is running.
Because it is a build-time value, fixing `.env.prod` alone changes nothing —
rebuild with `--build`.

**A storefront subdomain gives a TLS warning.**
The certificate covers the apex but not `*.koraa.cm`. Re-run step 3; the
bootstrap script requests both names.

**Infinite HTTPS redirect loop.**
Django is not seeing `X-Forwarded-Proto: https`. Expected when something in
front of nginx terminates TLS and drops the header — set
`SECURE_SSL_REDIRECT=False` in `backend/.env.prod` and let that proxy handle the
redirect.

**CORS errors from a custom merchant domain.**
Custom domains are not covered by the `*.koraa.cm` CORS regex. Either add
each one to `CORS_ALLOWED_ORIGINS`, or set `NEXT_PUBLIC_API_URL=/api/v1` and
rebuild, which routes API calls same-origin through nginx so CORS never applies.

**`migrate` exited non-zero and the app containers never started.**
By design — `backend` waits on `service_completed_successfully`. Read
`kc logs migrate`, fix the cause, and re-run `up -d`.

**Uploaded images 404.**
nginx serves `/media/` from the `media_files` volume, which is also mounted into
`backend`. If `R2_*` is partially configured, media is written to R2 but URLs
still point at local disk — the settings fall back to local storage rather than
failing at boot, so all four R2 values must be present or none.
