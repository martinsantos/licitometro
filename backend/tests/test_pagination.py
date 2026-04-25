"""Test the pagination helper."""

import math
from utils.pagination import paginated_response


class TestPaginatedResponse:
    """Test paginated_response helper."""

    def test_first_page(self):
        """First page returns correct shape."""
        items = [{"id": i} for i in range(10)]
        result = paginated_response(items, total=50, page=1, per_page=10)
        assert result["items"] == items
        assert result["total"] == 50
        assert result["page"] == 1
        assert result["per_page"] == 10
        assert result["pages"] == 5

    def test_last_page(self):
        """Last page with partial results."""
        items = [{"id": i} for i in range(3)]
        result = paginated_response(items, total=23, page=3, per_page=10)
        assert result["page"] == 3
        assert result["pages"] == 3

    def test_exact_fit(self):
        """Exact multiple of per_page."""
        items = [{"id": i} for i in range(20)]
        result = paginated_response(items, total=20, page=2, per_page=10)
        assert result["pages"] == 2

    def test_single_page(self):
        """Less items than per_page."""
        items = [{"id": i} for i in range(3)]
        result = paginated_response(items, total=3, page=1, per_page=10)
        assert result["pages"] == 1

    def test_empty(self):
        """Zero total returns 1 page."""
        result = paginated_response([], total=0, page=1, per_page=10)
        assert result["items"] == []
        assert result["total"] == 0
        assert result["pages"] == 1

    def test_zero_per_page(self):
        """per_page=0 returns 1 page (no division by zero)."""
        result = paginated_response([], total=0, page=1, per_page=0)
        assert result["pages"] == 1

    def test_many_pages(self):
        """100 items with per_page=1."""
        items = [{"id": 0}]
        result = paginated_response(items, total=100, page=42, per_page=1)
        assert result["pages"] == 100
        assert result["page"] == 42
