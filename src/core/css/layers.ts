/** Layers tree rows. */

import { tokens as t, nest } from "../tokens"

/**
 * One indent step, in px, shared with the panel that builds the rows.
 *
 * It lives here because the stylesheet is the other half of the measurement:
 * the row sets its own `padding-left` from this, and the indent guides are a
 * gradient that has to repeat on exactly the same pitch or the rule drifts off
 * the level it marks. Two numbers that must agree is one number.
 */
export const LAYER_INDENT = 16

/**
 * The context menu's corner and its rows' corner, from one inset.
 *
 * Deliberately the same declaration as `MENU` in `app-chooser.ts`, because the
 * two ARE the same surface: a floating card of full-width rows over the
 * product, at `radius.lg` with a hairline. Two menus in one piece of chrome
 * whose rows round differently is how a shell stops looking designed.
 */
const MENU = nest({ of: ".de-layer-menu", outer: t.radius.lg, inset: t.space.sm, hairline: 1 })

export const layersCss = `/* ---------- layers ---------- */
/*
 * The filter box above the tree. It used to borrow the inspector's prompt
 * textarea and undo most of it inline, which made a field in the left panel
 * depend on a section in the right one — and left it unstyled the day that
 * section was deleted. These are the declarations that survived the fight,
 * written where the thing they style lives.
 *
 * Not one declaration moved when the palette did, and what they DRAW inverted
 * anyway. \`bgSunken\` used to be a near-black well under a near-black panel, so
 * this field read as a hole punched in the chrome; it is \`#393939\` against a
 * \`#2c2c2c\` panel now — a step UP, the way every field, track and pad measures
 * inside Figma's own dark chrome. Same rule, same token, and the field reads as
 * a plate laid on the panel instead of a gap cut out of it.
 *
 * 1.20:1 of plate against panel is not enough on its own to say "you can type
 * here", so the hairline does the WCAG 1.4.11 work: \`borderInteractive\` is
 * 3.07:1 against the ground in dark and 3.15:1 in light. The ink is far clear
 * of its floor either way — white on the dark plate is 11.6:1, near-black on
 * the light one 16.1:1 — and the focus border is 7.4:1 dark, 3.6:1 light.
 */
.de-layer-filter {
  width: 100%; height: 24px;
  padding: ${t.space.md}px;
  border: 1px solid ${t.color.borderInteractive}; border-radius: ${t.radius.md};
  background: ${t.color.bgSunken}; color: ${t.color.text};
  font-family: inherit; font-size: ${t.type.body}; line-height: 1.45;
  outline: none;
}
.de-layer-filter:focus { border-color: ${t.color.accent}; }
/*
 * The tree is the focus root for the selected band below, so it — and not the
 * whole left slot — is what :focus-within is asked about. The horizontal inset
 * is what lets a rounded row read as a band with edges, not a full-bleed stripe.
 */
.de-layers-tree { position: relative; padding: 0 ${t.space.sm}px ${t.space.md}px; }
.de-layer {
  position: relative;
  display: flex; align-items: center; gap: ${t.space.sm}px;
  height: ${t.size.rowHeight}px;
  padding-right: ${t.space.md}px;
  border-radius: ${t.radius.md};
  color: ${t.color.textMuted};
  cursor: default;
  white-space: nowrap;
  transition: none;
  animation: none;
}
/*
 * Indent guides: one hairline per level the row sits under, drawn as a single
 * repeating gradient clipped to the row's own indent width. A rule per level
 * as real elements would triple the node count of a deep tree for decoration
 * that never takes a pointer — and this tree is diffed on every selection.
 *
 * Still \`border\` and not \`borderStrong\` after the ground moved: the hairline
 * was ΔL* 14.8 off near-black and is ΔL* 13.3 off \`#2c2c2c\`, 1.54:1 then and
 * 1.56:1 now. It is decoration, so no floor applies, and five of these down a
 * deep row is exactly the place where a louder rule becomes noise.
 */
.de-layer::before {
  content: ""; position: absolute; left: 8px; top: 0; bottom: 0;
  width: var(--de-indent, 0px);
  background-image: repeating-linear-gradient(
    to right,
    ${t.color.border} 0 ${t.size.hairline}px,
    transparent ${t.size.hairline}px ${LAYER_INDENT}px
  );
  pointer-events: none;
}
/*
 * The row ladder, re-measured on the new ground, in L* rather than in percent.
 *
 * The suspicion was that these steps would go flat when the panel moved from
 * near-black to \`#2c2c2c\`, because a mix that lifts visibly out of \`#1c1d21\`
 * has less headroom above a mid grey. Measured, the hover barely moved: the
 * same \`bgHoverQuiet\` was ΔL* 9.7 off the old ground and is ΔL* 8.6 off this
 * one (1.30:1 then, 1.33:1 now). A percentage lift keeps its ratio when the
 * ground moves, which is the whole reason the palette derives these rather
 * than listing greys.
 *
 * So it stays \`bgHoverQuiet\` and not the louder \`bgHover\`, even though
 * \`bgHover\` is \`#454545\` and Figma's published \`bg-tertiary\` is \`#444444\`.
 * The reason is the rest of the ladder, off \`#2c2c2c\`:
 *
 *   hover              \`bgHoverQuiet\`      ΔL*  8.6   1.33:1
 *   resting selection  \`rowSelectedMuted\`  ΔL* 10.7   1.43:1
 *   focused selection  \`rowSelected\`       ΔL* 19.5   1.97:1
 *
 * Monotonic, and it has to be: a row you are merely pointing at must not out-
 * shout the row that is actually selected. \`bgHover\` would put hover at ΔL*
 * 11.3 — past the resting selection — and hand the loudest of the three
 * surfaces to the most transient state.
 *
 * The two selection rungs used to sit at ΔL* 6.0 and 10.8, which put hover
 * BETWEEN them: a row under the pointer shouted louder than a row that was
 * actually selected but unfocused. That was a consequence of the selection
 * bands being mis-measured, and adopting Figma's published values fixed the
 * ordering as a side effect rather than by design.
 */
.de-layer:hover { background-color: ${t.color.bgHoverQuiet}; }
/*
 * A selected row is a SOLID band, not the canvas's 18% wash: the panel is the
 * one place a selection has to stay findable while the pointer is elsewhere.
 * Muted is that band with focus outside the tree — still the row you left, no
 * longer competing with whatever now has the caret.
 *
 * The band is Figma's, and it is the same value as the container behind a
 * chosen icon button: \`rowSelected\` resolves to \`accentSoft\`, Figma's
 * published \`bg-selected\` — \`#4a5878\` dark and \`#e5f4ff\` light. One blue for
 * "this is the thing" everywhere in the chrome, rather than the two hand-mixed
 * accent bands this used to carry. The muted band is \`bg-selected-secondary\`
 * from the same list.
 *
 * The band is separated from the ground by hue as much as by value — 1.97:1 is
 * still a quiet step for a surface — so the ink on top is what has to be
 * unambiguous, and it is: white on \`#4a5878\` is 7.1:1 and 9.8:1 on the muted
 * band, against near-black on \`#e5f4ff\` at 15.5:1. The focus ring stays
 * legible on both, at 3.8:1 dark and 3.8:1 light — a ring is a non-text
 * component, so 3:1 is its floor.
 */
.de-layer[aria-selected="true"] { background-color: ${t.color.rowSelectedMuted}; color: ${t.color.text}; }
.de-layers-tree:focus-within .de-layer[aria-selected="true"] { background-color: ${t.color.rowSelected}; }
.de-layer:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
.de-layer-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; }
.de-layer--component .de-layer-name { color: ${t.color.component}; font-weight: ${t.type.weightValue}; }
.de-layer[aria-selected="true"] .de-layer-name { color: ${t.color.text}; }
/*
 * 16 wide and the full height of the row, where it was a 14px square.
 *
 * 14 was off both scales at once — not one of the glyph ramp's 12/16/20/24/32,
 * and not a step on the kit's spacing scale either — and it made the one
 * control that opens a subtree a 14x14 target, the smallest hit area in the
 * chrome. The glyph inside is still \`icon.row\`; only the box grows. Stretching
 * to the row rather than setting a height is what gets the target to 24px tall:
 * the row IS 24, so there is nothing else to take.
 *
 * 16x24 and not 24x24 because the horizontal budget belongs to the name. This
 * tree indents 16px a level and shows five levels in a 240px panel; three more
 * pixels per row of twisty is three fewer characters of the thing you are
 * looking for.
 */
.de-layer-twisty {
  width: ${t.icon.control}px; align-self: stretch; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer;
}
.de-layer-twisty[aria-expanded="true"] { transform: rotate(90deg); }
/*
 * The type mark. Dim by default so a column of them reads as texture; only the
 * component diamond takes a colour, and it keeps it through selection — the
 * distinction it draws is what the row is, which selection does not change.
 */
.de-layer-icon {
  width: ${t.icon.row}px; height: ${t.icon.row}px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  color: ${t.color.textDim};
}
.de-layer--component .de-layer-icon { color: ${t.color.component}; }
/*
 * A hidden element still has a row; it just stops competing for the eye.
 *
 * It stopped competing too well, twice, and the second time the palette did it
 * rather than the value. 0.7 was chosen against the near-black ground, where it
 * measured 5.6:1 on the panel and 4.7:1 on a selected band. On \`#2c2c2c\` the
 * same 0.7 is 4.01:1 on the focused band and 4.22:1 on a hovered row, and the
 * light theme fails everywhere it is drawn — 4.02:1 at best. Under the 4.5:1 a
 * name owes, on rows whose whole point is that you can still find the thing you
 * hid and put it back.
 *
 * 0.85, because the binding case is not the plain row. \`opacity\` multiplies
 * whatever ink the cascade gave the name, and a hidden COMPONENT row is already
 * carrying the tightest ink in the tree, so it is the combination that sets the
 * floor. Worst ground for each, at 0.85:
 *
 *   plain name, hovered row      dark 5.4:1   light 5.7:1
 *   component name, hovered row  dark 4.8:1   light 4.8:1
 *
 * 0.8 was tried first and is the near miss this file keeps producing: fine for
 * a plain name at 5.0:1, and 4.41:1 dark / 4.28:1 light for a component one.
 *
 * The dim that leaves is shallow — 8.5:1 down to 6.6:1 on the panel — and that
 * is the honest trade. A deeper fade is available only by waiving the floor for
 * the one row the user most needs to read back. The crossed-out eye in the
 * strip, which a hidden row pins open, carries the rest of the message.
 */
.de-layer--hidden .de-layer-name { opacity: 0.85; }
/*
 * The lock and the eye.
 *
 * The strip is always laid out and only ever changes OPACITY — revealing it by
 * mounting it would reflow the name mid-hover, which is exactly the jitter that
 * makes a row feel unclickable. It stays up on a row whose state is not the
 * default, because a lock nobody can see is a lock nobody can undo.
 */
.de-layer-actions {
  /* \`space.md\`, not \`space.xs\`: the gap is what keeps the three 24px hit pads
     below from overlapping. See the pad's own note. */
  display: flex; flex: none; align-items: center; gap: ${t.space.md}px;
  margin-left: ${t.space.sm}px;
  opacity: 0;
}
.de-layer:hover .de-layer-actions,
.de-layer:focus-within .de-layer-actions,
.de-layer[aria-selected="true"] .de-layer-actions,
.de-layer--locked .de-layer-actions,
.de-layer--hidden .de-layer-actions { opacity: 1; }
.de-layer-action {
  position: relative;
  width: ${t.size.miniSize}px; height: ${t.size.miniSize}px;
  flex: none; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: ${t.radius.sm};
  background: transparent;
  color: ${t.color.textDim};
  cursor: pointer;
}
/* Same bargain as \`.de-mini\`: the plate stays 18px so three of them in a 24px
   row do not read as a toolbar, and a transparent pad buys the rest of the
   target. The 3 is not rhythm, it is (24 - 18) / 2 — the room left over once
   the plate is taken out of the 24 WCAG 2.5.8 asks for.

   The pad used to be vertical only (\`-3px 0\`), because these sit 2px apart and
   delete is one of them, so reaching sideways would let a miss on the eye land
   on the bin. That reasoning was right about the danger and wrong about the
   remedy: it left the target 18 wide, and 2.5.8 is not a floor on height, it is
   a floor on both. Worse, the 2px gap put the three centres 20px apart, which
   fails the spec's spacing exception too — the fallback that would have excused
   an undersized target needs 24 between centres.

   So the pad reaches all four sides and the GAP above pays for it: \`space.md\`
   puts the centres 26px apart, so each 24px target clears its neighbours with
   2px to spare and the bin still cannot be hit by a miss on the eye. The row
   grows 12px, which the layers panel has. */
.de-layer-action::after {
  content: ""; position: absolute; inset: -3px;
}
/* The plate is \`bgRaised\` where it was \`bgHover\`, and that one step is not a
   nicety. This plate is never drawn on the panel ground: the strip appears once
   the row is hovered, focused or selected, and a pointer on the eye is a
   pointer on the row, so the plate always lands on a row that has already
   lifted. \`bgHover\` measured against what is actually behind it is ΔL* 2.8 on
   a hovered row in dark, and in LIGHT it is \`#eaeaea\` on a row that is itself
   \`#eaeaea\` — the same colour, 1.00:1, a hover state that does not exist.
   \`bgRaised\` is ΔL* 4.6 on the dark hovered row and steps back to \`#ffffff\` on
   the light one (ΔL* 7.2), which is exactly the white chip Figma raises off its
   own light track. Its role — a surface in FRONT of the control layer — is what
   a button plate on a row is. Ink is 8.9:1 dark, 17.4:1 light. */
.de-layer-action:hover { background: ${t.color.bgRaised}; color: ${t.color.text}; }
.de-layer-action[aria-pressed="true"] { color: ${t.color.text}; }
.de-layer-action:focus-visible { outline: 2px solid ${t.color.accent}; outline-offset: -2px; }
/* Delete is the one row action that cannot be pressed again to take it back —
   Cmd+Z can, but the row it lived on is gone by then. It says so on approach
   rather than after the fact, which is the same bargain the mini danger button
   and the toolbar's destructive button already make: quiet until you are on it.

   The ink is \`bg\`, and \`onAccent\` — which is what this said — is now wrong for
   it. \`danger\` is a LIGHT coral in dark (\`#ff8a65\`) and a deep rust in light
   (\`#b83408\`), so the ink has to go dark on one theme and white on the other.
   \`onAccent\` used to do that and does not any more: it is white in BOTH themes
   since the accent fills went to Figma's blue, which puts a white bin on the
   coral at 2.31:1 — under the 3:1 a glyph owes, on the one action that most
   needs to be read before it fires.

   \`bg\` is the only role in the palette whose pair runs the right way round:
   \`#2c2c2c\` on the coral is 6.04:1, \`#ffffff\` on the rust is 5.94:1, which is
   what the light theme already drew. Knocking the glyph out in the panel's own
   ground is a plain reading of the treatment, not a borrowed token — but the
   role this wants is an ink for a fill that is light in dark and dark in light,
   and the palette has no name for it. This is not the only destructive fill in
   the chrome wearing the old pairing, so the role is worth adding rather than
   working around once per file. */
.de-layer-action--danger:hover,
.de-layer-action--danger:focus-visible { background: ${t.color.danger}; color: ${t.color.bg}; }
/* The drop line rides the boundary between two rows, so it is placed by the
   panel and only coloured here. Accent, never the pink canvas guide: this is a
   commit target in the tree, not a measurement on the page. */
.de-layer-drop {
  position: absolute; right: 4px; height: 2px;
  background: ${t.color.accent};
  border-radius: ${t.radius.sm};
  pointer-events: none;
}

/*
 * The right-click layer stack. Same rows, same order, over the canvas.
 *
 * A hairline as well as the cast, because this is the only surface in this
 * file that floats over the PRODUCT rather than inside a panel. \`shadow.popover\`
 * ends in a half-pixel DARK ring, which draws the menu's edge beautifully on a
 * white page and draws nothing at all on a dark one. \`bgRaised\` is \`#4a4a4a\`
 * now rather than the near-black it was, and that does not retire the hairline
 * — it is the argument for it. A mid grey is the value MOST likely to land near
 * whatever is behind it, and it can be the lighter or the darker of the two
 * depending on the app, so there is no cast that separates it from both. The
 * composer in \`annotations.ts\` floats over the same unknown pixels and already
 * carries this pair; the menu was the one that did not.
 *
 * Against the chrome it does separate: 1.56:1 above the panel ground, with the
 * card's own ink at 5.9:1 and a hovered row's at 6.5:1.
 */
.de-layer-menu {
  position: absolute;
  min-width: 176px; max-width: 260px;
  padding: ${MENU.padding};
  background: ${t.color.bgRaised};
  border: ${MENU.hairline}px solid ${t.color.border};
  border-radius: ${MENU.outer};
  box-shadow: ${t.shadow.popover};
  pointer-events: auto;
}
/*
 * The row's corner comes off the card's nest, and this is the one place in the
 * chrome where that CHANGED the drawing rather than confirming it.
 *
 * It was \`radius.sm\` — 4 under a 12px card, two steps too tight. A row that is
 * the full width of the card fills its top corner completely, so the eye has
 * both curves side by side with nothing between them, and the tighter one reads
 * as a smaller box that has been dropped in rather than as the card's own
 * lining. The app menu three files over was already drawing its rows at \`md\`
 * under the same 12px card; this is the same surface and now says so.
 */
.de-layer-menu-row {
  display: block; width: 100%;
  height: ${t.size.rowHeight}px;
  padding: 0 ${t.space.md}px;
  border: none; border-radius: ${MENU.radius};
  background: transparent;
  color: ${t.color.textMuted};
  font: inherit; text-align: left;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: default;
}
/* \`selectionSurface\` is kept here for a reason worth writing down, because the
   obvious move after the palette retune is to reach for \`accentSoft\` — the one
   blue the chrome now uses for "this is the thing". It is the weaker step on
   this surface. The card is \`bgRaised\`, the top of the neutral ladder, and
   \`accentSoft\` (\`#4a5878\`) clears it by only ΔL* 6.0 — 1.25:1. The accent wash
   goes further from the same ground, 1.37:1 in dark and 1.18:1 in light, and
   it carries the same hue while doing it. Ink on it is 6.5:1.

   Worth noting that the argument used to be stronger and is now merely true:
   with the mis-measured \`#3b435e\`, \`accentSoft\` was DARKER than the card and
   the hover visibly receded. The corrected value goes the right way, just not
   as far. */
.de-layer-menu-row:hover { background: ${t.color.selectionSurface}; color: ${t.color.text}; }
.de-layer-menu-row:focus-visible {
  outline: 2px solid ${t.color.accent};
  outline-offset: -2px;
  background: ${t.color.selectionSurface};
  color: ${t.color.text};
}
.de-layer-menu-row--component { color: ${t.color.component}; font-weight: ${t.type.weightValue}; }
.de-layer-menu-row--component:hover { color: ${t.color.text}; }

`
