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
  /**
   * How much of the 24 grid this drawing actually INKS, measured.
   *
   * `viewBox` does not answer that and neither does the `size` argument: two
   * glyphs drawn at 16px read a step apart when one of them fills more of its
   * box. The host's set is authored to 22 of 24; the geometric glyphs authored
   * here are 20; side by side in one strip that is a visible step.
   */
  ink?: number
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
    "rootFill": "currentColor",
    "ink": 20
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
    "rootStroke": "currentColor",
    "ink": 20
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
    "rootFill": "currentColor",
    "ink": 20
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
    "rootFill": "currentColor",
    "ink": 20
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
  /*
   * The two panel toggles: layers on the left, sliders on the right.
   *
   * They name the panel's CONTENTS rather than its geometry — the left panel is
   * the layer tree and the right one is the controls — so the mark says what
   * you get instead of picturing a rectangle sliding in.
   *
   * One glyph each, no open/collapsed pair. A side panel reports its own state
   * by being there; the button carries `aria-pressed` and nothing else.
   *
   * `Layers` below is the host's drawing, vendored unaltered, because the
   * toolbar should read as the same hand as the app. Sliders could not be:
   * the host's set has no sliders drawing. The glyph its facade exports as
   * `SlidersHorizontal` is a left-right swap arrow between two rails — measured
   * from `src/components/icons/instagram-icon-data.json`, and it renders as a
   * transfer mark, which on a button that opens the property panel says the
   * wrong thing loudly. So this one is authored here, in the host's idiom:
   * pure fills, 2-unit bars with fully rounded ends, knobs cut out of the rail
   * rather than laid over it, and the same 22-of-24 ink the vendored marks use
   * so all three go through one reduction and land on the family's 20.
   */
  "SlidersHorizontal": {
    "nodes": [
      ["rect", { "x": "1", "y": "2.5", "width": "11", "height": "2", "rx": "1" }],
      ["rect", { "x": "20", "y": "2.5", "width": "3", "height": "2", "rx": "1" }],
      ["circle", { "cx": "16", "cy": "3.5", "r": "2.5" }],
      ["rect", { "x": "1", "y": "11", "width": "3", "height": "2", "rx": "1" }],
      ["rect", { "x": "12", "y": "11", "width": "11", "height": "2", "rx": "1" }],
      ["circle", { "cx": "8", "cy": "12", "r": "2.5" }],
      ["rect", { "x": "1", "y": "19.5", "width": "9.5", "height": "2", "rx": "1" }],
      ["rect", { "x": "18.5", "y": "19.5", "width": "4.5", "height": "2", "rx": "1" }],
      ["circle", { "cx": "14.5", "cy": "20.5", "r": "2.5" }]
    ],
    "rootFill": "currentColor",
    "ink": 22
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
    "rootFill": "currentColor",
    "ink": 22
  },

  /*
   * The second wave: layer-row type marks, row affordances, the right panel's
   * tab marks, and the align/arrange strip.
   *
   * Authored here rather than vendored, because the host's 152-icon set has no
   * drawing for any of them — it is a product icon set, and these are tooling
   * marks (an alignment edge, a component diamond, a code bracket). They are
   * written in the open-source geometric idiom the rest of the authored glyphs
   * already use: pure geometry on the 24 grid, stroked at the family's 2 units.
   *
   * Unlike the machine-extracted entries above, these declare their stroke ONCE
   * on the root via `rootStroke` instead of repeating five presentation
   * attributes per node. `drawIcon` puts the weight, the caps and the joins on
   * the <svg>, and the children inherit — same rendered result, a fifth of the
   * data. No `ink` is declared: they are stroked, so the window may not be used
   * to resize them (see `inkViewBox`), and they are drawn to the same 2..22
   * extent `Search` and `ChevronRight` already occupy.
   */

  /** Right panel, Code tab. */
  "Code": {
    "nodes": [
      ["path", { "d": "m18 16 4-4-4-4" }],
      ["path", { "d": "m6 8-4 4 4 4" }],
      ["path", { "d": "m14.5 4-5 16" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  /** Right panel, Change prompts tab — the mark the app uses for "for the AI". */
  "Sparkles": {
    "nodes": [
      ["path", { "d": "M10 2 11.9 7.1 17 9l-5.1 1.9L10 16l-1.9-5.1L3 9l5.1-1.9Z" }],
      ["path", { "d": "M18 14.5 18.9 17.1 21.5 18l-2.6.9L18 21.5l-.9-2.6L14.5 18l2.6-.9Z" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Copy": {
    "nodes": [
      ["rect", { "x": "8", "y": "8", "width": "14", "height": "14", "rx": "2" }],
      ["path", { "d": "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Trash": {
    "nodes": [
      ["path", { "d": "M3 6h18" }],
      ["path", { "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
      ["path", { "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },

  /*
   * Layer-row affordances, both authored stroked.
   *
   * The host's filled `Eye` above is drawn for a 24px product icon: its pupil
   * is an evenodd cutout in a lid that only closes at that size. Rendered at
   * the row's 12px it collapses into an arc with a blob beside it — checked in
   * a browser, not inferred. So the shown state gets a stroked twin here, which
   * also means the pair now matches in weight instead of one being filled and
   * the other outlined.
   */
  "EyeOpen": {
    "nodes": [
      ["path", { "d": "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" }],
      ["circle", { "cx": "12", "cy": "12", "r": "3" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "EyeOff": {
    "nodes": [
      ["path", { "d": "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" }],
      ["path", { "d": "M6.61 6.61A18.15 18.15 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" }],
      ["path", { "d": "M14.12 14.12a3 3 0 1 1-4.24-4.24" }],
      ["path", { "d": "m2 2 20 20" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Lock": {
    "nodes": [
      ["rect", { "x": "3", "y": "11", "width": "18", "height": "11", "rx": "2" }],
      ["path", { "d": "M7 11V7a5 5 0 0 1 10 0v4" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "LockOpen": {
    "nodes": [
      ["rect", { "x": "3", "y": "11", "width": "18", "height": "11", "rx": "2" }],
      ["path", { "d": "M7 11V7a5 5 0 0 1 9.9-1" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },

  /*
   * Layer-row type marks. One per kind the tree can tell apart from the DOM:
   * a box for an element, a T for a text run, a picture for an image, and the
   * diamond cluster for a React component — which is the only one that also
   * gets a colour (`tokens.color.component`), because it is the only one whose
   * distinction survives being read at a glance.
   */
  "Square": {
    "nodes": [["rect", { "x": "3", "y": "3", "width": "18", "height": "18", "rx": "2" }]],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Type": {
    "nodes": [
      ["path", { "d": "M4 7V4h16v3" }],
      ["path", { "d": "M9 20h6" }],
      ["path", { "d": "M12 4v16" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Image": {
    "nodes": [
      ["rect", { "x": "3", "y": "3", "width": "18", "height": "18", "rx": "2" }],
      ["circle", { "cx": "9", "cy": "9", "r": "2" }],
      ["path", { "d": "m21 15-3.09-3.09a2 2 0 0 0-2.83 0L6 21" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "Component": {
    "nodes": [
      ["path", { "d": "M12 2.6 15.4 6 12 9.4 8.6 6Z" }],
      ["path", { "d": "M18 8.6 21.4 12 18 15.4 14.6 12Z" }],
      ["path", { "d": "M6 8.6 9.4 12 6 15.4 2.6 12Z" }],
      ["path", { "d": "M12 14.6 15.4 18 12 21.4 8.6 18Z" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },

  /*
   * The alignment strip.
   *
   * Six marks, read as a pair of triples: three that move the child along the
   * inline axis and three along the block axis. Each is a rule at the edge the
   * press aligns TO plus the bars that move — so the mark states the outcome,
   * not the direction of travel, which is what makes a strip of six legible
   * without labels.
   */
  "AlignStartVertical": {
    "nodes": [
      ["rect", { "x": "6", "y": "14", "width": "9", "height": "6", "rx": "2" }],
      ["rect", { "x": "6", "y": "4", "width": "16", "height": "6", "rx": "2" }],
      ["path", { "d": "M2 2v20" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "AlignCenterVertical": {
    "nodes": [
      ["path", { "d": "M12 2v20" }],
      ["path", { "d": "M8 10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" }],
      ["path", { "d": "M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" }],
      ["path", { "d": "M8 20H7a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1" }],
      ["path", { "d": "M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "AlignEndVertical": {
    "nodes": [
      ["rect", { "x": "2", "y": "4", "width": "16", "height": "6", "rx": "2" }],
      ["rect", { "x": "9", "y": "14", "width": "9", "height": "6", "rx": "2" }],
      ["path", { "d": "M22 22V2" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "AlignStartHorizontal": {
    "nodes": [
      ["rect", { "x": "4", "y": "6", "width": "6", "height": "16", "rx": "2" }],
      ["rect", { "x": "14", "y": "6", "width": "6", "height": "9", "rx": "2" }],
      ["path", { "d": "M22 2H2" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "AlignCenterHorizontal": {
    "nodes": [
      ["path", { "d": "M2 12h20" }],
      ["path", { "d": "M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" }],
      ["path", { "d": "M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" }],
      ["path", { "d": "M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" }],
      ["path", { "d": "M14 8V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "AlignEndHorizontal": {
    "nodes": [
      ["rect", { "x": "4", "y": "2", "width": "6", "height": "16", "rx": "2" }],
      ["rect", { "x": "14", "y": "9", "width": "6", "height": "9", "rx": "2" }],
      ["path", { "d": "M22 22H2" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  /** Distribute: the two rules plus the gap the press opens between them. */
  "SpaceBetweenHorizontal": {
    "nodes": [
      ["rect", { "x": "3", "y": "5", "width": "6", "height": "14", "rx": "2" }],
      ["rect", { "x": "15", "y": "7", "width": "6", "height": "10", "rx": "2" }],
      ["path", { "d": "M3 2v20" }],
      ["path", { "d": "M21 2v20" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "SpaceBetweenVertical": {
    "nodes": [
      ["rect", { "x": "5", "y": "15", "width": "14", "height": "6", "rx": "2" }],
      ["rect", { "x": "7", "y": "3", "width": "10", "height": "6", "rx": "2" }],
      ["path", { "d": "M2 21h20" }],
      ["path", { "d": "M2 3h20" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },

  /*
   * Arrange. Our "front" and "back" are positions among JSX SIBLINGS, not a
   * z-index — so the marks are travel-to-a-limit and travel-one-step, which is
   * what reordering source order actually does.
   */
  "ArrowUpToLine": {
    "nodes": [
      ["path", { "d": "M5 3h14" }],
      ["path", { "d": "m18 13-6-6-6 6" }],
      ["path", { "d": "M12 7v14" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "ArrowDownToLine": {
    "nodes": [
      ["path", { "d": "M12 17V3" }],
      ["path", { "d": "m6 11 6 6 6-6" }],
      ["path", { "d": "M19 21H5" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "ArrowUp": {
    "nodes": [
      ["path", { "d": "m5 12 7-7 7 7" }],
      ["path", { "d": "M12 19V5" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
  "ArrowDown": {
    "nodes": [
      ["path", { "d": "M12 5v14" }],
      ["path", { "d": "m19 12-7 7-7-7" }],
    ],
    "rootFill": "none",
    "rootStroke": "currentColor",
  },
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
 * The chrome's ink tier: 20 of the 24 grid, edge to edge.
 *
 * One budget, declared where the glyphs are DRAWN. A family that reads uneven
 * is never fixed at the call site — `icon(name, 14)` for the heavy one shrinks
 * its stroke along with its extent, which trades a size error for a weight
 * error. The drawer knows how much of the grid each glyph inks, so it is the
 * only place that can spend the same amount on all of them.
 */
const INK_BUDGET = 20

/**
 * Fit a glyph's declared ink to the budget by resizing its WINDOW.
 *
 * Widening the viewBox around the grid's centre scales the drawing down inside
 * a box of unchanged pixel size, which is exactly what a heavier glyph needs
 * and costs nothing at the call site. It is only sound for a FILLED glyph: a
 * stroked one would have its stroke scaled too and come back lighter than the
 * family, so a stroked glyph declares no ink and is re-solved in its path data
 * instead — see the note above `RotateCcw`. `icon-cases.mjs` holds that line.
 */
function inkViewBox(data: IconData): string {
  if (!data.ink || data.ink === INK_BUDGET) return "0 0 24 24"
  const side = (24 * data.ink) / INK_BUDGET
  const origin = 12 - side / 2
  return `${origin} ${origin} ${side} ${side}`
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
  svg.setAttribute("viewBox", inkViewBox(data))
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
