/**
 * The Libraries section: the installed rows, the add-by-URL CTA and the switch.
 *
 * One sheet for a surface that is almost entirely LISTS OF PLACES in a 260px
 * column, which is what every rule below is really solving for. A library is
 * named by a path or a URL, and neither string has a natural width — so the
 * name shrinks with an ellipsis, the source line truncates and carries itself
 * in a `title`, and the controls beside them are `flex: none` so that a deeply
 * nested token file can never push a remove button off the panel.
 *
 * NOTHING HERE DRAWS A PANEL ANY MORE. This was a tab with a header bar of its
 * own, then a dialog; it is a `section()` on the Design system tab now, so the
 * heading, the fold, the 8px side padding and the gap between rows all come
 * from `.de-section-header` / `.de-section-body` in `css/panels.ts`. Every rule
 * that restated one of those is gone rather than adjusted — a second opinion
 * about a section's padding is how two sections in one column end up a pixel
 * apart.
 *
 * The depth grammar is three rungs and it carries meaning rather than
 * decoration: the local-file fold is a WELL (`bgSunken`) because it is a drawer
 * that opened inside the section, an enabled library is a RAISED card because
 * it is contributing to every picker on the Design tab right now, and a
 * disabled one drops back to the panel ground. That last step is the second
 * channel on the switch — where the knob is, and whether the card it sits on is
 * still there — so the on state survives greyscale and a glance.
 */

import { tokens as t, nest } from "../tokens"

/**
 * The local-file drawer, and the one container in this sheet that holds a
 * rounded child in a rounded corner.
 *
 * Everything else here is a card in a flat list — the section body spaces them
 * and nothing sits inside anything. The drawer is different: it is a well with
 * bordered candidate rows stacked in it and a path field across its foot, so
 * its top corners hold a `.de-lib-candidate` and its bottom corners hold a
 * `.de-lib-field` and a `.de-button`. Three rounded things in four corners, and
 * `nest()` is what stops them being three separate guesses.
 *
 * `radius.lg` over `space.sm` rather than the `radius.md` over `space.md` this
 * started as, and the inset is what was actually wrong. Two of those three
 * children are SHARED furniture drawn at `radius.md` by rules this sheet does
 * not own, so the only inset that leaves them concentric is one that computes
 * back to `md` — 12 − 4 = 8. An 8px inset would have demanded they all square
 * off, which is a stack of hard-cornered cards in a soft-cornered well, and the
 * `.de-lint-ignored-row` note in `test/concentric-cases.mjs` records the same
 * call being made the same way: move the container, not the shared child.
 *
 * It also lands the drawer on exactly the geometry `.de-app-menu` and
 * `.de-layer-menu` already use, which is the right company — all three are a
 * soft container holding a short list of rows.
 */
const DRAWER = nest({ of: ".de-lib-panel", outer: t.radius.lg, inset: t.space.sm })

export const librariesCss = `/* ---------- libraries section ---------- */
.de-lib { display: flex; flex-direction: column; gap: ${t.space.lg}px; }

/* The count rides in the section header's actions track, beside the chevron, so
   it lands on the same column as Fill's and Effects' \`+\`. Dim and tabular,
   because it is a quantity beside a word and not a second half of the title. It
   is empty at zero — see the render comment — and the track simply collapses. */
.de-lib-count { color: ${t.color.textDim}; font-variant-numeric: tabular-nums; }

/* ---------- the installed list ---------- */
.de-lib-list { display: flex; flex-direction: column; gap: ${t.space.md}px; }
.de-lib-list:empty { display: none; }
/*
 * An enabled library is a raised card; a disabled one is the panel ground with
 * an outline.
 *
 * Not \`opacity\`, which is what a dimmed row usually gets here. The off state
 * has to leave the switch and the remove button at full contrast — they are the
 * two controls a reader is most likely to want on exactly the card that is off
 * — and a fade over the whole card takes the ink of the control down with the
 * card's own. Dropping the SURFACE says the same thing and touches nothing a
 * pointer is aimed at.
 */
.de-lib-card {
  display: flex; flex-direction: column; gap: ${t.space.sm}px;
  padding: ${t.space.md}px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.lg};
  background: ${t.color.bgRaised};
  transition: background ${t.duration.fast} ${t.ease};
}
.de-lib-card--off { background: transparent; }

/* Name, badge and controls on one line — the only line of a row that has a
   fixed shape, which is why the variable-width part of it is the one that
   shrinks. */
.de-lib-line { display: flex; align-items: center; gap: ${t.space.sm}px; }
.de-lib-name {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: ${t.color.text}; font-size: ${t.type.body}; font-weight: ${t.type.weightValue};
}
/*
 * The kind, as a plate rather than an eyebrow.
 *
 * On \`body\` and not \`micro\` for the reason \`css/options.ts\` gives about its
 * own tags: 10px is three quarters of the readable floor and the size at which
 * a word stops being read and starts being recognised by shape. The plate is
 * what gives it rank; the size does not have to.
 */
.de-lib-kind {
  flex: none;
  padding: 0 ${t.space.sm}px;
  border-radius: ${t.radius.sm};
  background: ${t.color.bgHover}; color: ${t.color.textMuted};
  font-size: ${t.type.body}; font-weight: ${t.type.weightValue};
}
/* What the library brings, in the server's words or in counted groups. It is
   the one line on the row that is allowed to wrap: it is a sentence, and three
   clauses of it at 180px is two lines however it is cut. */
.de-lib-detail { color: ${t.color.textMuted}; font-size: ${t.type.body}; line-height: 1.4; }
/*
 * Where it came from, on ONE line with an ellipsis.
 *
 * This used to \`break-all\` and wrap, which was right when every library was a
 * project-relative path of three or four segments. A URL is not that: a
 * Storybook address with a query on it wraps to four lines of monospace and
 * makes the source the tallest thing on a row whose subject is the library's
 * name. The whole string is in \`title\` either way, so nothing is lost by
 * cutting it.
 */
.de-lib-path {
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ${t.font.mono}; font-size: ${t.type.body};
  color: ${t.color.textDim};
}
.de-lib-actions { display: inline-flex; align-items: center; gap: ${t.space.sm}px; flex: none; }
.de-lib-hint { margin: 0; color: ${t.color.textDim}; font-size: ${t.type.body}; line-height: 1.4; }
/* After \`.de-lib-hint\` on purpose: a failed scan wears both classes, and at
   equal specificity the later rule is what makes the tint win. */
.de-lib-error { color: ${t.color.danger}; font-size: ${t.type.body}; line-height: 1.4; }

/* ---------- the empty state ---------- */
/*
 * A sentence, at the Design tab's own note rank: 11px, dim, 1.4.
 *
 * Deliberately not \`.de-empty\`, which is centred text with 24px of air above
 * and below it — that box is for a PANE with nothing in it, and this is one
 * section of a tab that has another section directly underneath. The 24px would
 * push DS Lint down by a row and a half to announce a list that is one line
 * long. Same treatment as \`.de-variant-note\`, for the same reason: it is
 * explanatory prose inside a section body.
 */
.de-lib-empty {
  margin: 0;
  color: ${t.color.textDim};
  font-size: ${t.type.caption}; line-height: 1.4;
}
.de-lib-empty[hidden] { display: none; }

/* ---------- the add-by-URL CTA ---------- */
.de-lib-cta { display: flex; flex-direction: column; gap: ${t.space.sm}px; }
.de-lib-cta-label { color: ${t.color.textDim}; font-size: ${t.type.caption}; }
.de-lib-cta-row { display: flex; align-items: center; gap: ${t.space.sm}px; }
/*
 * \`field\` rather than the \`bgSunken\` the options browser's inputs take: that
 * one is a well on the panel ground, and the path box below sits INSIDE a well,
 * where the same value would make the box and its drawer the same surface. One
 * rule for both boxes, so the primary and the secondary way in are the same
 * control. The boundary is \`borderInteractive\` for the reason spelled out in
 * \`css/options.ts\` — it is the rung this token set ships for the edge of a
 * control you can act on, and the divider rung measures 1.55:1, which is a
 * field that reads as text.
 */
.de-lib-field {
  flex: 1; min-width: 0;
  height: ${t.size.rowHeight}px; padding: 0 ${t.space.sm}px;
  border: 1px solid ${t.color.borderInteractive}; border-radius: ${t.radius.md};
  background: ${t.color.field}; color: ${t.color.text};
  font-family: ${t.font.mono}; font-size: ${t.type.body};
  outline: none;
}
.de-lib-field:focus { border-color: ${t.color.accent}; }
.de-lib-field::placeholder { color: ${t.color.textDim}; }

/* ---------- the sign-in block ---------- */
/*
 * A well under the URL row, on the same grammar as the local-file drawer: this
 * is a thing that OPENED inside the section in answer to something above it,
 * and \`bgSunken\` is the only rung in this sheet that says so. Everything else
 * here goes up from the ground, and a transient surface sitting at the same
 * depth as the permanent ones is how a panel stops having a foreground.
 *
 * ITS PADDING IS NOT A NEST, and that is a decision rather than an omission.
 * The drawer above declares one because a candidate row sits in its top corners
 * and a path field in its bottom ones. Nothing sits in a corner of this block:
 * it is a column with \`align-items: stretch\`, so every child — the fact
 * plates, the scheme rail, the field row, the actions — spans the full content
 * width and is beside a corner rather than in one. The two paddings are
 * different for the reason \`.de-lint-row\` gives: the section body already
 * insets this by 8, and spending another 12 a side would leave a 260px panel
 * about 200px in which to show an 800-character token.
 */
.de-lib-signin {
  display: flex; flex-direction: column; gap: ${t.space.md}px;
  padding: ${t.space.lg}px ${t.space.md}px;
  border-radius: ${t.radius.lg};
  background: ${t.color.bgSunken};
}
/* An author \`display\` beats the UA [hidden] rule, so restate it — the same
   correction \`.de-lib-panel\` needs one block down. */
.de-lib-signin[hidden] { display: none; }
/* Which wall, and whose origin. The one line in the block that is a heading, so
   it takes the row weight the library name does and the same full-strength ink.
   It wraps: an origin has no natural width, and truncating the subject of the
   block to fit would be hiding the answer to "which site is this about". */
.de-lib-signin-title {
  color: ${t.color.text};
  font-size: ${t.type.body}; font-weight: ${t.type.weightValue}; line-height: 1.4;
}
/*
 * A fact the refusal named: what it is called, then the value beside its copy
 * button.
 *
 * The label is its own line rather than a prefix on the plate, because the
 * value is a single unbroken string that wraps to three lines — a label sharing
 * those lines would be read as part of it. Stacked, the plate keeps the whole
 * width of the block, which is the difference between a 70-character id
 * wrapping three times and wrapping five.
 *
 * The \`[hidden]\` rule is not decoration: an author \`display\` beats the UA
 * hidden rule, so a row shown only when the wall carried that field needs this
 * to be hideable at all — the same correction \`.de-lib-signin\` makes above.
 */
.de-lib-fact { display: flex; flex-direction: column; gap: ${t.space.xs}px; }
.de-lib-fact[hidden] { display: none; }
.de-lib-fact-label { color: ${t.color.textDim}; font-size: ${t.type.caption}; }
.de-lib-fact-row { display: flex; align-items: flex-start; gap: ${t.space.sm}px; }
/*
 * The value, on a plate, WRAPPED rather than scrolled.
 *
 * An OAuth client id is one unbroken string of about seventy characters, and a
 * monospace line that long in a 240px column can only wrap, clip or scroll.
 * Clipping hides the part that differs between two services; a horizontal
 * scroller inside a vertical panel is a second axis nobody goes looking for.
 * \`anywhere\` because the id has no spaces and few hyphens, so any break
 * opportunity the text offers on its own is at the wrong end of it.
 *
 * \`field\` for the ground, the same rung the boxes above take: this is the one
 * thing in the block a designer ACTS on without typing, and a plate is what
 * says the copy button beside it applies to this and not to the hint above.
 */
.de-lib-fact-value {
  flex: 1; min-width: 0;
  padding: ${t.space.sm}px ${t.space.md}px;
  border-radius: ${t.radius.sm};
  background: ${t.color.field}; color: ${t.color.textMuted};
  font-family: ${t.font.mono}; font-size: ${t.type.body}; line-height: 1.4;
  overflow-wrap: anywhere;
}
.de-lib-signin-row { display: flex; align-items: center; gap: ${t.space.sm}px; }
/* Decline on the left, commit on the right, with the gap between them rather
   than under them: the two are one decision and stacking them would read as two
   steps. */
.de-lib-signin-actions {
  display: flex; align-items: center; justify-content: space-between;
  gap: ${t.space.md}px;
}

/* ---------- what this editor is signed in to ---------- */
/*
 * A flat list of origins, with no surface of its own.
 *
 * Deliberately not cards: an installed library is a thing the whole editor is
 * USING and earns a raised card, while a sign-in is a fact about the network —
 * it contributes no token to any picker, and drawing it at the same rank would
 * put two kinds of object on one ground and invite a reader to compare them.
 * Text, a plate for the kind, and the forget control in the actions column
 * every row in this sheet already uses.
 */
.de-lib-signed { display: flex; flex-direction: column; gap: ${t.space.sm}px; }
.de-lib-signed[hidden] { display: none; }
.de-lib-signed-rows { display: flex; flex-direction: column; gap: ${t.space.xs}px; }
.de-lib-signed-row { display: flex; align-items: center; gap: ${t.space.sm}px; }
/* The origin takes whatever the badge and the button leave, and truncates into
   it — the same rule the source line on a library card follows, because it is
   the same problem: an unbounded string beside two fixed controls. */
.de-lib-signed-row > .de-lib-path { flex: 1 1 auto; }

/* ---------- the fold: a file in this project ---------- */
.de-lib-local { display: flex; flex-direction: column; gap: ${t.space.sm}px; }
/*
 * The fold, as a quiet text control rather than a second CTA.
 *
 * What it opens is the rarer half of a rare act, and it must not compete with
 * the URL box directly above it. Same grammar as \`.de-opt-link\` in the options
 * browser, plus the twisty, because the twisty is the part that says the words
 * are a fold and not a link out.
 */
/* Shared with \`.de-lib-dismiss\`, the "Not now" beside the sign-in block's
   submit: both are a quiet word that declines to do the loud thing next to
   them, and two rules for one grammar is how the second one drifts. The twisty
   rules below stay on \`.de-lib-expand\` alone — only the fold has one. */
.de-lib-expand,
.de-lib-dismiss {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: ${t.space.sm}px;
  padding: 0; border: none; background: transparent;
  color: ${t.color.textDim};
  font-family: inherit; font-size: ${t.type.caption};
  cursor: pointer;
}
.de-lib-expand:hover,
.de-lib-dismiss:hover { color: ${t.color.text}; }
.de-lib-expand:focus-visible,
.de-lib-dismiss:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 2px; }
/* A real glyph from the vendored set rather than a \`content\` character, so this
   disclosure mark is the same drawing as the options browser's and the
   inspector's instead of three fonts' idea of a triangle. */
.de-lib-twisty {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  color: ${t.color.textDim};
  transition: transform ${t.duration.fast} ${t.ease};
}
.de-lib-expand[aria-expanded="true"] .de-lib-twisty { transform: rotate(90deg); }

/*
 * A well, not a card.
 *
 * This block is revealed by the control directly above it and closes again, so
 * it has to read as a drawer that opened INSIDE the section rather than as the
 * first item of the list above. \`bgSunken\` is the only rung that says that in
 * both themes — everything else in this file goes up from the ground, and a
 * second thing going up would put the transient surface at the same depth as
 * the permanent ones.
 */
.de-lib-panel {
  display: flex; flex-direction: column; gap: ${t.space.md}px;
  padding: ${DRAWER.padding};
  border-radius: ${DRAWER.outer};
  background: ${t.color.bgSunken};
}
/* An author \`display\` beats the UA [hidden] rule, so restate it. */
.de-lib-panel[hidden] { display: none; }
.de-lib-status:empty { display: none; }
.de-lib-status { color: ${t.color.textDim}; font-size: ${t.type.body}; }

.de-lib-candidates { display: flex; flex-direction: column; gap: ${t.space.sm}px; }
/* Up off the well, so a row you can act on is a surface and the drawer it sits
   in is not. \`bg\` rather than \`bgRaised\`: these are candidates, not installed
   libraries, and the cards above have to stay the lightest thing in the
   section. */
.de-lib-candidate {
  display: flex; flex-direction: column; gap: ${t.space.xs}px;
  padding: ${t.space.md}px ${t.space.sm}px;
  border: 1px solid ${t.color.border}; border-radius: ${t.radius.md};
  background: ${t.color.bg};
}

/* The path box is the way past a scan that missed something, so it is separated
   from the scan's own results by a rule rather than by a gap. */
.de-lib-manual {
  display: flex; flex-direction: column; gap: ${t.space.sm}px;
  padding-top: ${t.space.md}px;
  border-top: 1px solid ${t.color.border};
}
.de-lib-manual-label { color: ${t.color.textDim}; font-size: ${t.type.caption}; }
.de-lib-manual-row { display: flex; align-items: center; gap: ${t.space.sm}px; }

/* ---------- the switch ---------- */
/*
 * A track, and a knob that travels its length.
 *
 * Deliberately the same drawing as the Changes tab's \`.de-ann-toggle\`, down to
 * the geometry, because two switches in one piece of chrome that are the same
 * control at two sizes is how a shell stops looking designed. It is a separate
 * class rather than a shared one because the two carry their state on different
 * attributes — that one is a \`role="switch"\` reporting \`aria-checked\`, this one
 * a toggle button reporting \`aria-pressed\`, for the naming reason set out in
 * \`libraries/libraries-section.ts\` — and a selector list spanning both would be
 * one rule that neither surface owns.
 *
 * The numbers are the DRAWING and not rhythm, which is why they stay literal
 * while every gap in this file is on the scale: 28x14 of padding box around a
 * 12px knob is 1px of clearance and 12px of travel, and the 1px insets follow
 * from the border under \`box-sizing: border-box\`. Moving any of them to a
 * spacing step would move the knob off centre.
 *
 * \`transform\`, never \`left\`: a knob animated on an inset is laid out again on
 * every frame, and these sit in a list that scrolls.
 */
.de-lib-switch {
  position: relative;
  flex: none;
  width: 28px; height: 16px;
  padding: 0;
  border: 1px solid ${t.color.borderInteractive}; border-radius: ${t.radius.xl};
  background: ${t.color.field};
  cursor: pointer;
  transition: background-color ${t.duration.base} ${t.ease}, border-color ${t.duration.base} ${t.ease},
    transform ${t.duration.fast} ${t.ease};
}
/* A 28x16 track is the drawing, not the target: 4px a side takes it to 24. */
.de-lib-switch::before {
  content: "";
  position: absolute; inset: -4px 0;
}
.de-lib-switch::after {
  content: "";
  position: absolute; left: 1px; top: 1px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: ${t.color.text};
  transform: translateX(0);
  transition: transform ${t.duration.base} ${t.ease}, background-color ${t.duration.base} ${t.ease};
}
.de-lib-switch:hover { background: ${t.color.fieldHover}; }
.de-lib-switch[aria-pressed="true"] {
  background: ${t.color.accentSurface};
  border-color: ${t.color.accentSurface};
}
.de-lib-switch[aria-pressed="true"]:hover {
  background: ${t.color.accentSurfaceHover};
  border-color: ${t.color.accentSurfaceHover};
}
/* The knob FLIPS its ink as it arrives. White on this accent is the 1.9:1 that
   \`accentFill\` exists to prevent, and the flip gives the on state a second
   channel besides where the knob is. */
.de-lib-switch[aria-pressed="true"]::after {
  transform: translateX(12px);
  background: ${t.color.onAccent};
}
.de-lib-switch:active { transform: scale(0.94); }
/* A switch has no text to dim, so "disabled" has to land on the two things it
   does draw: the knob and the track's edge. Fading the whole control took the
   knob's contrast down with it, which blurs the one distinction a switch exists
   to make — OFF and DISABLED stopped being tellable apart. */
.de-lib-switch[disabled] { cursor: default; border-color: ${t.color.border}; }
.de-lib-switch[disabled]::after { background: ${t.color.textDisabled}; }
.de-lib-switch:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: 2px; }

/* ---------- library component section ---------- */
/* Rendered by \`panels/inspector/section-library-component.ts\` into a normal
   \`de-section\` on the DESIGN tab, so it inherits that body's padding and gap
   and only needs its own ink ranks. */
.de-lib-owner { color: ${t.color.textDim}; font-size: ${t.type.body}; }
.de-lib-desc { color: ${t.color.textMuted}; font-size: ${t.type.body}; line-height: 1.5; }
.de-lib-props { display: flex; flex-direction: column; gap: ${t.space.xs}px; }
/*
 * Name, type, values — a table in everything but markup.
 *
 * A real \`<table>\` at 260px wraps the values column to four lines and takes the
 * name with it. Stacking the three parts per prop keeps the name on one line,
 * which is the part a reader scans for, and lets the values wrap under it
 * without moving anything else.
 */
.de-lib-prop {
  display: flex; flex-direction: column; gap: ${t.space.xs}px;
  padding: ${t.space.sm}px;
  border-radius: ${t.radius.sm};
  background: ${t.color.bgSunken};
}
.de-lib-prop-name { color: ${t.color.text}; font-family: ${t.font.mono}; font-size: ${t.type.body}; }
.de-lib-prop-type { color: ${t.color.textDim}; font-family: ${t.font.mono}; font-size: ${t.type.body}; }
.de-lib-prop-values { color: ${t.color.textMuted}; font-size: ${t.type.body}; line-height: 1.4; }

/*
 * Reduced motion keeps the fill and gives up the travel, the same bargain
 * \`css/annotations.ts\` strikes for its switch: the knob is simply already at
 * the other end, and nothing under a press squeezes. \`!important\` because the
 * blanket rule in base.ts that clamps every duration carries one.
 */
@media (prefers-reduced-motion: reduce) {
  .de-lib-switch::after { transition: background-color ${t.duration.base} linear !important; }
  .de-lib-switch:active { transform: none; }
}
`
