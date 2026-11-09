# Motion craft

Read this file only when the task includes custom motion, a gesture, an overlay, or a dynamic visual state. Motion is behavior, not decoration.

## Choose motion by frequency and purpose

- Do not animate high-frequency actions such as typing, editing, selection, or keyboard navigation. A rare, consequential action can carry more feedback.
- State the purpose before implementation: hierarchy, feedback, spatial continuity, or narrative. Remove motion with no job.
- Keep ordinary interface transitions below 300ms. Button feedback is usually immediate to 160ms; a tooltip or popover normally needs 125–250ms.

## Make the movement legible

- Use ease-out for entering and leaving, ease-in-out for on-screen repositioning, and a short custom curve for hover color changes. Do not use ease-in for ordinary UI.
- Make a popover originate near its trigger. Centered dialogs can use a small opacity and scale transition from the center; avoid a scale from zero.
- Give press feedback immediately, such as a restrained active scale around 0.97. Gate hover-only effects behind a fine-pointer media query.
- Keep related elements on a shared timing and direction language. Do not synchronize every element merely because it can move.

## Preserve control and performance

- Prefer interruptible CSS transitions or WAAPI for dynamically triggered UI. Do not use a non-interruptible keyframe sequence when the user can reverse the action.
- Animate transform and opacity whenever possible. Avoid layout-affecting properties in high-frequency interactions.
- For gestures, respond on pointer-down, track the pointer directly, preserve pointer capture, and hand off current position plus velocity to a spring or momentum state. Test the physical interaction on a real device when possible.
- Honor `prefers-reduced-motion`; retain meaningful opacity or color feedback where it preserves comprehension. Also respect reduced-transparency and increased-contrast preferences when the platform exposes them.

## Verify

- Review critical transitions in slow motion or frame-by-frame when the timing or origin carries meaning.
- Verify overlays, dialogs, and menus under repeated opening, dismissal, and reversal. The interface must remain responsive while an animation is in flight.
