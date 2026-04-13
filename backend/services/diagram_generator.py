"""SVG Diagram Generator — Professional technical diagrams for offer PDFs.

Generates inline SVG strings that Chromium renders as perfect vectors in PDF.
No external libraries — pure SVG f-strings with the PDF color theme.

Catalog:
1. Gantt / Cronograma       - Timeline with colored bars
2. Architecture             - 3-layer system diagram
3. Org Chart                - Team hierarchy
4. Process Flow             - Step-by-step workflow
5. Network Topology         - Nodes + connections
6. Risk Matrix              - Probability × Impact quadrant
7. Tech Stack               - Technology boxes
8. Floor Plan / Layout      - Equipment distribution
9. Datasheet                - Product specifications
10. Technical Schema        - Engineering flow
"""

import re
from typing import List, Dict, Optional, Tuple

# ─── Color Palette (matches PDF theme) ───
BLUE = "#1d4ed8"
BLUE_LIGHT = "#dbeafe"
BLUE_BG = "#eff6ff"
INDIGO = "#6366f1"
GREEN = "#059669"
GREEN_LIGHT = "#d1fae5"
AMBER = "#d97706"
AMBER_LIGHT = "#fef3c7"
RED = "#dc2626"
RED_LIGHT = "#fee2e2"
CYAN = "#0891b2"
PINK = "#db2777"
SLATE = "#475569"
GRAY = "#6b7280"
GRAY_LIGHT = "#f1f5f9"
WHITE = "#ffffff"
DARK = "#1f2937"

PALETTE = [BLUE, GREEN, AMBER, INDIGO, CYAN, PINK, RED, "#8b5cf6", "#14b8a6", "#f59e0b"]

FONT = "Inter, -apple-system, sans-serif"


def _esc(text: str) -> str:
    """XML-escape text for SVG."""
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _truncate(text: str, max_len: int = 30) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len - 1] + "…"


# ═══════════════════════════════════════════════════════════════════
# 1. GANTT CHART
# ═══════════════════════════════════════════════════════════════════

def generate_gantt_svg(etapas: List[dict], title: str = "Cronograma del Proyecto") -> str:
    """Generate a Gantt chart SVG from parsed etapas.

    Each etapa: {name: str, start: int, end: int, color: str (optional)}
    """
    if not etapas:
        return ""

    W, LABEL_W, BAR_H, GAP = 520, 160, 28, 6
    max_day = max(e.get("end", 30) for e in etapas) or 30
    bar_area = W - LABEL_W - 20
    H = len(etapas) * (BAR_H + GAP) + 70

    rows = ""
    for i, e in enumerate(etapas):
        y = 45 + i * (BAR_H + GAP)
        s = e.get("start", 0)
        end = e.get("end", max_day)
        color = e.get("color", PALETTE[i % len(PALETTE)])
        x = LABEL_W + (s / max_day) * bar_area
        w = max(((end - s) / max_day) * bar_area, 8)
        name = _esc(_truncate(e.get("name", f"Etapa {i+1}"), 22))
        days_label = f"Días {s}-{end}"

        # Alternating row bg
        if i % 2 == 0:
            rows += f'<rect x="0" y="{y-2}" width="{W}" height="{BAR_H+GAP}" fill="{GRAY_LIGHT}" rx="0"/>'

        # Label
        rows += f'<text x="{LABEL_W - 8}" y="{y + BAR_H//2 + 4}" text-anchor="end" font-size="8" font-family="{FONT}" fill="{DARK}" font-weight="500">{name}</text>'
        # Bar
        rows += f'<rect x="{x}" y="{y}" width="{w}" height="{BAR_H}" rx="4" fill="{color}" opacity="0.85"/>'
        # Days label inside bar
        if w > 50:
            rows += f'<text x="{x + w/2}" y="{y + BAR_H//2 + 4}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{WHITE}" font-weight="600">{days_label}</text>'

    # Grid lines
    grid = ""
    step = max(1, max_day // 6)
    for d in range(0, max_day + 1, step):
        gx = LABEL_W + (d / max_day) * bar_area
        grid += f'<line x1="{gx}" y1="35" x2="{gx}" y2="{H - 20}" stroke="#e5e7eb" stroke-width="0.5"/>'
        grid += f'<text x="{gx}" y="{H - 8}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{GRAY}">Día {d}</text>'

    # Header line
    header = f'<line x1="{LABEL_W}" y1="38" x2="{W}" y2="38" stroke="{BLUE}" stroke-width="1.5"/>'
    title_svg = f'<text x="{W//2}" y="18" text-anchor="middle" font-size="10" font-family="{FONT}" fill="{DARK}" font-weight="700">{_esc(title)}</text>'
    subtitle = f'<text x="{W//2}" y="30" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{GRAY}">Duración total: {max_day} días</text>'

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{title_svg}{subtitle}{header}{grid}{rows}</svg>'


# ═══════════════════════════════════════════════════════════════════
# 2. ARCHITECTURE DIAGRAM
# ═══════════════════════════════════════════════════════════════════

def generate_architecture_svg(components: List[str] = None, title: str = "Arquitectura del Sistema") -> str:
    """Generate a 3-layer architecture diagram."""
    if not components:
        components = ["Aplicación Web", "API REST", "Base de Datos"]

    W, H = 520, 320
    layers = [
        ("CAPA DE PRESENTACIÓN", BLUE, ["Interfaz Web", "Dashboard", "Reportes"]),
        ("CAPA DE LÓGICA", INDIGO, ["API REST", "Procesamiento", "Autenticación"]),
        ("CAPA DE DATOS", GREEN, ["Base de Datos", "Almacenamiento", "Backups"]),
    ]

    # Map components to layers
    tech_map = {
        "react": 0, "angular": 0, "vue": 0, "frontend": 0, "web": 0, "dashboard": 0, "ui": 0, "ux": 0,
        "api": 1, "fastapi": 1, "python": 1, "backend": 1, "node": 1, "java": 1, "microservicio": 1, "servicio": 1,
        "mongodb": 2, "postgresql": 2, "mysql": 2, "redis": 2, "base de datos": 2, "storage": 2, "s3": 2, "docker": 2,
    }

    if components:
        for comp in components:
            comp_lower = comp.lower()
            for key, layer_idx in tech_map.items():
                if key in comp_lower:
                    layers[layer_idx] = (layers[layer_idx][0], layers[layer_idx][1], [comp] + [x for x in layers[layer_idx][2] if x != comp][:2])
                    break

    svg = f'<text x="{W//2}" y="18" text-anchor="middle" font-size="10" font-family="{FONT}" fill="{DARK}" font-weight="700">{_esc(title)}</text>'

    layer_h = 70
    start_y = 40

    for i, (label, color, items) in enumerate(layers):
        y = start_y + i * (layer_h + 20)

        # Layer background
        svg += f'<rect x="20" y="{y}" width="{W-40}" height="{layer_h}" rx="8" fill="{color}" opacity="0.08" stroke="{color}" stroke-width="1.5"/>'

        # Layer label
        svg += f'<text x="35" y="{y + 16}" font-size="7" font-family="{FONT}" fill="{color}" font-weight="700" letter-spacing="0.1em">{_esc(label)}</text>'

        # Component boxes
        box_w = (W - 80) // len(items) - 10
        for j, item in enumerate(items[:3]):
            bx = 35 + j * (box_w + 10)
            by = y + 25
            svg += f'<rect x="{bx}" y="{by}" width="{box_w}" height="{layer_h - 35}" rx="6" fill="{color}" opacity="0.9"/>'
            svg += f'<text x="{bx + box_w//2}" y="{by + (layer_h-35)//2 + 4}" text-anchor="middle" font-size="8" font-family="{FONT}" fill="{WHITE}" font-weight="600">{_esc(_truncate(item, 20))}</text>'

        # Arrow to next layer
        if i < len(layers) - 1:
            ay = y + layer_h + 3
            svg += f'<line x1="{W//2}" y1="{ay}" x2="{W//2}" y2="{ay + 14}" stroke="{GRAY}" stroke-width="1.5" marker-end="url(#arrowhead)"/>'

    # Arrowhead marker
    svg = f'<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{GRAY}"/></marker></defs>' + svg

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{svg}</svg>'


# ═══════════════════════════════════════════════════════════════════
# 3. ORG CHART
# ═══════════════════════════════════════════════════════════════════

def generate_org_chart_svg(roles: List[dict] = None, title: str = "Organigrama del Equipo") -> str:
    """Generate org chart from roles: [{role, dedicacion}]."""
    if not roles:
        roles = [
            {"role": "Líder de Proyecto", "dedicacion": "100%"},
            {"role": "Arquitecto", "dedicacion": "50%"},
            {"role": "Desarrollador Sr.", "dedicacion": "100%"},
            {"role": "Analista QA", "dedicacion": "75%"},
        ]

    W = 520
    leader = roles[0] if roles else {"role": "PM", "dedicacion": "100%"}
    team = roles[1:] if len(roles) > 1 else []

    # Adaptive layout: max 3 cols to avoid clipping
    cols = min(len(team), 3) or 1
    rows_count = (len(team) + cols - 1) // cols

    # Size boxes based on column count
    gap_x = 12
    box_w = min(155, (W - 40 - (cols - 1) * gap_x) // cols)
    box_h = 50
    leader_w = min(180, box_w + 20)

    H = 140 + rows_count * (box_h + 35)

    svg = f'<text x="{W//2}" y="18" text-anchor="middle" font-size="10" font-family="{FONT}" fill="{DARK}" font-weight="700">{_esc(title)}</text>'

    # Leader box (centered, wider)
    lx = (W - leader_w) // 2
    ly = 35
    svg += f'<rect x="{lx}" y="{ly}" width="{leader_w}" height="{box_h}" rx="8" fill="{BLUE}"/>'
    # Auto font size: smaller if name is long
    leader_name = leader["role"]
    lfs = 9 if len(leader_name) <= 20 else 7.5
    svg += f'<text x="{lx + leader_w//2}" y="{ly + 22}" text-anchor="middle" font-size="{lfs}" font-family="{FONT}" fill="{WHITE}" font-weight="700">{_esc(leader_name)}</text>'
    svg += f'<text x="{lx + leader_w//2}" y="{ly + 38}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{BLUE_LIGHT}">{_esc(leader.get("dedicacion", ""))}</text>'

    # Connector line down from leader
    if team:
        svg += f'<line x1="{W//2}" y1="{ly + box_h}" x2="{W//2}" y2="{ly + box_h + 18}" stroke="{GRAY}" stroke-width="1.5"/>'

    # Team boxes
    total_w = cols * box_w + (cols - 1) * gap_x
    start_x = (W - total_w) // 2
    team_y = ly + box_h + 28

    for row_idx in range(rows_count):
        row_start = row_idx * cols
        row_members = team[row_start:row_start + cols]
        row_total_w = len(row_members) * box_w + (len(row_members) - 1) * gap_x
        row_start_x = (W - row_total_w) // 2
        my = team_y + row_idx * (box_h + 30)

        # Horizontal connector for this row
        if len(row_members) > 1:
            first_cx = row_start_x + box_w // 2
            last_cx = row_start_x + (len(row_members) - 1) * (box_w + gap_x) + box_w // 2
            svg += f'<line x1="{first_cx}" y1="{my - 10}" x2="{last_cx}" y2="{my - 10}" stroke="{GRAY}" stroke-width="1.5"/>'

        # Vertical connector from horizontal bar to leader (first row only)
        if row_idx == 0:
            svg += f'<line x1="{W//2}" y1="{ly + box_h + 18}" x2="{W//2}" y2="{my - 10}" stroke="{GRAY}" stroke-width="1.5"/>'

        for col_idx, member in enumerate(row_members):
            mx = row_start_x + col_idx * (box_w + gap_x)
            color = PALETTE[(row_start + col_idx + 1) % len(PALETTE)]
            role_name = member["role"]

            # Vertical connector from horizontal bar
            svg += f'<line x1="{mx + box_w//2}" y1="{my - 10}" x2="{mx + box_w//2}" y2="{my}" stroke="{GRAY}" stroke-width="1"/>'

            # Box
            svg += f'<rect x="{mx}" y="{my}" width="{box_w}" height="{box_h}" rx="8" fill="{WHITE}" stroke="{color}" stroke-width="2"/>'

            # Role name — auto font size
            fs = 8 if len(role_name) <= 22 else 6.5 if len(role_name) <= 30 else 5.5
            svg += f'<text x="{mx + box_w//2}" y="{my + 22}" text-anchor="middle" font-size="{fs}" font-family="{FONT}" fill="{DARK}" font-weight="600">{_esc(role_name)}</text>'

            ded = member.get("dedicacion", "")
            if ded:
                svg += f'<text x="{mx + box_w//2}" y="{my + 38}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{GRAY}">{_esc(ded)}</text>'

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{svg}</svg>'


# ═══════════════════════════════════════════════════════════════════
# 4. PROCESS FLOW
# ═══════════════════════════════════════════════════════════════════

def generate_process_flow_svg(steps: List[str] = None, title: str = "Flujo del Proceso") -> str:
    """Generate a horizontal process flow diagram."""
    if not steps:
        steps = ["Relevamiento", "Análisis", "Desarrollo", "Testing", "Entrega"]

    steps = steps[:7]  # Max 7 steps
    W = 520
    step_w, step_h = 65, 50
    gap = 12
    total_w = len(steps) * step_w + (len(steps) - 1) * gap
    start_x = (W - total_w) // 2
    H = 110

    svg = f'<text x="{W//2}" y="16" text-anchor="middle" font-size="10" font-family="{FONT}" fill="{DARK}" font-weight="700">{_esc(title)}</text>'

    for i, step in enumerate(steps):
        x = start_x + i * (step_w + gap)
        y = 35
        color = PALETTE[i % len(PALETTE)]

        # Step circle/rounded box
        svg += f'<rect x="{x}" y="{y}" width="{step_w}" height="{step_h}" rx="10" fill="{color}" opacity="0.9"/>'
        # Step number
        svg += f'<text x="{x + step_w//2}" y="{y + 20}" text-anchor="middle" font-size="14" font-family="{FONT}" fill="{WHITE}" font-weight="800">{i+1}</text>'
        # Step label below box
        svg += f'<text x="{x + step_w//2}" y="{y + step_h + 14}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{DARK}" font-weight="500">{_esc(_truncate(step, 12))}</text>'

        # Arrow to next
        if i < len(steps) - 1:
            ax = x + step_w + 2
            svg += f'<line x1="{ax}" y1="{y + step_h//2}" x2="{ax + gap - 4}" y2="{y + step_h//2}" stroke="{GRAY}" stroke-width="1.5" marker-end="url(#arrowhead)"/>'

    svg = f'<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{GRAY}"/></marker></defs>' + svg

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{svg}</svg>'


# ═══════════════════════════════════════════════════════════════════
# 5. RISK MATRIX
# ═══════════════════════════════════════════════════════════════════

def generate_risk_matrix_svg(title: str = "Matriz de Evaluación de Riesgos") -> str:
    """Generate a probability × impact risk matrix."""
    W, H = 520, 280
    grid_x, grid_y, grid_w, grid_h = 100, 50, 380, 200

    svg = f'<text x="{W//2}" y="20" text-anchor="middle" font-size="10" font-family="{FONT}" fill="{DARK}" font-weight="700">{_esc(title)}</text>'

    # Grid cells (3×3)
    colors = [
        [GREEN_LIGHT, AMBER_LIGHT, RED_LIGHT],    # Low impact
        [GREEN_LIGHT, AMBER_LIGHT, RED_LIGHT],    # Med impact
        [AMBER_LIGHT, RED_LIGHT,   RED_LIGHT],    # High impact
    ]
    labels = [
        ["Bajo", "Moderado", "Alto"],
        ["Moderado", "Alto", "Crítico"],
        ["Alto", "Crítico", "Extremo"],
    ]
    cell_w = grid_w // 3
    cell_h = grid_h // 3

    for row in range(3):
        for col in range(3):
            cx = grid_x + col * cell_w
            cy = grid_y + (2 - row) * cell_h  # Inverted Y (low prob at bottom)
            svg += f'<rect x="{cx}" y="{cy}" width="{cell_w}" height="{cell_h}" fill="{colors[row][col]}" stroke="{WHITE}" stroke-width="2"/>'
            svg += f'<text x="{cx + cell_w//2}" y="{cy + cell_h//2 + 4}" text-anchor="middle" font-size="8" font-family="{FONT}" fill="{DARK}" font-weight="500">{labels[row][col]}</text>'

    # Y axis label
    svg += f'<text x="30" y="{grid_y + grid_h//2}" text-anchor="middle" font-size="8" font-family="{FONT}" fill="{DARK}" font-weight="600" transform="rotate(-90, 30, {grid_y + grid_h//2})">PROBABILIDAD</text>'
    for i, label in enumerate(["Baja", "Media", "Alta"]):
        ly = grid_y + (2 - i) * cell_h + cell_h // 2 + 3
        svg += f'<text x="{grid_x - 8}" y="{ly}" text-anchor="end" font-size="7" font-family="{FONT}" fill="{GRAY}">{label}</text>'

    # X axis label
    svg += f'<text x="{grid_x + grid_w//2}" y="{grid_y + grid_h + 28}" text-anchor="middle" font-size="8" font-family="{FONT}" fill="{DARK}" font-weight="600">IMPACTO</text>'
    for i, label in enumerate(["Bajo", "Medio", "Alto"]):
        lx = grid_x + i * cell_w + cell_w // 2
        svg += f'<text x="{lx}" y="{grid_y + grid_h + 15}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{GRAY}">{label}</text>'

    # Example risk points
    risks = [
        (0, 0, "R1"), (1, 1, "R2"), (0, 2, "R3"), (2, 1, "R4"),
    ]
    for col, row, label in risks:
        rx = grid_x + col * cell_w + cell_w // 2
        ry = grid_y + (2 - row) * cell_h + cell_h // 2
        svg += f'<circle cx="{rx}" cy="{ry - 12}" r="10" fill="{BLUE}" opacity="0.8"/>'
        svg += f'<text x="{rx}" y="{ry - 8}" text-anchor="middle" font-size="7" font-family="{FONT}" fill="{WHITE}" font-weight="700">{label}</text>'

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{svg}</svg>'


# ═══════════════════════════════════════════════════════════════════
# PARSERS — Extract data from section content
# ═══════════════════════════════════════════════════════════════════

def parse_etapas(content: str) -> List[dict]:
    """Parse etapas from text: 'Etapa 1: Name (Dias/Semana X-Y)'."""
    etapas = []
    for line in content.split("\n"):
        line = line.strip()
        # Strip markdown prefixes: ### , ## , **, *
        line = re.sub(r'^#{1,4}\s*', '', line)
        line = re.sub(r'^\*{1,2}', '', line)
        line = re.sub(r'\*{1,2}$', '', line)
        line = line.strip()
        name = start = end = None

        # Pattern: "Etapa N: Name (Dias/Semana X a/- Y)"
        m = re.match(r'[Ee]tapa\s*\d*[.:]\s*(.+?)(?:\((?:\d+%?\s*[-–—]\s*)?(?:[Dd]ias?|[Ss]emanas?)\s*(\d+)\s*(?:a|al?|-|–)\s*(\d+)\))?$', line)
        if m:
            name = m.group(1).strip()
            start = int(m.group(2)) if m.group(2) else None
            end = int(m.group(3)) if m.group(3) else None

        # Also match: "Fase N: Name" or "Fase N - Name"
        if not name:
            m = re.match(r'[Ff]ase\s*\d*[.:\-]\s*(.+?)(?:\((?:[Dd]ias?|[Ss]emanas?)\s*(\d+)\s*[-–a]\s*(\d+)\))?$', line)
            if m:
                name = m.group(1).strip()
                start = int(m.group(2)) if m.group(2) else None
                end = int(m.group(3)) if m.group(3) else None

        if not name:
            m = re.match(r'(\d+)[.)]\s+(.+?)(?:\((?:[Dd]ias?|[Ss]emanas?)\s*(\d+)\s*[-–a]\s*(\d+)\))?$', line)
            if m and len(m.group(2)) > 3:
                name = m.group(2).strip()
                start = int(m.group(3)) if m.group(3) else None
                end = int(m.group(4)) if m.group(4) else None

        if name:
            idx = len(etapas)
            if start is None:
                start = idx * 15
                end = start + 15
            etapas.append({
                "name": name,
                "start": start,
                "end": end or start + 15,
                "color": PALETTE[idx % len(PALETTE)],
            })

    return etapas[:8]


def parse_roles(content: str) -> List[dict]:
    """Parse pipe-delimited team table into roles."""
    roles = []
    for line in content.split("\n"):
        line = line.strip()
        if "|" in line and line.count("|") >= 2:
            cells = [c.strip() for c in line.split("|") if c.strip()]
            if cells and not cells[0].lower().startswith("rol"):  # Skip header
                role = cells[0]
                ded = cells[-1] if len(cells) >= 3 else ""
                roles.append({"role": role, "dedicacion": ded})
    return roles


def parse_process_steps(content: str) -> List[str]:
    """Extract process steps from numbered lines or bullets."""
    steps = []
    for line in content.split("\n"):
        line = line.strip()
        m = re.match(r'(?:\d+[.)]\s+|[-*]\s+)(.+)', line)
        if m and len(m.group(1)) > 3:
            # Clean: remove "Actividades:", "Entregables:" prefixes
            text = re.sub(r'^(Actividades|Entregables|Hito)[:\s]*', '', m.group(1)).strip()
            if text and text not in steps:
                steps.append(text)
    return steps[:7]


def extract_tech_stack(content: str) -> List[str]:
    """Detect technology names mentioned in text."""
    tech_keywords = [
        "React", "Angular", "Vue", "Next.js", "TypeScript", "JavaScript",
        "Python", "FastAPI", "Django", "Flask", "Node.js", "Java", "Spring",
        "MongoDB", "PostgreSQL", "MySQL", "Redis", "Elasticsearch",
        "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Nginx",
        "Git", "CI/CD", "Jenkins", "GitHub Actions",
        "REST", "GraphQL", "WebSocket", "MQTT",
        "SCRUM", "Agile", "DevOps",
    ]
    found = []
    content_lower = content.lower()
    for tech in tech_keywords:
        if tech.lower() in content_lower:
            found.append(tech)
    return found[:9]


# ═══════════════════════════════════════════════════════════════════
# AUTO-SELECT — Choose diagrams by template type
# ═══════════════════════════════════════════════════════════════════

DIAGRAM_CAPTIONS = {
    "gantt": "Cronograma del Proyecto",
    "architecture": "Arquitectura del Sistema Propuesto",
    "org_chart": "Organigrama del Equipo de Trabajo",
    "process_flow": "Flujo del Proceso de Implementación",
    "risk_matrix": "Matriz de Evaluación de Riesgos",
}


def auto_select_diagrams(sections: List[dict], template_type: str = "servicio") -> List[Tuple[str, str, str]]:
    """Select 3+ diagrams. Returns [(section_slug, diagram_type, caption)]."""
    diagrams = []
    slugs = {s.get("slug", "") for s in sections}

    # ALWAYS: Gantt if plan_trabajo exists
    for slug in ("plan_trabajo", "cronograma"):
        if slug in slugs:
            diagrams.append((slug, "gantt", DIAGRAM_CAPTIONS["gantt"]))
            break

    # ALWAYS: Org chart if equipo exists
    if "equipo_trabajo" in slugs:
        diagrams.append(("equipo_trabajo", "org_chart", DIAGRAM_CAPTIONS["org_chart"]))

    # By template type
    t = template_type.lower() if template_type else "servicio"
    if "software" in t or "servicio" in t or "it" in t:
        diagrams.append(("propuesta_tecnica", "architecture", DIAGRAM_CAPTIONS["architecture"]))
    elif "red" in t or "conectividad" in t:
        diagrams.append(("propuesta_tecnica", "architecture", "Topología de Red Propuesta"))
    elif "seguridad" in t or "electr" in t:
        diagrams.append(("propuesta_tecnica", "process_flow", "Esquema Técnico de Implementación"))

    # Process flow if propuesta exists and we need more
    if len(diagrams) < 3 and "propuesta_tecnica" in slugs:
        if not any(d[1] == "process_flow" for d in diagrams):
            diagrams.append(("propuesta_tecnica", "process_flow", DIAGRAM_CAPTIONS["process_flow"]))

    # Risk matrix as fallback
    if len(diagrams) < 3:
        risk_slug = "evaluacion_riesgos" if "evaluacion_riesgos" in slugs else "plan_calidad"
        if risk_slug not in slugs:
            risk_slug = list(slugs)[-1] if slugs else "propuesta_tecnica"
        diagrams.append((risk_slug, "risk_matrix", DIAGRAM_CAPTIONS["risk_matrix"]))

    return diagrams[:5]  # Max 5 diagrams


def generate_diagram(diagram_type: str, content: str = "", title: str = "") -> str:
    """Dispatch to the correct generator."""
    if diagram_type == "gantt":
        etapas = parse_etapas(content)
        return generate_gantt_svg(etapas, title or "Cronograma del Proyecto")
    elif diagram_type == "architecture":
        components = extract_tech_stack(content)
        return generate_architecture_svg(components, title or "Arquitectura del Sistema")
    elif diagram_type == "org_chart":
        roles = parse_roles(content)
        return generate_org_chart_svg(roles, title or "Organigrama del Equipo")
    elif diagram_type == "process_flow":
        steps = parse_process_steps(content)
        if not steps:
            steps = ["Relevamiento", "Análisis", "Diseño", "Implementación", "Testing", "Entrega"]
        return generate_process_flow_svg(steps, title or "Flujo del Proceso")
    elif diagram_type == "risk_matrix":
        return generate_risk_matrix_svg(title or "Matriz de Riesgos")
    return ""
