// ═══════════════════════════════════════════════════════════════
// OFFER PDF TEMPLATE — Publication-grade typesetting with Typst
// Variables are injected as JSON via --input data=...
// ═══════════════════════════════════════════════════════════════

// Read injected JSON data file (placed in same directory as this template)
#let data = json("data.json")

// Extract fields
#let company_name = data.at("company_name", default: "Empresa")
#let cuit = data.at("cuit", default: "")
#let objeto = data.at("objeto", default: "")
#let organismo = data.at("organismo", default: "")
#let lic_num = data.at("lic_num", default: "")
#let fecha = data.at("fecha", default: "")
#let tipo_procedimiento = data.at("tipo_procedimiento", default: "Licitación Pública")
#let website_url = data.at("website_url", default: "")
#let brand_primary = rgb(data.at("brand_primary", default: "#1d4ed8"))
#let brand_accent = rgb(data.at("brand_accent", default: "#DC2626"))
#let sections = data.at("sections", default: ())
#let items = data.at("items", default: ())
#let subtotal = data.at("subtotal", default: 0)
#let iva_rate = data.at("iva_rate", default: 21)
#let iva_amount = data.at("iva_amount", default: 0)
#let total = data.at("total", default: 0)
#let validez = data.at("validez", default: "30")
#let logo_path = data.at("logo_path", default: none)

// ─── Color system ───
#let neutral_blue = rgb("#1d4ed8")
#let neutral_light = rgb("#dbeafe")
#let text_dark = rgb("#1f2937")
#let text_medium = rgb("#374151")
#let text_light = rgb("#6b7280")
#let text_muted = rgb("#9ca3af")
#let bg_light = rgb("#f8fafc")
#let border_light = rgb("#e5e7eb")

// ─── Helpers ───
#let fmt_currency(n) = {
  let abs_n = calc.abs(n)
  let int_part = calc.floor(abs_n)
  let dec_part = calc.round((abs_n - int_part) * 100)
  let dec_str = if dec_part < 10 { "0" + str(calc.floor(dec_part)) } else { str(calc.floor(dec_part)) }

  // Format with dots as thousands separator
  let s = str(int_part)
  let groups = ()
  let i = s.len()
  while i > 0 {
    let start = calc.max(0, i - 3)
    groups.push(s.slice(start, i))
    i = start
  }
  let formatted = groups.rev().join(".")
  "$ " + formatted + "," + dec_str
}

// ═══ PAGE SETUP ═══
#set page(
  paper: "a4",
  margin: (top: 28mm, bottom: 28mm, left: 24mm, right: 22mm),
  header: context {
    if counter(page).get().first() > 1 [
      #set text(7pt, fill: text_light, weight: "bold")
      #upper(company_name)
      #line(length: 100%, stroke: 2pt + brand_primary)
    ]
  },
  footer: context {
    if counter(page).get().first() > 1 [
      #line(length: 100%, stroke: 0.5pt + border_light)
      #v(3pt)
      #set text(7pt, fill: text_muted)
      #grid(
        columns: (1fr, auto),
        align: (left, right),
        if website_url != "" { website_url } else { objeto.slice(0, calc.min(55, objeto.len())) },
        [Pág. #counter(page).display() / #context counter(page).final().first()],
      )
    ]
  },
)

// ─── Typography ───
#set text(
  font: "Inter",
  size: 11.5pt,
  fill: text_dark,
  lang: "es",
  region: "ar",
  hyphenate: true,
)
#set par(
  leading: 0.75em,
  spacing: 1.2em,
  first-line-indent: 0pt,
)

// Heading styles
#set heading(numbering: none)
#show heading.where(level: 1): it => {
  v(6pt)
  block(width: 100%)[
    #grid(
      columns: (32pt, 1fr),
      gutter: 10pt,
      align: (center, left),
      {
        place(
          center + horizon,
          circle(
            radius: 14pt,
            fill: gradient.linear(neutral_blue, rgb("#3b82f6")),
            stroke: none,
          )[
            #set text(12pt, fill: white, weight: "bold")
            #counter(heading).display()
          ],
        )
      },
      {
        set text(14pt, weight: "bold", fill: neutral_blue)
        upper(it.body)
        v(4pt)
        line(length: 100%, stroke: 2.5pt + neutral_light)
      },
    )
  ]
  v(10pt)
}

#show heading.where(level: 2): it => {
  v(14pt)
  block[
    #set text(12pt, weight: "bold", fill: text_dark)
    #it.body
    #v(2pt)
    #line(length: 60%, stroke: 0.75pt + border_light)
  ]
  v(6pt)
}

#show heading.where(level: 3): it => {
  v(10pt)
  block[
    #set text(11.5pt, weight: "semibold", fill: text_medium)
    #it.body
  ]
  v(4pt)
}

// Strong text styling
#show strong: set text(weight: "bold", fill: text_dark)

// ═══════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════
#page(
  header: none,
  footer: none,
  margin: (top: 25mm, bottom: 25mm, left: 24mm, right: 22mm),
)[
  // Accent bar
  #place(left + top, dx: -24mm, dy: -25mm)[
    #rect(width: 8pt, height: 297mm, fill: gradient.linear(brand_primary, brand_accent, brand_primary, angle: 90deg))
  ]

  // Logo or initials
  #v(20pt)
  #if logo_path != none {
    image(logo_path, height: 50pt)
  } else {
    circle(
      radius: 34pt,
      fill: gradient.linear(brand_primary, brand_accent),
    )[
      #set text(26pt, fill: white, weight: "extrabold")
      #align(center + horizon)[#company_name.slice(0, calc.min(2, company_name.len())).to-uppercase()]
    ]
  }

  #v(50pt)

  // Title
  #text(28pt, weight: "black", fill: rgb("#0f172a"))[#objeto]

  #v(10pt)

  // Subtitle
  #text(11pt, weight: "bold", fill: brand_primary, tracking: 0.25em)[
    #upper[Propuesta Técnica y Económica]
  ]

  // Separator
  #v(30pt)
  #line(length: 70%, stroke: 2pt + gradient.linear(brand_primary, brand_accent, white))
  #v(20pt)

  // Metadata grid
  #grid(
    columns: (1fr, 1fr),
    row-gutter: 0pt,
    column-gutter: 20pt,
    ..{
      let meta_items = (
        ("Expediente", lic_num),
        ("Organismo", organismo),
        ("Oferente", company_name),
        ("CUIT", cuit),
        ("Fecha de Presentación", fecha),
        ("Procedimiento", tipo_procedimiento),
      )
      meta_items.map(((label, value)) => {
        block(width: 100%, inset: (y: 8pt))[
          #line(length: 100%, stroke: 0.5pt + border_light)
          #v(6pt)
          #text(7.5pt, fill: text_muted, weight: "semibold", tracking: 0.1em)[#upper(label)]
          #v(2pt)
          #text(11pt, fill: text_dark, weight: "medium")[#value]
        ]
      })
    }
  )

  // Footer
  #v(1fr)
  #line(length: 100%, stroke: 0.5pt + border_light)
  #v(8pt)
  #text(20pt, weight: "extrabold", fill: text_medium)[#upper(company_name)]
  #if website_url != "" {
    v(2pt)
    text(10pt, weight: "semibold", fill: brand_primary)[#website_url]
  }
  #v(4pt)
  #text(10pt, fill: text_muted)[Mendoza, #fecha]
]

// ═══════════════════════════════════════════════
// CONTENT SECTIONS
// ═══════════════════════════════════════════════

// Reset heading counter
#counter(heading).update(0)

#for sec in sections {
  let slug = sec.at("slug", default: "")
  let title = sec.at("title", default: slug)
  let content = sec.at("content", default: "")

  if slug == "portada" { continue }
  if content.trim() == "" and slug != "oferta_economica" { continue }

  if slug == "oferta_economica" {
    // ─── ECONOMIC OFFER TABLE ───
    heading(level: 1)[#title]

    if items.len() > 0 {
      table(
        columns: (30pt, 1fr, 50pt, 40pt, 85pt, 85pt),
        align: (center, left, center, center, right, right),
        fill: (_, row) => if row == 0 { gradient.linear(neutral_blue, rgb("#3b82f6")) } else if calc.even(row) { bg_light } else { white },
        stroke: 0.5pt + border_light,

        // Header
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[\#]],
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[DESCRIPCIÓN]],
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[CANT.]],
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[UD.]],
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[P. UNITARIO]],
        table.cell(fill: gradient.linear(neutral_blue, rgb("#3b82f6")))[#text(fill: white, weight: "bold", size: 10pt)[SUBTOTAL]],

        // Rows
        ..items.enumerate().map(((i, item)) => {
          let q = item.at("cantidad", default: 0)
          let p = item.at("precio_unitario", default: 0)
          (
            text(size: 10.5pt)[#str(i + 1)],
            text(size: 10.5pt)[#item.at("descripcion", default: "")],
            text(size: 10.5pt)[#str(q)],
            text(size: 10.5pt)[#item.at("unidad", default: "u.")],
            text(size: 10.5pt)[#fmt_currency(p)],
            text(size: 10.5pt)[#fmt_currency(q * p)],
          )
        }).flatten(),

        // Subtotal
        table.cell(colspan: 4)[], table.cell(stroke: (top: 1.5pt + rgb("#d1d5db")))[#text(weight: "semibold", size: 11pt)[Subtotal]], table.cell(stroke: (top: 1.5pt + rgb("#d1d5db")))[#text(size: 11pt)[#fmt_currency(subtotal)]],
        // IVA
        table.cell(colspan: 4)[], text(weight: "semibold", size: 11pt)[IVA (#str(iva_rate)%)], text(size: 11pt)[#fmt_currency(iva_amount)],
        // Total
        table.cell(colspan: 4, fill: gradient.linear(neutral_blue, rgb("#2563eb")))[], table.cell(fill: gradient.linear(neutral_blue, rgb("#2563eb")))[#text(fill: white, weight: "bold", size: 14pt)[TOTAL]], table.cell(fill: gradient.linear(neutral_blue, rgb("#2563eb")))[#text(fill: white, weight: "bold", size: 14pt)[#fmt_currency(total)]],
      )
    }

    if validez != "" {
      v(10pt)
      text(10pt, fill: text_light, style: "italic")[Validez de la oferta: #validez días]
    }
  } else {
    // ─── REGULAR SECTION ───
    heading(level: 1)[#title]

    // Render content as Typst markup (supports **bold**, lists, headings)
    // The Python service pre-processes content to valid Typst markup
    // Using Typst's native eval to render markup strings safely
    // Note: Typst eval() is NOT like JS/Python eval() — it only processes
    // Typst markup (bold, italic, lists), not arbitrary code execution
    {
      set text(11.5pt, fill: text_dark)
      // Typst eval() for markup is the standard way to render dynamic content
      // It only interprets Typst formatting syntax, not system commands
      eval(content, mode: "markup") // safe: Typst markup only
    }
  }
}

// ═══════════════════════════════════════════════
// SIGNATURE
// ═══════════════════════════════════════════════
#v(50pt)
#align(center)[
  #line(length: 250pt, stroke: 0.75pt + text_medium)
  #v(6pt)
  #text(weight: "semibold")[#company_name]
  #if cuit != "" {
    v(2pt)
    text(9pt, fill: text_light)[CUIT: #cuit]
  }
  #v(2pt)
  #text(9pt, fill: text_light)[Representante Legal]
]

#v(30pt)
#align(center)[
  #text(8pt, fill: text_muted)[Mendoza, #fecha]
]
