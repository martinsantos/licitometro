"""Test ComprasApps login — try multiple approaches systematically."""
import asyncio
import aiohttp
import json
from bs4 import BeautifulSoup

BASE = "https://comprasapps.mendoza.gov.ar/Compras/servlet"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


async def attempt(session, name, gx_raw, event_name, extra_fields=None, modify_gx=None, ajax=False):
    """Try a single login attempt."""
    gx = json.loads(gx_raw)
    if modify_gx:
        gx.update(modify_gx)
        gx_send = json.dumps(gx)
    else:
        gx_send = gx_raw

    form = {
        "GXState": gx_send,
        "_EventName": event_name,
        "_EventGridId": "",
        "_EventRowId": "",
        "vCONUSRPRF": "P101043",
        "vPASSWORD": "78760723",
    }
    if extra_fields:
        form.update(extra_fields)

    headers = {}
    if ajax:
        headers["GxAjaxRequest"] = "1"

    await asyncio.sleep(2)
    async with session.post(f"{BASE}/hccat004", data=form, headers=headers, allow_redirects=True) as resp:
        body = (await resp.read()).decode("utf-8", errors="replace")
        still_login = "Ingreso de Usuario" in body and "vCONUSRPRF" in body
        status = resp.status

        msg = ""
        if still_login and status == 200:
            s = BeautifulSoup(body, "html.parser")
            m = s.find("div", id="MENSAJE")
            msg = m.get_text(strip=True) if m else ""
            # Check GXState for state changes
            gx2 = json.loads(s.find("input", {"name": "GXState"})["value"])
            if gx2.get("MENSAJE_Caption"):
                msg = gx2["MENSAJE_Caption"]
            if gx2.get("T_CAMPASS_Visible") == "1":
                msg += " [CAMPASS visible!]"

        result = "FAIL" if still_login or status == 403 else "OK"
        print(f"  {name:40s} → {status} {result:4s} msg={msg!r}")
        return not still_login and status == 200


async def test():
    connector = aiohttp.TCPConnector(ssl=False)
    timeout = aiohttp.ClientTimeout(total=30)
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(
        connector=connector, timeout=timeout, cookie_jar=jar,
        headers={"User-Agent": UA}
    ) as session:

        tests = [
            ("ENTER (raw GXState)", "ENTER", None, None, False),
            ("EENTER. (raw GXState)", "EENTER.", None, None, False),
            ("ENTER + FocusControl=BOTONING", "ENTER", None, {"GX_FocusControl": "BOTONING", "_EventName": "ENTER"}, False),
            ("ENTER + all evtparms", "ENTER", {
                "vLOGINTOAUTH": "", "vEXISTEPERFIL": "", "vCIFRADO": "",
                "vTODAY": "", "vUSUNOM": "", "vPRVPADMINPROVE": "",
                "vPRVPADMINCAT": "", "vPRVPHABCAT": "", "vPRVPCONSULTA": "",
                "vEXISTEP": "", "vUSUCOD": "", "vPRVPLIEGOS": "",
                "vWIDTH": "1920", "vHEIGHT": "1080",
            }, {"GX_FocusControl": "BOTONING", "_EventName": "ENTER"}, False),
            ("ENTER AJAX + FocusControl", "ENTER", None, {"GX_FocusControl": "BOTONING", "_EventName": "ENTER"}, True),
        ]

        for name, evt, extras, gx_mod, ajax in tests:
            # Fresh login page for each attempt (fresh GXState + session)
            async with session.get(f"{BASE}/mpcatalogo", allow_redirects=True) as resp:
                html = (await resp.read()).decode("utf-8", errors="replace")
            gx_raw = BeautifulSoup(html, "html.parser").find("input", {"name": "GXState"})["value"]

            ok = await attempt(session, name, gx_raw, evt, extras, gx_mod, ajax)
            if ok:
                print("  >>> SUCCESS! <<<")
                break

asyncio.run(test())
