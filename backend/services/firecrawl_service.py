"""
Firecrawl API client — async wrapper for scraping via Firecrawl.
Used exclusively by the /lab endpoints. Never touches production data.
"""

import os
import time
import logging
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger("firecrawl_service")


class FirecrawlService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY", "")
        self.enabled = bool(self.api_key)
        self.base_url = "https://api.firecrawl.dev/v1"

    async def scrape(
        self,
        url: str,
        formats: List[str] = None,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        """Scrape a single URL via Firecrawl API.

        Returns: {success, timing_ms, data?, error?, summary?}
        """
        if not self.enabled:
            return {"success": False, "error": "FIRECRAWL_API_KEY not configured", "timing_ms": 0}

        if formats is None:
            formats = ["markdown", "html", "links"]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {"url": url, "formats": formats}

        start = time.time()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/scrape",
                    json=body,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as resp:
                    timing_ms = int((time.time() - start) * 1000)

                    if resp.status != 200:
                        text = await resp.text()
                        return {
                            "success": False,
                            "error": f"HTTP {resp.status}: {text[:500]}",
                            "timing_ms": timing_ms,
                        }

                    data = await resp.json()

                    if not data.get("success"):
                        return {
                            "success": False,
                            "error": data.get("error", "Unknown Firecrawl error"),
                            "timing_ms": timing_ms,
                        }

                    fc_data = data.get("data", {})
                    summary = {
                        "markdown_length": len(fc_data.get("markdown") or ""),
                        "html_length": len(fc_data.get("html") or ""),
                        "link_count": len(fc_data.get("links") or []),
                        "page_title": (fc_data.get("metadata") or {}).get("title", ""),
                    }

                    return {
                        "success": True,
                        "timing_ms": timing_ms,
                        "data": fc_data,
                        "summary": summary,
                    }

        except aiohttp.ClientError as e:
            return {
                "success": False,
                "error": f"Connection error: {e}",
                "timing_ms": int((time.time() - start) * 1000),
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"{type(e).__name__}: {str(e)[:300]}",
                "timing_ms": int((time.time() - start) * 1000),
            }
