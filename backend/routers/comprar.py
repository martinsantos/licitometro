from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from bs4 import BeautifulSoup
import aiohttp
import logging

router = APIRouter(
    prefix="/api/comprar",
    tags=["comprar"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger("comprar_proxy")


def _extract_hidden_fields(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    fields = {}
    for inp in soup.find_all("input"):
        name = inp.get("name")
        if name:
            fields[name] = inp.get("value", "")
    return fields


@router.get("/proceso", response_class=HTMLResponse)
async def comprar_proceso(
    list_url: str = Query(..., description="Lista Compras.aspx con qs"),
    target: str = Query(..., description="Postback target del proceso"),
):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(list_url) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=502, detail="No se pudo acceder a la lista de compras.")
                list_html = await resp.text()

            fields = _extract_hidden_fields(list_html)
            fields["__EVENTTARGET"] = target
            fields["__EVENTARGUMENT"] = ""
            async with session.post(list_url, data=fields) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=502, detail="No se pudo abrir el proceso solicitado.")
                detail_html = await resp.text()
                return HTMLResponse(content=detail_html)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error proxying proceso: {exc}")
        raise HTTPException(status_code=500, detail="Error interno al abrir el proceso.")
