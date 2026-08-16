# Course Deck Wraparound Motion Design

**Status:** Approved for implementation on 2026-08-16.

## Goal

Make a right drag read as the exact reverse circulation of a left drag. The previous course must enter from the left, the current front card must rotate into the second slot, and the remaining visible cards must move one slot deeper around the deck.

## Interaction contract

- Left drag retains the existing forward cycle: front exits left, slot two advances to the front, and slot three advances to slot two.
- Right drag uses a temporary, inert wrap instance of the previous course positioned beyond the clipped left edge.
- As right-drag progress increases, the wrap instance moves from the left edge to the front slot; the current front card moves to slot two; slot two moves to slot three; and the old slot-three instance moves right and becomes concealed.
- The wrap instance becomes the painted front layer only at the deliberate handoff. Before that point, the current selected card remains the front layer.
- Releasing above the existing distance or velocity threshold commits the previous course. Cancelling reverses every transform and removes the wrap instance without changing selection.
- After commit, the canonical cards reset before paint and the temporary wrap instance is removed, leaving one DOM instance per course at rest.
- Release inertia projects the drag distance with `abs(velocity) * 0.22`. The projected travel selects one to three visible cycles, capped at `course count - 1`, so a spin never completes a full loop and appears unchanged.
- Multi-course inertia renders every intermediate cycle. Velocity decays between cycles and the final cycle uses the existing arrival easing to settle decisively.
- Arrow buttons, keyboard commands, and ordinary drags remain single-course operations; only a sufficiently fast pointer or touch release can queue additional cycles.
- Reduced motion keeps the existing instant selection change and does not render animated wrap movement.

## Accessibility and input

- The canonical selected card remains the only semantic slide and the only draggable card until commit completes.
- The temporary wrap card is `aria-hidden`, inert, untabbable, and pointer-inert.
- Mouse, touch/pointer, keyboard, explicit arrow buttons, vertical page scrolling, and the user motion preference retain their existing contracts.

## Verification

- At early right-drag progress, the wrap card is left of the deck while the current card, slot two, and slot three all move right without exchanging rear layers.
- At handoff, layers are wrap/front `3`, former front/slot two `2`, former slot two/slot three `1`, and exiting rear copy `0`.
- After release, status, ordinal, active course, and Continue link all identify the previous course, and no wrap instance remains.
- A high-velocity right flick across a three-course deck visibly performs two previous cycles and settles on the second previous course.
- The existing forward-drag checks continue to pass across desktop Chromium, mobile Chromium, and mobile WebKit.
