"""Models for scraper execution tracking."""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ScraperRunBase(BaseModel):
    """Base model for scraper run tracking"""
    scraper_name: str = Field(..., description="Name of the scraper configuration")
    status: str = Field("pending", description="Status: pending, running, success, failed, partial")
    items_found: int = Field(0, description="Number of items found")
    items_saved: int = Field(0, description="Number of items saved to database")
    items_duplicated: int = Field(0, description="Number of items identified as duplicates")
    items_updated: int = Field(0, description="Number of existing items updated")
    urls_discovered: int = Field(0, description="Number of unique URLs discovered")
    urls_with_pliego: int = Field(0, description="Number of URLs with PLIEGO (COMPR.AR)")
    duration_seconds: Optional[float] = Field(None, description="Execution duration in seconds")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    errors: List[str] = Field(default=[], description="List of errors during execution")
    warnings: List[str] = Field(default=[], description="List of warnings during execution")
    logs: List[str] = Field(default=[], description="Execution logs")
    record_errors: List[Dict[str, Any]] = Field(default=[], description="Per-record errors during execution")
    duplicates_skipped: int = Field(0, description="Number of duplicates skipped during pipeline dedup")
    metadata: Dict[str, Any] = Field(default={}, description="Additional metadata")


class ScraperRunCreate(ScraperRunBase):
    """Model for creating a new scraper run record"""
    pass


class ScraperRunUpdate(BaseModel):
    """Model for updating a scraper run record"""
    status: Optional[str] = None
    items_found: Optional[int] = None
    items_saved: Optional[int] = None
    items_duplicated: Optional[int] = None
    items_updated: Optional[int] = None
    urls_discovered: Optional[int] = None
    urls_with_pliego: Optional[int] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None
    ended_at: Optional[datetime] = None
    errors: Optional[List[str]] = None
    warnings: Optional[List[str]] = None
    logs: Optional[List[str]] = None
    record_errors: Optional[List[Dict[str, Any]]] = None
    duplicates_skipped: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class ScraperRun(ScraperRunBase):
    """Model for a scraper run stored in the database"""
    id: Optional[str] = Field(default=None)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        orm_mode = True


class ScraperRunSummary(BaseModel):
    """Summary statistics for scraper runs"""
    scraper_name: str
    total_runs: int
    successful_runs: int
    failed_runs: int
    avg_items_per_run: float
    last_run_at: Optional[datetime]
    last_run_status: Optional[str]
    avg_duration_seconds: Optional[float]
