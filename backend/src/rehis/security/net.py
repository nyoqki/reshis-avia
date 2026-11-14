from collections.abc import Sequence
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network, ip_address, ip_network

from starlette.requests import Request

Network = IPv4Network | IPv6Network


def parse_networks(values: Sequence[str]) -> tuple[IPv4Network | IPv6Network, ...]:
    """Parse single addresses and CIDR ranges; raises ValueError on an invalid entry."""
    return tuple(ip_network(value.strip(), strict=False) for value in values if value.strip())


def _parse_ip(value: str) -> IPv4Address | IPv6Address | None:
    try:
        return ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted(address: IPv4Address | IPv6Address, trusted: Sequence[Network]) -> bool:
    return any(address in network for network in trusted)


def client_ip(request: Request, trusted: Sequence[IPv4Network | IPv6Network]) -> str:
    """Return the client address, honouring X-Forwarded-For only from a trusted proxy peer."""
    if request.client is None:
        return "unknown"
    peer = request.client.host
    peer_ip = _parse_ip(peer)
    if peer_ip is None or not _is_trusted(peer_ip, trusted):
        return peer
    forwarded = ",".join(request.headers.getlist("x-forwarded-for"))
    for entry in reversed(forwarded.split(",")):
        address = _parse_ip(entry)
        if address is not None and not _is_trusted(address, trusted):
            return str(address)
    return peer
