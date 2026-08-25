/**
 * The editor chrome's glyph set.
 *
 * These are the host design system's own icons, vendored as path data rather
 * than imported: the package must not reach into the app it edits, and a
 * runtime import would couple the two trees the README keeps apart.
 *
 * Regenerate by extracting these names from the host's icon data:
 *   node -e 'const d=require("./src/components/icons/instagram-icon-data.json"); ...'
 *
 * Every glyph is authored on a 24x24 grid and inherits `currentColor`, so a
 * caller sets colour by setting `color` and size by passing `size`.
 */

export type IconNode = [
  tag: string,
  attrs: Record<string, string | number>,
  children?: IconNode[],
]

export interface IconData {
  nodes: IconNode[]
  rootFill: string
  rootStroke?: string
}

const ICONS = {
  /*
   * The selector arrow, in the two states the mode toggle wears it.
   *
   * Not vendored: neither the editor's set nor the host's 152-icon set has a
   * pointer arrow, so this pair is authored here. Both are the SAME kite —
   * tip, tail, notch, barb — re-solved twice so that each lands on the 20x20
   * ink tier every other glyph in the strip occupies: the filled one measures
   * its own bbox, the outlined one measures its bbox plus half of the 2-unit
   * stroke on each side, so the filled path runs 2..22 and the outlined one
   * 3..21. Sizing them identically and letting the stroke spill would have made
   * the hollow state read a rung larger than the solid one at the same `size`.
   *
   * They differ by FILL, never by colour: the toggle they sit in is a mode, and
   * a mode read only in colour is not read at all.
   */
  "Cursor": {
    "nodes": [
      [
        "path",
        {
          "d": "M2 2 10.318 22 13.271 13.306 22 10.318Z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "CursorOutline": {
    "nodes": [
      [
        "path",
        {
          "d": "M3 3 10.485 21 13.144 13.175 21 10.485Z"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  "Play": {
    "nodes": [
      [
        "path",
        {
          "d": "M4.664 21.172a2.441 2.441 0 0 1-1.22-2.116V4.944a2.444 2.444 0 0 1 3.667-2.12l12.222 7.057a2.444 2.444 0 0 1 0 4.235L7.111 21.172a2.446 2.446 0 0 1-2.447 0z",
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  /*
   * The two panel toggles, in the two states each of them has.
   *
   * They replace PanelLeft and PanelRight, which were an outlined frame with a
   * hairline ruled down it. That mark has one shape and no state: the divider
   * looked the same whether the panel it named was open or shut, so the button
   * could only report itself in colour — and a `--sidebar-accent` tint on a
   * 16px outline at the bottom of the screen is not a state anyone reads.
   *
   * These are authored as TWO solids instead of one ruled box: a slab for the
   * panel and a rounded rect for the canvas beside it, with real air between
   * them. That buys the state for free and buys it in SHAPE. Open, the slab is
   * 6 wide and the canvas is pushed over to make room. Collapsed, the slab
   * narrows to a 2.5 sliver against the edge — the panel seen edge-on, still
   * present, still nameable — and the canvas grows into the space it gave up.
   * Which is what actually happens on screen, so the glyph is a small picture
   * of the result rather than a symbol for it.
   *
   * All four land on the same 20x20 ink tier as the rest of the strip: the
   * slabs are filled and measure their own bbox (2..22), the canvas rects are
   * stroked and measure their bbox plus half of the 2-unit stroke, so they are
   * inset by 1 on every side they own. Both halves of a pair therefore span
   * exactly the same box, and the toggle does not change size when it flips.
   */
  "SidebarLeft": {
    "nodes": [
      [
        "rect",
        {
          "width": "6",
          "height": "20",
          "x": "2",
          "y": "2",
          "rx": "2",
          "fill": "currentColor",
          "stroke": "none"
        }
      ],
      [
        "rect",
        {
          "width": "10",
          "height": "18",
          "x": "11",
          "y": "3",
          "rx": "2"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  "SidebarLeftCollapsed": {
    "nodes": [
      [
        "rect",
        {
          "width": "2.5",
          "height": "20",
          "x": "2",
          "y": "2",
          "rx": "1.25",
          "fill": "currentColor",
          "stroke": "none"
        }
      ],
      [
        "rect",
        {
          "width": "13.5",
          "height": "18",
          "x": "7.5",
          "y": "3",
          "rx": "2"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  "SidebarRight": {
    "nodes": [
      [
        "rect",
        {
          "width": "10",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "rect",
        {
          "width": "6",
          "height": "20",
          "x": "16",
          "y": "2",
          "rx": "2",
          "fill": "currentColor",
          "stroke": "none"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  "SidebarRightCollapsed": {
    "nodes": [
      [
        "rect",
        {
          "width": "13.5",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "rect",
        {
          "width": "2.5",
          "height": "20",
          "x": "19.5",
          "y": "2",
          "rx": "1.25",
          "fill": "currentColor",
          "stroke": "none"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  /*
   * Undo and redo, re-solved onto the 20x20 ink tier.
   *
   * They used to be drawn on a circle of r=10.003 centred on (12,12), which
   * with the 2-unit stroke put their ink at 0.997..23.003 — 22x22 of the 24
   * grid, against 20x20 for the panel toggles beside them in the same strip.
   * At the toolbar's 16px they read a visible step heavier than every other
   * glyph in the bar.
   *
   * The fix is the PATH, not the call. `icon()` takes a size, not a per-glyph
   * override, and a smaller `size` shrinks the STROKE with the geometry — which
   * fixes the extent by breaking the optical weight. So the arc is r=9 on the
   * same centre (geometry 3..21, ink 2..22) and the tail tick is scaled with
   * it: corner at x=3, arms of 4.5, sitting on the arc's own endpoint.
   */
  "RotateCcw": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "fillRule": "evenodd",
          "d": "M3.6174 8.7255a9 9 0 1 1 1.8174 9.4306"
        }
      ],
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "fillRule": "evenodd",
          "d": "M7.5 8.7255 3 8.7255 3 4.2255"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "RotateCw": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "fillRule": "evenodd",
          "d": "M20.3826 8.7255a9 9 0 1 0-1.8174 9.4306"
        }
      ],
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "fillRule": "evenodd",
          "d": "M16.5 8.7255 21 8.7255 21 4.2255"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Search": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5z"
        }
      ],
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M16.51092 16.5109 22 21.99998"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Check": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M22 5 9.002 17.998 2.005 11.004"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "X": {
    "nodes": [
      [
        "path",
        {
          "d": "m13.414 12 7.293-7.293a1 1 0 1 0-1.414-1.414L12 10.586 4.707 3.293a1 1 0 1 0-1.414 1.414L10.586 12l-7.293 7.293a1 1 0 1 0 1.414 1.414L12 13.414l7.293 7.293a.997.997 0 0 0 1.414 0 1 1 0 0 0 0-1.414L13.414 12z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "ChevronDown": {
    "nodes": [
      [
        "path",
        {
          "d": "M12 17.502a1 1 0 0 1-.707-.293l-9-9.004a1 1 0 0 1 1.414-1.414L12 15.087l8.293-8.296a1 1 0 0 1 1.414 1.414l-9 9.004a1 1 0 0 1-.707.293z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "ChevronRight": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M8 3 17.004 12 8 21"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "SlidersHorizontal": {
    "nodes": [
      [
        "path",
        {
          "d": "M16.793 16.207a.997.997 0 0 0 1.414 0l3.5-3.5a.999.999 0 0 0 .216-1.089.999.999 0 0 0-.216-.326l-3.5-3.499a1 1 0 1 0-1.414 1.414L18.586 11H5.414l1.793-1.793a1 1 0 1 0-1.414-1.414l-3.5 3.5a1 1 0 0 0-.216 1.089 1 1 0 0 0 .217.326l3.5 3.499a.997.997 0 0 0 1.413 0 1 1 0 0 0 0-1.414L5.414 13h13.172l-1.793 1.793a1 1 0 0 0 0 1.414zM22 18a1 1 0 0 0-1 1c0 1.103-.897 2-2 2H5c-1.102 0-2-.897-2-2a1 1 0 1 0-2 0c0 2.206 1.794 4 4 4h14c2.206 0 4-1.794 4-4a1 1 0 0 0-1-1zM2 6a1 1 0 0 0 1-1c0-1.103.898-2 2-2h14c1.103 0 2 .897 2 2a1 1 0 1 0 2 0c0-2.206-1.794-4-4-4H5C2.794 1 1 2.794 1 5a1 1 0 0 0 1 1z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Plus": {
    "nodes": [
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M12 3 12 21"
        }
      ],
      [
        "path",
        {
          "fill": "none",
          "stroke": "currentColor",
          "strokeLinecap": "round",
          "strokeLinejoin": "round",
          "strokeWidth": "var(--instagram-icon-stroke-width, 2)",
          "d": "M21 12 3 12"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Minus": {
    "nodes": [
      [
        "path",
        {
          "d": "M21 13H3a1 1 0 0 1 0-2h18a1 1 0 0 1 0 2z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Eye": {
    "nodes": [
      [
        "path",
        {
          "d": "M23.441 11.819C23.413 11.74 20.542 4 12 4S.587 11.74.559 11.819a1 1 0 0 0 1.881.677 10.282 10.282 0 0 1 19.12 0 1 1 0 0 0 1.881-.677zm-7.124 2.368a3.359 3.359 0 0 1-1.54-.1 3.56 3.56 0 0 1-2.365-2.362 3.35 3.35 0 0 1-.103-1.542.99.99 0 0 0-1.134-1.107 5.427 5.427 0 0 0-3.733 2.34 5.5 5.5 0 0 0 8.446 6.97 5.402 5.402 0 0 0 1.536-3.09.983.983 0 0 0-1.107-1.109z",
          "fillRule": "evenodd"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Layers": {
    "nodes": [
      [
        "path",
        {
          "d": "M19,1h-8c-2.20557,0-4,1.79395-4,4v2h-2c-2.20557,0-4,1.79395-4,4v8c0,2.20605,1.79443,4,4,4h8c2.20557,0,4-1.79395,4-4v-2h2c2.20557,0,4-1.79395,4-4V5c0-2.20605-1.79443-4-4-4ZM15,19c0,1.10254-.89697,2-2,2H5c-1.10303,0-2-.89746-2-2v-8c0-1.10254.89697-2,2-2h2c0,.55273.44775,1,1,1s1-.44727,1-1h4c1.10303,0,2,.89746,2,2v4c-.55225,0-1,.44727-1,1s.44775,1,1,1v2ZM21,13c0,1.10254-.89697,2-2,2h-2v-4c0-2.20605-1.79443-4-4-4h-4v-2c0-1.10254.89697-2,2-2h8c1.10303,0,2,.89746,2,2v8Z"
        }
      ],
      [
        "circle",
        {
          "cx": "8",
          "cy": "12",
          "r": "1"
        }
      ],
      [
        "circle",
        {
          "cx": "8.5",
          "cy": "15.5",
          "r": "1"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "16",
          "r": "1"
        }
      ]
    ],
    "rootFill": "currentColor"
  }
}

/**
 * Narrowed from the literal, not from `Record<string, IconData>`.
 *
 * The object used to be cast to a string-keyed record, which collapsed this
 * union to plain `string` and let `icon("Chevronright")` compile and then throw
 * at runtime. Casting at the point of USE instead keeps the key union.
 */
export type IconName = keyof typeof ICONS

/** The set, for a caller that needs to walk it — the icon test does. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[]

const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * The source data is authored for React, where `strokeWidth` is a prop.
 *
 * `setAttribute("strokeWidth", …)` is not an error and not a no-op: it sets an
 * attribute that SVG has never heard of, so the path falls back to the UA's 1px
 * default and every stroke-drawn glyph renders a third as heavy as it should.
 * Most of this set is stroke-drawn, so this was most of the set, and it is
 * invisible to a type check and to any test that only asks whether an <svg>
 * exists.
 */
const kebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)

/**
 * The host resolves `var(--instagram-icon-stroke-width, 2)` because it writes
 * that value into CSS. Here it lands in a presentation ATTRIBUTE, where custom
 * properties do not resolve at all, so take the fallback the author already
 * declared rather than inventing a second source for the weight.
 */
const CSS_VAR_FALLBACK = /^var\(\s*--[^,)]+,\s*([^)]+)\)$/

function build(node: IconNode): SVGElement {
  const [tag, attrs, children = []] = node
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) {
    const literal = String(value)
    const fallback = CSS_VAR_FALLBACK.exec(literal)
    element.setAttribute(kebab(name), fallback ? fallback[1].trim() : literal)
  }
  for (const child of children) element.append(build(child))
  return element
}

/**
 * Draw one glyph from its data.
 *
 * Split out from `icon` so the host's own icon set — served by the loopback
 * `/icons` route and offered as variants in the inspector — is drawn by the
 * same rules as the chrome's vendored glyphs. Two renderers would be two
 * answers to "how heavy is a stroke", and only one of them would be right.
 */
export function drawIcon(data: IconData, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("width", String(size))
  svg.setAttribute("height", String(size))
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", data.rootFill === "none" ? "none" : "currentColor")
  if (data.rootStroke) {
    svg.setAttribute("stroke", "currentColor")
    // 2 user units on the 24 grid, which is the host's default and scales down
    // with the glyph — the same 1.33px at 16px that the app draws.
    svg.setAttribute("stroke-width", "2")
    svg.setAttribute("stroke-linecap", "round")
    svg.setAttribute("stroke-linejoin", "round")
  }
  svg.setAttribute("aria-hidden", "true")
  for (const node of data.nodes) svg.append(build(node))
  return svg
}

/**
 * One glyph, sized and decorative.
 *
 * `currentColor` rather than a token: the same mark is drawn on a rest row, a
 * hovered row and a filled selected row, and only the caller knows which.
 */
export function icon(name: IconName, size = 16): SVGSVGElement {
  return drawIcon(ICONS[name] as IconData, size)
}
