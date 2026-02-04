from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from bs4 import BeautifulSoup
import aiohttp
import logging
import html as html_escape

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

            # Return an auto-submitting form so the browser lands on the original domain.
            inputs = "\n".join(
                f'<input type="hidden" name="{html_escape.escape(k)}" value="{html_escape.escape(v)}" />'
                for k, v in fields.items()
            )
            html = f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Abrir proceso COMPR.AR</title>
  </head>
  <body>
    <form id="comprarForm" method="post" action="{html_escape.escape(list_url)}">
      {inputs}
      <noscript>
        <p>Presioná el botón para abrir el proceso en COMPR.AR.</p>
        <button type="submit">Abrir proceso</button>
      </noscript>
    </form>
    <script>document.getElementById('comprarForm').submit();</script>
  </body>
</html>"""
            return HTMLResponse(content=html)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error proxying proceso: {exc}")
        raise HTTPException(status_code=500, detail="Error interno al abrir el proceso.")
