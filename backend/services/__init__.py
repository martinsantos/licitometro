"""Services module for the Licitometro backend."""

from .scheduler_service import SchedulerService, get_scheduler_service
from .deduplication_service import DeduplicationService, get_deduplication_service
from .url_resolver import URLResolverService, get_url_resolver

__all__ = [
    "SchedulerService",
    "get_scheduler_service",
    "DeduplicationService",
    "get_deduplication_service",
    "URLResolverService",
    "get_url_resolver",
]
