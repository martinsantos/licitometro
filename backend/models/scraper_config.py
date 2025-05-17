from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, HttpUrl


class ScraperConfigBase(BaseModel):
    """Base model for scraper configuration"""
    name: str = Field(..., description="Name of the scraper configuration")
    url: HttpUrl = Field(..., description="Base URL to scrape")
    active: bool = Field(True, description="Whether the scraper is active")
    schedule: str = Field("0 0 * * *", description="Cron schedule expression for when to run the scraper")
    # Selectors for different fields
    selectors: Dict[str, Any] = Field(
        ..., 
        description="CSS or XPath selectors for different fields"
    )
    pagination: Optional[Dict[str, Any]] = Field(
        None, 
        description="Pagination configuration"
    )
    headers: Optional[Dict[str, str]] = Field(
        default={}, 
        description="HTTP headers to use for requests"
    )
    cookies: Optional[Dict[str, str]] = Field(
        default={}, 
        description="Cookies to use for requests"
    )
    wait_time: float = Field(
        1.0, 
        description="Time to wait between requests in seconds"
    )
    max_items: Optional[int] = Field(
        None, 
        description="Maximum number of items to scrape"
    )
    source_type: str = Field(
        "website", 
        description="Type of source (website, api, file, etc.)"
    )
    document_extraction: Optional[Dict[str, Any]] = Field(
        None, 
        description="Configuration for document extraction"
    )


class ScraperConfigCreate(ScraperConfigBase):
    """Model for creating a new scraper configuration"""
    pass


class ScraperConfigUpdate(BaseModel):
    """Model for updating an existing scraper configuration"""
    name: Optional[str] = None
    url: Optional[HttpUrl] = None
    active: Optional[bool] = None
    schedule: Optional[str] = None
    selectors: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None
    cookies: Optional[Dict[str, str]] = None
    wait_time: Optional[float] = None
    max_items: Optional[int] = None
    source_type: Optional[str] = None
    document_extraction: Optional[Dict[str, Any]] = None


class ScraperConfig(ScraperConfigBase):
    """Model for a scraper configuration stored in the database"""
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_run: Optional[datetime] = None
    runs_count: int = Field(0, description="Number of times the scraper has been run")
    
    class Config:
        orm_mode = True
