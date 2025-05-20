import pytest
from backend.models.scraper_config import ScraperConfig

def test_scraper_config_status_fields():
    # Test case 1: No status_selector in selectors, no status_mapping
    config1 = ScraperConfig(
        name="Test Config 1",
        url="http://example.com",
        selectors={"title": "h1"},
        status_mapping=None
    )
    assert "status_selector" not in config1.selectors
    assert config1.status_mapping is None

    # Test case 2: With status_selector in selectors
    config2 = ScraperConfig(
        name="Test Config 2",
        url="http://example.com",
        selectors={"title": "h1", "status_selector": "div.status"},
        status_mapping=None
    )
    assert config2.selectors["status_selector"] == "div.status"
    assert config2.status_mapping is None

    # Test case 3: With status_mapping
    config3 = ScraperConfig(
        name="Test Config 3",
        url="http://example.com",
        selectors={"title": "h1"},
        status_mapping={"Open": "active", "Closed": "closed"}
    )
    assert "status_selector" not in config3.selectors
    assert config3.status_mapping == {"Open": "active", "Closed": "closed"}

    # Test case 4: With both status_selector and status_mapping
    config4 = ScraperConfig(
        name="Test Config 4",
        url="http://example.com",
        selectors={"title": "h1", "status_selector": "span.status-text"},
        status_mapping={"Published": "active", "Finished": "closed"}
    )
    assert config4.selectors["status_selector"] == "span.status-text"
    assert config4.status_mapping == {"Published": "active", "Finished": "closed"}

    # Test default value of status_mapping
    config5 = ScraperConfig(
        name="Test Config 5",
        url="http://example.com",
        selectors={"title": "h1"}
    )
    assert config5.status_mapping is None
