<!--
  IconButton — a square glyph action. Same variant/size palette as Button,
  fully self-styled from the token contract. A `label` is required and becomes the `aria-label`
  (and default `title`) since the visible content is a glyph, not text.

  Touch hit-targeting (deferred from F): the box is floored to the F `--panelty-hit` target
  (28px fine / 44px coarse) so its rendered bounding box is a real tap target while the
  glyph stays visually small. Additionally, under a coarse pointer an `::after` overlay
  guarantees a >= --panelty-hit clickable area even if a consumer shrinks the visual box below the
  floor; under a fine pointer that overlay does not exist (a genuine no-op).

  `density="chrome"` is the one supported way to go *under* that floor: a window-chrome strip
  (a tab bar, a panel header) is itself shorter than --panelty-hit, so it sets the box per instance with
  `--panelty-icon-btn-size` and the primitive restores the --panelty-hit floor under a coarse pointer. A chrome
  strip therefore never writes a `min-width`/`min-height` pin or a pointer media query of its own.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import {
		variantClass,
		type ButtonVariant,
		type ButtonSize,
		type ButtonDensity
	} from './variantClass';

	let {
		variant = 'default',
		size = 'md',
		density = 'comfortable',
		type = 'button',
		label,
		class: klass = '',
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Box density. `chrome` takes its fine-pointer box from `--panelty-icon-btn-size`. */
		density?: ButtonDensity;
		/** Accessible name — required; the visible content is a glyph. */
		label: string;
		children?: Snippet;
	} = $props();
</script>

<button
	{...rest}
	{type}
	class={`ui-icon-btn ${variantClass(variant, size, density)} ${klass}`.trim()}
	aria-label={label}
	title={rest.title ?? label}
>
	<span class="glyph">{@render children?.()}</span>
</button>

<style>
	.ui-icon-btn {
		/* A <button> inherits no font of its own — a UA `font` DECLARATION beats inheritance — and a
		   primitive states its whole face rather than leaning on a host app's base reset. `line-height`
		   below still wins over the shorthand's inherited one (later declaration). */
		font: inherit;
		position: relative; /* anchor for the coarse-pointer hit-rect ::after */
		display: inline-grid;
		place-items: center;
		/* Square tap target floored to the F hit geometry, so the rendered box IS a real
		   touch target (28 fine / 44 coarse) while the glyph inside stays small. */
		min-width: var(--panelty-hit, var(--panelty-hit-default));
		min-height: var(--panelty-hit, var(--panelty-hit-default));
		padding: 0;
		border: 1px solid var(--panelty-border, var(--panelty-border-default));
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		background: var(--panelty-surface-2, var(--panelty-surface-2-default));
		color: var(--panelty-text, var(--panelty-text-default));
		cursor: pointer;
		line-height: 1;
		transition:
			background var(--panelty-motion, var(--panelty-motion-default)),
			border-color var(--panelty-motion, var(--panelty-motion-default)),
			color var(--panelty-motion, var(--panelty-motion-default));
	}
	.ui-icon-btn:disabled {
		opacity: var(--panelty-disabled-opacity, var(--panelty-disabled-opacity-default));
		cursor: not-allowed;
	}

	/* Chrome density — the ONE expression of "dense in a strip, still tappable on touch".
	   The consumer states only the box it wants (`--panelty-icon-btn-size: 22px`); the floor below is
	   the primitive's business. Unset, the hook resolves to --panelty-hit, so `density="chrome"` alone
	   is a no-op rather than a collapsed box. */
	.ui-icon-btn.d-chrome {
		min-width: var(--panelty-icon-btn-size, var(--panelty-hit, var(--panelty-hit-default)));
		min-height: var(--panelty-icon-btn-size, var(--panelty-hit, var(--panelty-hit-default)));
	}
	/* Gated exactly like the --panelty-hit floor itself (a real touch device: no hover + coarse), so the
	   dense box is a fine-pointer affordance only and touch always gets the full target back. */
	@media (hover: none) and (pointer: coarse) {
		.ui-icon-btn.d-chrome {
			min-width: var(--panelty-hit, var(--panelty-hit-default));
			min-height: var(--panelty-hit, var(--panelty-hit-default));
		}
	}

	/* The glyph stays visually small regardless of the tap-target size. */
	.glyph {
		display: inline-grid;
		place-items: center;
		pointer-events: none;
	}
	.ui-icon-btn.s-md .glyph {
		font-size: var(--panelty-fs-body, var(--panelty-fs-body-default));
	}
	.ui-icon-btn.s-sm .glyph {
		font-size: var(--panelty-fs-small, var(--panelty-fs-small-default));
	}

	/* Variants — colour only. Hover is an enhancement, never the sole affordance. */
	.ui-icon-btn.v-default:hover:not(:disabled) {
		background: var(--panelty-surface-3, var(--panelty-surface-3-default));
		border-color: var(--panelty-border-strong, var(--panelty-border-strong-default));
	}
	.ui-icon-btn.v-primary {
		background: var(--panelty-accent, var(--panelty-accent-default));
		border-color: var(--panelty-accent, var(--panelty-accent-default));
		color: var(--panelty-on-accent, var(--panelty-on-accent-default));
	}
	.ui-icon-btn.v-primary:hover:not(:disabled) {
		background: var(--panelty-accent-strong, var(--panelty-accent-strong-default));
		border-color: var(--panelty-accent-strong, var(--panelty-accent-strong-default));
	}
	.ui-icon-btn.v-ghost {
		background: transparent;
		border-color: transparent;
	}
	/* A ghost has no surface of its own, so its hover LIFTS its host rather than naming a rung —
	   `--panelty-surface-2` was invisible on every chrome strip these actually sit on. */
	.ui-icon-btn.v-ghost:hover:not(:disabled) {
		background: var(--panelty-hover-fill, var(--panelty-hover-fill-default));
	}
	.ui-icon-btn.v-danger {
		background: var(--panelty-danger, var(--panelty-danger-default));
		border-color: var(--panelty-danger, var(--panelty-danger-default));
		color: var(--panelty-on-danger, var(--panelty-on-danger-default));
	}
	.ui-icon-btn.v-danger:hover:not(:disabled) {
		background: color-mix(
			in srgb,
			var(--panelty-danger, var(--panelty-danger-default)) 85%,
			var(--panelty-bg, var(--panelty-bg-default))
		);
		border-color: color-mix(
			in srgb,
			var(--panelty-danger, var(--panelty-danger-default)) 85%,
			var(--panelty-bg, var(--panelty-bg-default))
		);
	}

	/* Coarse-pointer hit-rect guarantee: extend the clickable area outward to at least
	   --panelty-hit. A no-op once the visual box already meets --panelty-hit (inset resolves to 0); only
	   grows the target if a consumer shrinks the box below the floor. Absent under a fine
	   pointer, so there it is a genuine no-op.

	   Gated on the SAME two clauses as the density floor above. It was one-clause, which
	   made this file state two idioms for one concern: on a hover-capable touchscreen the
	   density floor did not fire but this did, so the invisible rect grew to 44px around a 20px
	   chrome box and two adjacent header icons' targets overlapped. */
	@media (hover: none) and (pointer: coarse) {
		.ui-icon-btn::after {
			content: '';
			position: absolute;
			inset: calc((var(--panelty-hit, var(--panelty-hit-default)) - 100%) / -2);
		}
	}
</style>
