"""Shared pagination utilities."""

from math import ceil


def paginated_response(items: list, total: int, page: int, per_page: int) -> dict:
    """Build standard paginated list response."""
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, ceil(total / per_page)) if per_page else 1,
    }
