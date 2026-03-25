"""
Firecrawl API client — async wrapper for scraping via Firecrawl.
Used exclusively by the /lab endpoints. Never touches production data.
"""

import asyncio
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
        actions: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Scrape a single URL via Firecrawl API.

        actions: optional browser actions to execute before scraping, e.g.:
          [{"type": "wait", "milliseconds": 2000},
           {"type": "click", "selector": "#btnBuscar"},
           {"type": "wait", "milliseconds": 3000}]

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
        body: Dict[str, Any] = {"url": url, "formats": formats}
        if actions:
            body["actions"] = actions

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

    async def extract(
        self,
        urls: List[str],
        prompt: str,
        schema: Optional[Dict[str, Any]] = None,
        timeout: int = 120,
        poll_interval: int = 3,
    ) -> Dict[str, Any]:
        """Extract structured data from URLs via Firecrawl /v2/extract (LLM).

        This is async — submits a job, then polls for completion.
        Returns: {success, timing_ms, data?, error?}
        """
        if not self.enabled:
            return {"success": False, "error": "FIRECRAWL_API_KEY not configured", "timing_ms": 0}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body: Dict[str, Any] = {"urls": urls, "prompt": prompt}
        if schema:
            body["schema"] = schema

        start = time.time()
        try:
            async with aiohttp.ClientSession() as session:
                # 1. Submit extraction job
                async with session.post(
                    "https://api.firecrawl.dev/v2/extract",
                    json=body,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        return {
                            "success": False,
                            "error": f"HTTP {resp.status}: {text[:500]}",
                            "timing_ms": int((time.time() - start) * 1000),
                        }
                    result = await resp.json()

                job_id = result.get("id")
                if not job_id:
                    return {
                        "success": False,
                        "error": f"No job ID returned: {str(result)[:300]}",
                        "timing_ms": int((time.time() - start) * 1000),
                    }

                logger.info(f"Firecrawl extract job submitted: {job_id}")

                # 2. Poll for completion
                max_polls = timeout // poll_interval
                for attempt in range(max_polls):
                    await asyncio.sleep(poll_interval)
                    async with session.get(
                        f"https://api.firecrawl.dev/v2/extract/{job_id}",
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        data = await resp.json()
                        status = data.get("status", "unknown")

                        if status == "completed":
                            timing_ms = int((time.time() - start) * 1000)
                            return {
                                "success": True,
                                "timing_ms": timing_ms,
                                "data": data.get("data", {}),
                                "status": status,
                            }

                        if status in ("failed", "cancelled"):
                            return {
                                "success": False,
                                "error": data.get("error", f"Job {status}"),
                                "timing_ms": int((time.time() - start) * 1000),
                                "status": status,
                            }

                return {
                    "success": False,
                    "error": f"Polling timeout ({timeout}s)",
                    "timing_ms": int((time.time() - start) * 1000),
                }

        except Exception as e:
            return {
                "success": False,
                "error": f"{type(e).__name__}: {str(e)[:300]}",
                "timing_ms": int((time.time() - start) * 1000),
            }
