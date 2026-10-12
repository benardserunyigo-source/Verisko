"""Verisko site health agent. Local TCP reachability only, not recording verification."""
import argparse
import concurrent.futures
import datetime
import ipaddress
import json
import os
import socket
import time
import urllib.request
from urllib.parse import urlparse


def load_config(filename):
    if os.name != "nt" and os.stat(filename).st_mode & 0o077:
        raise ValueError("Protect the config first: chmod 600 " + filename)
    with open(filename, encoding="utf-8") as source:
        config = json.load(source)
    url = urlparse(config["endpoint"])
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        raise ValueError("An HTTPS reporting endpoint is required")
    if not isinstance(config.get("token"), str) or not config["token"].startswith("vsk_box_"):
        raise ValueError("A site box key is required")
    if not 1 <= len(config.get("checks", [])) <= 64:
        raise ValueError("Configure 1 to 64 checks")
    networks = [ipaddress.ip_network(x) for x in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
    labels = set()
    for check in config["checks"]:
        ip = ipaddress.ip_address(check["ip"])
        key = (check["kind"], check["label"].lower())
        if not any(ip in net for net in networks) or not 1 <= int(check["port"]) <= 65535:
            raise ValueError("Only private IPv4 devices and valid ports are allowed")
        if check["kind"] not in ("camera", "recorder") or not 1 <= len(check["label"]) <= 60 or key in labels:
            raise ValueError("Invalid or duplicate device label")
        labels.add(key)
    return config


def check_device(device):
    ok = False
    try:
        with socket.create_connection((device["ip"], int(device["port"])), timeout=3):
            ok = True
    except OSError:
        pass
    return {"kind": device["kind"], "label": device["label"], "channel": device.get("channel"), "ok": ok}


def run_once(config):
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        checks = list(pool.map(check_device, config["checks"]))
    payload = {"type": "box", "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "checks": checks}
    req = urllib.request.Request(config["endpoint"], data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + config["token"]}, method="POST")
    # Do not follow redirects with a site credential.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as response:
            result = json.load(response)
            if not result.get("ok"):
                raise ValueError("Report refused")
        print("Report accepted", flush=True)
        return True
    except Exception:
        print("Report not accepted; retrying with fresh checks next minute", flush=True)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    settings = load_config(args.config)
    while True:
        started = time.monotonic()
        ok = run_once(settings)
        if args.once:
            raise SystemExit(0 if ok else 1)
        time.sleep(max(1, 60 - (time.monotonic() - started)))
