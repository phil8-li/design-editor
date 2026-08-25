import { config, type DesignSystemToken } from "../../core/config"
import {
  authoredTokenMatches,
  computedTokenMatches,
  plainValue,
  textStyleSignature,
  tokenCssProperty,
  tokenNameParts,
  tokenPreviewKind,
  tokenStyleWrites,
  tokenSwatchCss,
  tokenTextPair,
  tokensForProperty,
  type DesignSystemMatch,
  type DesignTokenProperty,
} from "../../core/design-system"
import { el } from "../../core/dom"
import { toSourceRef } from "../../core/bridge"
import { elementKey } from "../../core/store"
import type { Selection } from "../../core/types"
import { isExpanded, miniButton, section, setExpanded } from "./field"
import { tokenField, type TokenChoice, type TokenPreview } from "./token-picker"
import type { InspectorSection, SectionContext } from "./index"

interface RowSpec {
  property: DesignTokenProperty
  label: string
  target: Selection
  inlineValue: string
  computedValue: string
}

const SIDES = ["top", "right", "bottom", "left"] as const
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const

/** Panel-level, so opening the precision group survives the rebuild each write causes. */
const PRECISION_EXPANDER = "design-system.precision"

/** Tailwind v4's registered initial for `--tw-ring-shadow`: present, but not a ring. */
const RING_SHADOW_NONE = "0 0 #0000"

/**
 * Why a token this row lists is offered but inert. The engine only knows "no
 * writes"; the sentence belongs here, before the click, because a toast
 * afterwards is how a designer ends up trying all nine springs one at a time.
 * Worded as a design fact — a bounce that cannot arrive — rather than as the
 * mechanism, which is the machine's business and not the designer's.
 */
const UNWRITABLE_REASON: Partial<Record<DesignTokenProperty, string>> = {
  "motion-duration": "only a spring with no bounce arrives intact",
}

/** Computed style reports no value for a shorthand, so these read back from their parts. */
const LONGHANDS: Partial<Record<DesignTokenProperty, readonly string[]>> = {
  "corner-radius": CORNERS.map((corner) => `border-${corner}-radius`),
  padding: SIDES.map((side) => `padding-${side}`),
  margin: SIDES.map((side) => `margin-${side}`),
}

function directText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
  )
}

function uniform(values: string[]): string | null {
  return values.every((value) => value === values[0]) ? values[0] : null
}

function number(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasUtility(element: Element, stem: string): boolean {
  return Array.from(element.classList).some((name) => new RegExp(`^${stem}(?:-|$)`).test(name))
}

/** Only a flex or grid box has a gap to bind; on anything else the row would be inert. */
function laysOutChildren(computed: CSSStyleDeclaration): boolean {
  return /^(inline-)?(flex|grid)$/.test(computed.display)
}

function describeElement(context: SectionContext, element: Element): Selection {
  const info = context.editor.bridge.elementInfo(element)
  const componentName = info?.componentName || element.tagName.toLowerCase()
  return {
    // SVG nodes have the same class/style/parent surface Writer uses. Selection
    // remains HTMLElement-shaped elsewhere because canvas selection normalises
    // icons to their host; this local target lets an icon-only host edit its SVG.
    element: element as HTMLElement,
    tagName: element.tagName.toLowerCase(),
    componentName,
    source: toSourceRef(info),
    key: elementKey(element as HTMLElement, componentName, info?.lineNumber ?? 0),
  }
}

function iconTarget(context: SectionContext): Selection | null {
  const { selection } = context
  const element = selection.element
  if (element.tagName === "IMG" || element.getAttribute("role") === "img") return selection
  const children = Array.from(element.children)
  const svg = children.length === 1 && children[0] instanceof SVGElement ? children[0] : null
  return svg && !directText(element) ? describeElement(context, svg) : null
}

/** `fill`/`stroke` paint nothing on an HTML box, so those rows need a real SVG. */
function svgTarget(context: SectionContext): Selection | null {
  if (context.selection.element.closest("svg")) return context.selection
  const icon = iconTarget(context)
  return icon && icon.element instanceof SVGElement ? icon : null
}

function resolvedCssValue(element: Element, property: string, variable: string): string {
  const raw = getComputedStyle(element).getPropertyValue(variable).trim()
  if (!raw) return ""
  const probe = document.createElement("span")
  probe.setAttribute("data-design-editor", "")
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none"
  probe.style.setProperty(property, raw)
  document.body.append(probe)
  const resolved = getComputedStyle(probe).getPropertyValue(property).trim()
  probe.remove()
  return resolved || raw
}

function row(
  property: DesignTokenProperty,
  label: string,
  target: Selection,
  style: CSSStyleDeclaration
): RowSpec {
  const css = tokenCssProperty(property)
  const parts = LONGHANDS[property]
  const value = parts
    ? uniform(parts.map((name) => style.getPropertyValue(name).trim()))
    : style.getPropertyValue(css).trim()
  return {
    property,
    label,
    target,
    inlineValue: target.element.style.getPropertyValue(css),
    computedValue: value ?? "mixed",
  }
}

function matchFor(spec: RowSpec): DesignSystemMatch[] {
  const classes = Array.from(spec.target.element.classList)
  const authored = authoredTokenMatches(spec.property, spec.inlineValue, classes)
  if (authored.length) return authored
  return computedTokenMatches(
    spec.property,
    spec.computedValue,
    config.designSystem,
    (variable) => resolvedCssValue(spec.target.element, tokenCssProperty(spec.property), variable)
  )
}

/** A token's own preview, in the one shape the picker knows how to draw. */
function tokenPreview(spec: RowSpec, token: DesignSystemToken): TokenPreview {
  const kind = tokenPreviewKind(spec.property)
  if (kind === "text") {
    const shape = (token.values.default ?? {}) as Record<string, unknown>
    return { kind: "text", fontSize: typeof shape.fontSize === "number" ? shape.fontSize : 12 }
  }
  if (kind === "radius") {
    return { kind: "radius", px: typeof token.values.default === "number" ? token.values.default : 0 }
  }
  const css = kind === "color" ? tokenSwatchCss(token) : null
  return css ? { kind: "color", css } : { kind: "none" }
}

/** The element's own value in the same shape, for a field with nothing bound. */
function valuePreview(spec: RowSpec): TokenPreview {
  const kind = tokenPreviewKind(spec.property)
  if (kind === "color") {
    // The computed value, not a resolved literal: a `var()` here still paints,
    // because the swatch lives in the same document the app is themed in.
    return spec.computedValue === "mixed" ? { kind: "none" } : { kind: "color", css: spec.computedValue }
  }
  if (kind === "text") return { kind: "text", fontSize: number(spec.computedValue.split("|")[0]) || 12 }
  if (kind === "radius") return { kind: "radius", px: number(spec.computedValue) }
  return { kind: "none" }
}

function tokenChoice(spec: RowSpec, token: DesignSystemToken): TokenChoice {
  const { group, leaf } = tokenNameParts(token)
  return {
    id: token.id,
    group,
    leaf,
    name: token.name,
    preview: tokenPreview(spec, token),
    detail: spec.property === "text-style" ? tokenTextPair(token) : "",
    disabled: tokenStyleWrites(spec.property, token).length === 0,
  }
}

function tokenRow(context: SectionContext, spec: RowSpec): HTMLElement {
  const tokens = tokensForProperty(spec.property)
  const matches = matchFor(spec)
  // One exact match is a binding. An alias that changes meaning across theme or
  // scope is not, and neither are two candidates, so the field falls back to the
  // element's own value rather than naming a token it cannot vouch for.
  const bound = matches.length === 1 && !matches[0].ambiguous ? matches[0].token.id : ""
  const field = tokenField({
    id: `design-system.${spec.property}`,
    title: spec.label,
    selectedId: bound,
    choices: tokens.map((token) => tokenChoice(spec, token)),
    fallback: {
      preview: valuePreview(spec),
      text: spec.computedValue === "mixed" ? "Mixed" : plainValue(spec.property, spec.computedValue) || "—",
    },
    onCommit: (id) => {
      const token = tokens.find((entry) => entry.id === id)
      if (!token) return
      const writes = tokenStyleWrites(spec.property, token)
      if (!writes.length) {
        context.editor.toast(`${token.name} cannot be applied here`, "error")
        return
      }
      context.writer.applyStyles(spec.target, writes, `Apply ${token.name}`)
      context.invalidate()
    },
  })

  const inert = tokens.filter((token) => !tokenStyleWrites(spec.property, token).length)

  return el("div", { class: "de-stack" }, [
    el("div", { class: "de-layout-group-title" }, [spec.label]),
    field,
    inert.length
      ? el("div", { class: "de-hint" }, [
          `Unavailable — ${UNWRITABLE_REASON[spec.property] ?? "this element has nothing to carry them"}: ${inert
            .map((token) => token.name)
            .join(", ")}`,
        ])
      : null,
  ])
}

/** The axes a designer reaches for on any element, in Figma's paint-then-box order. */
function commonRows(context: SectionContext): RowSpec[] {
  const { selection, computed } = context
  const element = selection.element
  const rows: RowSpec[] = [row("fill-color", "Fill color", selection, computed)]

  if (directText(element)) {
    const letterSpacing = Number.parseFloat(computed.letterSpacing)
    rows.push(row("text-color", "Text color", selection, computed), {
      property: "text-style",
      label: "Text style",
      target: selection,
      inlineValue: ["font-size", "line-height", "font-weight", "letter-spacing"]
        .map((property) => element.style.getPropertyValue(property))
        .join(" "),
      computedValue: textStyleSignature({
        fontSize: number(computed.fontSize),
        lineHeight: number(computed.lineHeight),
        fontWeight: number(computed.fontWeight),
        letterSpacing: Number.isFinite(letterSpacing) ? letterSpacing : 0,
      }),
    })
  }

  const borderWidth = Math.max(...SIDES.map((side) => number(computed.getPropertyValue(`border-${side}-width`))))
  if (borderWidth > 0 || hasUtility(element, "border")) {
    rows.push({
      property: "stroke-color",
      label: "Stroke color",
      target: selection,
      inlineValue: element.style.getPropertyValue("border-color"),
      computedValue: computed.borderTopColor,
    })
  }
  // A Tailwind v4 ring is a box-shadow, so the rendered proof it exists is the
  // custom property that shadow reads rather than any border on the box. But v4
  // REGISTERS that property with an initial value, so it resolves on every
  // element in the document — measured 1958 of 1958 on /ds. Only a value other
  // than the transparent initial is a ring; a non-empty string is just Tailwind.
  const ringShadow = computed.getPropertyValue("--tw-ring-shadow").trim()
  if ((ringShadow && ringShadow !== RING_SHADOW_NONE) || hasUtility(element, "ring")) {
    rows.push(row("ring-color", "Ring color", selection, computed))
  }
  if ((number(computed.outlineWidth) > 0 && computed.outlineStyle !== "none") || hasUtility(element, "outline")) {
    rows.push(row("outline-color", "Outline color", selection, computed))
  }

  const svg = svgTarget(context)
  if (svg) {
    const svgStyle = getComputedStyle(svg.element)
    rows.push(row("svg-fill", "SVG fill", svg, svgStyle), row("svg-stroke", "SVG stroke", svg, svgStyle))
  }

  rows.push(row("corner-radius", "Corner radius", selection, computed))
  if (computed.boxShadow !== "none" || hasUtility(element, "shadow")) {
    rows.push(row("shadow", "Shadow / effect", selection, computed))
  }
  if (laysOutChildren(computed)) rows.push(row("gap", "Container gap", selection, computed))
  if (element.childElementCount > 0) rows.push(row("padding", "Uniform padding", selection, computed))

  const icon = iconTarget(context)
  if (icon) {
    const iconStyle = getComputedStyle(icon.element)
    rows.push({
      property: "icon-size",
      label: "Icon size",
      target: icon,
      inlineValue: `${icon.element.style.width} ${icon.element.style.height}`,
      computedValue: iconStyle.width,
    })
  }

  if (number(computed.transitionDuration) > 0) {
    rows.push(row("motion-duration", "Motion duration", selection, computed))
  }
  return rows
}

/** The per-side, per-corner and per-axis half of the vocabulary — precision on request. */
function precisionRows(context: SectionContext): RowSpec[] {
  const { selection, computed } = context
  const element = selection.element
  const rows: RowSpec[] = []

  const radii = CORNERS.map((corner) => computed.getPropertyValue(`border-${corner}-radius`))
  if (radii.some((value) => number(value) > 0) || hasUtility(element, "rounded")) {
    rows.push(
      ...CORNERS.map((corner) =>
        row(`corner-radius-${corner}`, `Radius ${corner.replace("-", " ")}`, selection, computed)
      )
    )
  }
  if (laysOutChildren(computed)) {
    rows.push(row("row-gap", "Row gap", selection, computed), row("column-gap", "Column gap", selection, computed))
  }
  if (element.childElementCount > 0) {
    rows.push(...SIDES.map((side) => row(`padding-${side}`, `Padding ${side}`, selection, computed)))
  }
  rows.push(
    row("margin", "Uniform margin", selection, computed),
    ...SIDES.map((side) => row(`margin-${side}`, `Margin ${side}`, selection, computed))
  )
  return rows
}

export const designSystemSection: InspectorSection = (context) => {
  const stocked = (specs: RowSpec[]) => specs.filter((spec) => tokensForProperty(spec.property).length > 0)
  const common = stocked(commonRows(context))
  const precision = stocked(precisionRows(context))
  if (!common.length && !precision.length) return null

  const open = isExpanded(PRECISION_EXPANDER)
  const toggle = miniButton({
    label: open ? "Hide per-side tokens" : "Show per-side tokens",
    glyph: open ? "⊟" : "⊞",
    pressed: open,
    onClick: () => {
      setExpanded(PRECISION_EXPANDER, !open)
      context.invalidate()
    },
  })

  const body = el("div", { class: "de-stack" }, [
    ...common.map((spec) => tokenRow(context, spec)),
    precision.length
      ? el("div", { class: "de-layout-group" }, [
          el("div", { class: "de-row" }, [
            el("div", { class: "de-layout-group-title", style: "flex:1" }, ["Per side, corner and axis"]),
            toggle,
          ]),
          // Built only when open: twenty selects a designer is not looking at
          // still cost a resolved-value probe per option, on every panel rebuild.
          ...(open ? precision.map((spec) => tokenRow(context, spec)) : []),
        ])
      : null,
  ])
  return section("Design system", body)
}
