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
  "Move": {
    "nodes": [
      [
        "path",
        {
          "d": "M22.70703,11.29297l-3-3c-.39062-.39062-1.02344-.39062-1.41406,0s-.39062,1.02344,0,1.41406l1.29297,1.29297h-6.58594v-6.58594l1.29297,1.29297c.19531.19531.45117.29297.70703.29297s.51172-.09766.70703-.29297c.39062-.39062.39062-1.02344,0-1.41406l-3-3c-.39062-.39062-1.02344-.39062-1.41406,0l-3,3c-.39062.39062-.39062,1.02344,0,1.41406s1.02344.39062,1.41406,0l1.29297-1.29297v6.58594h-6.58594l1.29297-1.29297c.39062-.39062.39062-1.02344,0-1.41406s-1.02344-.39062-1.41406,0l-3,3c-.39062.39062-.39062,1.02344,0,1.41406l3,3c.19531.19531.45117.29297.70703.29297s.51172-.09766.70703-.29297c.39062-.39062.39062-1.02344,0-1.41406l-1.29297-1.29297h6.58594v6.58594l-1.29297-1.29297c-.39062-.39062-1.02344-.39062-1.41406,0s-.39062,1.02344,0,1.41406l3,3c.19531.19531.45117.29297.70703.29297s.51172-.09766.70703-.29297l3-3c.39062-.39062.39062-1.02344,0-1.41406s-1.02344-.39062-1.41406,0l-1.29297,1.29297v-6.58594h6.58594l-1.29297,1.29297c-.39062.39062-.39062,1.02344,0,1.41406.19531.19531.45117.29297.70703.29297s.51172-.09766.70703-.29297l3-3c.39062-.39062.39062-1.02344,0-1.41406Z"
        }
      ]
    ],
    "rootFill": "currentColor"
  },
  "Hand": {
    "nodes": [
      [
        "path",
        {
          "d": "M12.877 2.5a1 1 0 0 1 1 1v7.567a.75.75 0 0 0 1.5 0V5a1 1 0 0 1 2 0v6.067a.75.75 0 0 0 1.5 0V8a1 1 0 0 1 2 0v6.5c0 .03-.014.053-.017.082-.174 3.849-3.341 6.918-7.233 6.918a7.199 7.199 0 0 1-4.036-1.243c-.025-.016-.38-.266-.475-.343l-5.597-4.242a1 1 0 1 1 1.208-1.594l2.848 2.158a.5.5 0 0 0 .802-.398V5.5a1 1 0 0 1 2 0v5.567a.75.75 0 0 0 1.5 0V3.5a1 1 0 0 1 1-1m0-2c-1.33 0-2.46.87-2.853 2.07A3.002 3.002 0 0 0 6.377 5.5v7.318l-.442-.334a2.973 2.973 0 0 0-1.81-.61c-.934 0-1.828.444-2.392 1.188a2.98 2.98 0 0 0-.582 2.221 2.98 2.98 0 0 0 1.16 1.983l5.597 4.242c.084.068.416.306.566.407a9.2 9.2 0 0 0 5.153 1.585 9.228 9.228 0 0 0 9.222-8.661 2.12 2.12 0 0 0 .028-.339V8a3.003 3.003 0 0 0-3.5-2.958V5a3.003 3.003 0 0 0-3.838-2.881A3.003 3.003 0 0 0 12.877.5z"
        }
      ]
    ],
    "rootFill": "currentColor"
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
  "PanelLeft": {
    "nodes": [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "path",
        {
          "d": "M9 3v18"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
  "PanelRight": {
    "nodes": [
      [
        "rect",
        {
          "width": "18",
          "height": "18",
          "x": "3",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "path",
        {
          "d": "M15 3v18"
        }
      ]
    ],
    "rootFill": "none",
    "rootStroke": "currentColor"
  },
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
          "d": "M2.682 8.364a10.003 10.003 0 1 1 2.023 10.475"
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
          "d": "M7 8.364 2 8.364 2 3.364"
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
          "d": "M21.318 8.364a10.003 10.003 0 1 0-2.022 10.475"
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
          "d": "M17 8.364 22 8.364 22 3.364"
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
 * Nine of the sixteen are stroke-drawn, so this was most of the set, and it is
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
