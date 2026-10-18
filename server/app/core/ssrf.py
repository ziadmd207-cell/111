"""SSRF guard for server-side URL fetching (media proxy, resources)."""
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal"}
# Cloud metadata + link-local
BLOCKED_PREFIXES = ("169.254.",)
METADATA_IPS = {"169.254.169.254", "fd00:ec2::254"}


def _host_is_blocked(host: str) -> bool:
    h = (host or "").lower().strip().rstrip(".")
    if not h:
        return True
    if h in BLOCKED_HOSTNAMES:
        return True
    if h.endswith(".local") or h.endswith(".internal"):
        return True
    if h.startswith(BLOCKED_PREFIXES):
        return True
    # literal IP check
    try:
        ip = ipaddress.ip_address(h.strip("[]"))
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return True
        if str(ip) in METADATA_IPS:
            return True
        return False
    except ValueError:
        pass
    return False


def resolve_blocked(host: str) -> bool:
    """DNS-resolve and block if any A/AAAA record is non-public. Fail closed."""
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return True
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return True
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return True
        if ip_str in METADATA_IPS:
            return True
    return False


def validate_fetch_url(url: str, *, allow_http: bool = False) -> str:
    """Return normalized URL if safe, else raise ValueError."""
    u = (url or "").strip()
    if len(u) > 2048:
        raise ValueError("URL too long")
    p = urlparse(u)
    if p.scheme not in ("https", "http"):
        raise ValueError("URL scheme not allowed")
    if p.scheme == "http" and not allow_http:
        raise ValueError("Plain HTTP not allowed")
    if _host_is_blocked(p.hostname or ""):
        raise ValueError("Host not allowed")
    if resolve_blocked(p.hostname or ""):
        raise ValueError("Host resolves to private address")
    if p.username or p.password:
        raise ValueError("Credentials in URL not allowed")
    return u
