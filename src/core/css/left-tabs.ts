/**
 * The LEFT panel's tab host — and almost nothing else, on purpose.
 *
 * The left panel used to be one list: a header, a filter, and the layer tree,
 * appended straight into `.de-panel-body` and scrolled as a whole. It is now
 * two views, Layers and Assets, because the library stopped being something you
 * read about the current selection and became something you BROWSE — a
 * catalogue of components you go looking through and then place. A browsing
 * surface belongs beside the other browsing surface, which is the tree.
 *
 * ## Why this file is two rules long
 *
 * The strip itself reuses `.de-tabs` / `.de-tab` / `.de-tabpanel` from
 * `css/inspector.ts` rather than restating them under a `de-left-` prefix. Two
 * tab strips in one piece of chrome are one control the user learns once, and a
 * second copy of that stylesheet is a promise to keep two sets of measurements
 * in step forever — which is a promise nothing enforces. Sharing it is also
 * what keeps the two strips reading as one control through a restyle: when the
 * right panel traded its underlined icon+label tabs for Figma's neutral pills,
 * Layers and Assets became pills in the same commit, because there was only
 * ever one rule to change. Two words in a 240px panel fit with room to spare,
 * so the left strip inherits a scroller it rarely needs and costs nothing for
 * it — the seam is draggable, so "rarely" is the honest word, not "never".
 *
 * What is genuinely LEFT-specific is the pair of rules below, and both are
 * about the panel body rather than about the strip. Nothing in here reaches
 * into either pane's own content: the tree and the assets browser each bring
 * their own header, inset and rhythm, and a rule out here imposing padding or a
 * flex basis on `.de-tabpanel > *` would be this file overruling two surfaces it
 * does not own.
 *
 * ## Ordering
 *
 * Registered after `panels.ts`, and for the same reason `inspector.ts` is: it
 * re-lays out `.de-panel-body`, which `panels.ts` has already declared, and it
 * has to win on equal specificity. It sits directly after `inspector.ts` only
 * so the two panel-body overrides read as a pair; they select different panels
 * and could not collide.
 */

export const leftTabsCss = `/* ---------- left panel tabs ---------- */
/*
 * The mirror of the right panel's body: a fixed strip over one scrolling pane,
 * instead of one scroll containing everything.
 *
 * Stated as its own rule rather than folded into a
 * \`.de-panel--left, .de-panel--right\` list, because the two are not the same
 * claim and will not stay the same shape — they are owned by different lanes
 * and the right panel's version carries its own reasoning beside it. The
 * selector is deliberately no stronger than the one it overrides.
 *
 * Nothing here names a width. The panels are resizable: \`.de-panel--left\` is a
 * flex child of \`.de-rail\` whose width is a MotionValue the resize lane writes
 * inline, and the live number is published as \`--de-left\` on the document
 * element. \`tokens.size.panelWidth\` is only the width the chrome MOUNTS with,
 * so anything needing to know how wide the panel is right now reads the custom
 * property and never the token.
 */
.de-panel--left .de-panel-body {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
 * The pane clips sideways instead of growing a scrollbar.
 *
 * \`.de-tabpanel\` asks for \`overflow-y: auto\` and says nothing about the other
 * axis — and a box with one axis \`visible\` and the other not computes the
 * visible one to \`auto\`, so the pane would scroll horizontally too. On the
 * right that is harmless, because every control in the inspector is built to
 * the panel's width. On the left it is not: a layer row is \`white-space: nowrap\`
 * by design, so one deeply indented node with a long component name would hang
 * a horizontal scrollbar under the whole tree — furniture across the bottom of
 * the panel, reporting an overflow the clipped name already reports.
 *
 * This is what the panel did before the tabs existed, since \`.de-panel\` is
 * \`overflow: hidden\` and the body only ever scrolled vertically. It restores
 * the behaviour rather than choosing a new one.
 */
.de-panel--left .de-tabpanel {
  overflow-x: hidden;
}
`
