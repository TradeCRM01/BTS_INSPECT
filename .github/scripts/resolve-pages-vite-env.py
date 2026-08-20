#!/usr/bin/env python3
"""Resolve VITE_SUPABASE_* for a production Pages build without inventing keys.

Precedence:
  1. GitHub Actions secrets already in the environment
  2. Plaintext env vars on the existing Cloudflare Pages project
  3. The currently deployed https://bts-inspect.pages.dev client bundle
     (those values are already public in the browser JS)

Never prints secret values. Masks them in GitHub Actions logs.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from typing import Optional

PROJECT = "bts-inspect"
PAGES_ORIGIN = "https://bts-inspect.pages.dev"
USER_AGENT = "bts-inspect-pages-deploy/1.0"

URL_RE = re.compile(r"^https://[a-z0-9]+\.supabase\.co$")
JWT_RE = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
PAIR_RE = re.compile(
    r'https://([a-z0-9]+)\.supabase\.co["\']\s*,\s*["\'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["\']'
)


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def mask(value: str) -> None:
    if value and os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::add-mask::{value}")


def write_github_env(name: str, value: str) -> None:
    mask(value)
    path = os.environ.get("GITHUB_ENV")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(f"{name}<<__EOF__\n{value}\n__EOF__\n")


def is_blank(value: Optional[str]) -> bool:
    return value is None or value.strip() == ""


def b64url_json(part: str) -> dict:
    import base64

    pad = "=" * ((4 - len(part) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(part + pad))


def valid_pair(url: str, key: str) -> bool:
    if not URL_RE.match(url) or not JWT_RE.match(key):
        return False
    try:
        payload = b64url_json(key.split(".")[1])
    except Exception:
        return False
    return payload.get("iss") == "supabase" and payload.get("role") == "anon"


def from_github_secrets() -> Optional[tuple[str, str]]:
    url = os.environ.get("VITE_SUPABASE_URL", "").strip()
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()
    if is_blank(url) or is_blank(key):
        return None
    if not valid_pair(url, key):
        log("GitHub secrets VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are present but not a valid Supabase anon pair.")
        sys.exit(1)
    log("Using VITE_SUPABASE_* from GitHub Actions secrets.")
    return url, key


def http_json(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30, context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30, context=ssl.create_default_context()) as resp:
        return resp.read().decode("utf-8", "replace")


def env_var_value(node) -> Optional[str]:
    if node is None:
        return None
    if isinstance(node, str):
        return node.strip() or None
    if isinstance(node, dict):
        value = node.get("value")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def from_pages_project() -> Optional[tuple[str, str]]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if is_blank(token) or is_blank(account):
        log("Skipping Pages project env lookup (CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID not set).")
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{PROJECT}"
    try:
        body = http_json(
            url,
            {
                "Authorization": f"Bearer {token}",
                "User-Agent": USER_AGENT,
            },
        )
    except urllib.error.HTTPError as exc:
        log(f"Pages project lookup failed HTTP {exc.code}; will try the live bundle.")
        return None
    except Exception as exc:
        log(f"Pages project lookup failed ({type(exc).__name__}); will try the live bundle.")
        return None
    if not body.get("success"):
        log("Pages project lookup returned success=false; will try the live bundle.")
        return None
    configs = (body.get("result") or {}).get("deployment_configs") or {}
    production = configs.get("production") or {}
    env_vars = production.get("env_vars") or {}
    vite_url = env_var_value(env_vars.get("VITE_SUPABASE_URL"))
    vite_key = env_var_value(env_vars.get("VITE_SUPABASE_ANON_KEY"))
    if is_blank(vite_url) or is_blank(vite_key):
        log("Pages project has no readable plaintext VITE_SUPABASE_* values (missing or secret_text).")
        return None
    if not valid_pair(vite_url, vite_key):
        log("Pages project VITE_SUPABASE_* values are not a valid Supabase anon pair.")
        sys.exit(1)
    log("Using VITE_SUPABASE_* from the existing Cloudflare Pages project.")
    return vite_url, vite_key


def from_live_bundle() -> Optional[tuple[str, str]]:
    try:
        html = http_text(PAGES_ORIGIN + "/")
    except Exception as exc:
        log(f"Could not fetch {PAGES_ORIGIN} ({type(exc).__name__}).")
        return None
    assets = re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', html)
    if not assets:
        log("Live Pages HTML has no /assets/*.js files.")
        return None
    for path in assets:
        try:
            js = http_text(PAGES_ORIGIN + path)
        except Exception:
            continue
        match = PAIR_RE.search(js)
        if not match:
            continue
        url = f"https://{match.group(1)}.supabase.co"
        key = match.group(2)
        if valid_pair(url, key):
            log("Using VITE_SUPABASE_* already baked into the live bts-inspect.pages.dev bundle.")
            return url, key
    log("Live Pages bundle did not contain a valid baked VITE_SUPABASE_* pair.")
    return None


def main() -> int:
    pair = from_github_secrets() or from_pages_project() or from_live_bundle()
    if pair is None:
        log(
            "Cannot bake production login keys. Missing all of:\n"
            "  - GitHub secrets VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n"
            "  - Readable plaintext VITE_SUPABASE_* on Cloudflare Pages project `bts-inspect`\n"
            "  - A live https://bts-inspect.pages.dev bundle that already contains those keys\n"
            "Refusing to deploy a build that would brick login. Do not invent keys."
        )
        return 1
    url, key = pair
    write_github_env("VITE_SUPABASE_URL", url)
    write_github_env("VITE_SUPABASE_ANON_KEY", key)
    log("Vite production env is set (values masked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
