import { config, type DesignSystemToken } from "../../core/config"
import {
  authoredTokenMatches,
  computedTokenMatches,
  textStyleSignature,
  tokenSourceSpelling,
  tokenStyleWrites,
  type DesignSystemMatch,
  type DesignTokenProperty,
} from "../../core/design-system"
import { el } from "../../core/dom"
import { toSourceRef } from "../../core/bridge"
import { elementKey } from "../../core/store"
import type { Selection } from "../../core/types"
import { section, selectField } from "./field"
import type { InspectorSection, SectionContext } from "./index"

interface RowSpec {
  property: DesignTokenProperty
  label: string
  target: Selection
  inlineValue: string
  computedValue: string
  displayValue: string
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

function tokenList(property: DesignTokenProperty): DesignSystemToken[] {
  const ds = config.designSystem
  if (property === "text-style") return [...ds.textStyles, ...ds.uiTextStyles]
  if (property === "fill-color" || property === "text-color" || property === "stroke-color") return ds.colors
  if (property === "corner-radius") return ds.radii
  if (property === "shadow") return ds.effects
  if (property === "icon-size") return ds.icons
  return ds.spacing
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

function cssProperty(property: DesignTokenProperty): string {
  if (property === "fill-color") return "background-color"
  if (property === "text-color") return "color"
  if (property === "stroke-color") return "border-color"
  if (property === "corner-radius") return "border-radius"
  if (property === "shadow") return "box-shadow"
  if (property === "gap") return "gap"
  if (property === "padding") return "padding"
  if (property === "icon-size") return "width"
  return "font-size"
}

function tokenResolvedLabel(spec: RowSpec, token: DesignSystemToken): string {
  if (spec.property === "text-style") {
    const value = token.values.default
    if (!value || typeof value !== "object") return "compound style"
    const shape = value as Record<string, unknown>
    const weight = typeof shape.fontWeight === "number" ? ` · ${shape.fontWeight}` : ""
    return `${shape.fontSize ?? "?"}/${shape.lineHeight ?? "?"}${weight}`
  }
  const writes = tokenStyleWrites(spec.property, token)
  if (!writes.length) return "unavailable"
  const first = writes[0].value
  const variables = first.match(/^var\((--[\w-]+)\)$/)
  return variables
    ? resolvedCssValue(spec.target.element, writes[0].property, variables[1]) || first
    : first
}

function matchFor(spec: RowSpec): DesignSystemMatch[] {
  const classes = Array.from(spec.target.element.classList)
  const authored = authoredTokenMatches(spec.property, spec.inlineValue, classes)
  if (authored.length) return authored
  return computedTokenMatches(
    spec.property,
    spec.computedValue,
    config.designSystem,
    (variable) => resolvedCssValue(spec.target.element, cssProperty(spec.property), variable)
  )
}

function tokenRow(context: SectionContext, spec: RowSpec): HTMLElement {
  const tokens = tokenList(spec.property)
  const matches = matchFor(spec)
  const selected = matches.length === 1 ? matches[0].token.id : ""
  const custom = matches.length > 1
    ? `Multiple matches: ${matches.length}`
    : `Custom: ${spec.displayValue}`
  const picker = selectField({
    id: `design-system.${spec.property}`,
    label: `${spec.label} token`,
    value: selected,
    options: [
      { value: "", label: custom },
      ...tokens.map((token) => ({
        value: token.id,
        label: `${token.name} · ${tokenSourceSpelling(token)} · ${tokenResolvedLabel(spec, token)}`,
      })),
    ],
    onCommit: (id) => {
      if (!id) return
      const token = tokens.find((entry) => entry.id === id)
      if (!token) return
      const writes = tokenStyleWrites(spec.property, token)
      if (!writes.length) {
        context.editor.toast(`${token.name} cannot be written to this element`, "error")
        return
      }
      context.writer.applyStyles(spec.target, writes, `Apply ${token.name}`)
      context.invalidate()
    },
  })

  const status = matches.length
    ? `${matches[0].via === "authored" ? "Bound" : "Value matches"}: ${matches
        .map((match) => `${match.token.name} (${match.source})`)
        .join(" · ")}`
    : `Custom value: ${spec.displayValue}`

  return el("div", { class: "de-stack" }, [
    el("div", { class: "de-layout-group-title" }, [spec.label]),
    picker,
    el("div", { class: "de-hint" }, [status]),
  ])
}

function rowSpecs(context: SectionContext): RowSpec[] {
  const { selection, computed } = context
  const element = selection.element
  const rows: RowSpec[] = [
    {
      property: "fill-color",
      label: "Fill color",
      target: selection,
      inlineValue: element.style.getPropertyValue("background-color"),
      computedValue: computed.backgroundColor,
      displayValue: computed.backgroundColor,
    },
  ]

  if (directText(element)) {
    const letterSpacing = Number.parseFloat(computed.letterSpacing)
    rows.push(
      {
        property: "text-color",
        label: "Text color",
        target: selection,
        inlineValue: element.style.getPropertyValue("color"),
        computedValue: computed.color,
        displayValue: computed.color,
      },
      {
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
        displayValue: `${computed.fontSize} / ${computed.lineHeight} · ${computed.fontWeight}`,
      }
    )
  }

  const borderWidth = Math.max(
    number(computed.borderTopWidth),
    number(computed.borderRightWidth),
    number(computed.borderBottomWidth),
    number(computed.borderLeftWidth)
  )
  if (borderWidth > 0 || Array.from(element.classList).some((name) => /^border(?:-|$)/.test(name))) {
    rows.push({
      property: "stroke-color",
      label: "Stroke color",
      target: selection,
      inlineValue: element.style.getPropertyValue("border-color"),
      computedValue: computed.borderTopColor,
      displayValue: computed.borderTopColor,
    })
  }

  const radii = [computed.borderTopLeftRadius, computed.borderTopRightRadius, computed.borderBottomRightRadius, computed.borderBottomLeftRadius]
  const radius = uniform(radii)
  rows.push({
    property: "corner-radius",
    label: "Corner radius",
    target: selection,
    inlineValue: element.style.getPropertyValue("border-radius"),
    computedValue: radius ?? "mixed",
    displayValue: radius ?? "Mixed",
  })

  if (computed.boxShadow !== "none" || Array.from(element.classList).some((name) => /^shadow(?:-|$)/.test(name))) {
    rows.push({
      property: "shadow",
      label: "Shadow / effect",
      target: selection,
      inlineValue: element.style.getPropertyValue("box-shadow"),
      computedValue: computed.boxShadow,
      displayValue: computed.boxShadow,
    })
  }

  if (computed.display === "flex" || computed.display === "inline-flex" || computed.display === "grid" || computed.display === "inline-grid") {
    rows.push({
      property: "gap",
      label: "Container gap",
      target: selection,
      inlineValue: element.style.getPropertyValue("gap"),
      computedValue: computed.gap,
      displayValue: computed.gap,
    })
  }

  if (element.childElementCount > 0) {
    const padding = uniform([computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft])
    rows.push({
      property: "padding",
      label: "Uniform padding",
      target: selection,
      inlineValue: element.style.getPropertyValue("padding"),
      computedValue: padding ?? "mixed",
      displayValue: padding ?? "Mixed",
    })
  }

  const icon = iconTarget(context)
  if (icon) {
    const iconStyle = getComputedStyle(icon.element)
    rows.push({
      property: "icon-size",
      label: "Icon size",
      target: icon,
      inlineValue: `${icon.element.style.width} ${icon.element.style.height}`,
      computedValue: iconStyle.width,
      displayValue: `${iconStyle.width} × ${iconStyle.height}`,
    })
  }

  return rows.filter((row) => tokenList(row.property).length > 0)
}

export const designSystemSection: InspectorSection = (context) => {
  const rows = rowSpecs(context)
  if (!rows.length) return null
  return section("Design system", el("div", { class: "de-stack" }, rows.map((spec) => tokenRow(context, spec))))
}
