"""Contracts for the Mendoza Core 3 critical source set."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class MendozaCoreContract:
    name: str
    source_id: str
    display_name: str
    expected_min_items: int
    sla_hours: int
    url_policy: str
    publication_date_min: float = 0.98
    opening_date_min: float = 0.70
    object_or_description_min: float = 0.98
    source_url_min: float = 0.98
    canonical_url_min: Optional[float] = 0.90
    direct_url_min: Optional[float] = 0.90
    documents_min: Optional[float] = 0.85
    run_evidence_min: float = 0.95


MENDOZA_CORE_CONTRACTS: tuple[MendozaCoreContract, ...] = (
    MendozaCoreContract(
        name="ComprasApps Mendoza",
        source_id="comprasapps_mendoza",
        display_name="ComprasApps Mendoza",
        expected_min_items=900,
        sla_hours=3,
        url_policy="direct_or_canonical",
        canonical_url_min=0.99,
        direct_url_min=None,
        documents_min=None,
        run_evidence_min=0.95,
    ),
    MendozaCoreContract(
        name="COMPR.AR Mendoza",
        source_id="comprar_mendoza",
        display_name="COMPR.AR Mendoza",
        expected_min_items=50,
        sla_hours=3,
        url_policy="direct",
        canonical_url_min=0.90,
        direct_url_min=0.90,
        documents_min=0.85,
        run_evidence_min=0.95,
    ),
    MendozaCoreContract(
        name="Boletin Oficial Mendoza",
        source_id="boletin_oficial_mendoza",
        display_name="Boletin Oficial Mendoza",
        expected_min_items=20,
        sla_hours=3,
        url_policy="boletin_pdf",
        opening_date_min=0.70,
        canonical_url_min=None,
        direct_url_min=None,
        documents_min=1.0,
        run_evidence_min=1.0,
    ),
)


CONTRACTS_BY_NAME = {contract.name: contract for contract in MENDOZA_CORE_CONTRACTS}
