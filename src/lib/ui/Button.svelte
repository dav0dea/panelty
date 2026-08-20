<!--
  Button — the foundation interactive primitive.

  Fully self-styled: its own `.ui-btn` scoped class specifies background/border/padding/
  radius/font from the token contract, so it renders correctly independent of a host app's base
  `button` rule, which keeps only a `font: inherit` + `cursor` RESET (the skin went at M-Task 7;
  the reset is permanent). Variant
  + size come from the pure `variantClass` map; `class` is merged (not replaced) and every
  other attribute — `disabled`, `onclick`, `data-testid`, `title`, aria-* — forwards through.

  Touch: under a coarse pointer the box is floored to `--panelty-hit` on BOTH axes, stated below
  rather than inherited from a host app's blanket `button {}` reset — a package that only looks
  right inside one app is not one. Keyboard focus rings via `:focus-visible` (never suppressed).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { variantClass, type ButtonVariant, type ButtonSize } from './variantClass';

	let {
		variant = 'default',
		size = 'md',
		type = 'button',
		class: klass = '',
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		children?: Snippet;
	} = $props();
</script>

<button {...rest} {type} class={`ui-btn ${variantClass(variant, size)} ${klass}`.trim()}>
	{@render children?.()}
</button>

<style>
	.ui-btn {
		font-family: var(--panelty-font-sans, var(--panelty-font-sans-default));
		/* The body text ratio, stated rather than inherited. The box height IS
		   this plus the padding and border, and a host app's base `button` rule keeps only a `font:
		   inherit` reset — so leaving it implicit makes every Button's height a property of whatever
		   it happens to be nested in, and `normal` (the UA value under any stricter reset) shortens
		   the lot by 1-2px. `s-md`/`s-sm` scale it by setting only `font-size`. */
		line-height: var(--panelty-lh-text, var(--panelty-lh-text-default));
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--panelty-space-3, var(--panelty-space-3-default));
		border: 1px solid var(--panelty-border, var(--panelty-border-default));
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		background: var(--panelty-surface-2, var(--panelty-surface-2-default));
		color: var(--panelty-text, var(--panelty-text-default));
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--panelty-motion, var(--panelty-motion-default)),
			border-color var(--panelty-motion, var(--panelty-motion-default)),
			color var(--panelty-motion, var(--panelty-motion-default));
	}
	/* BOTH axes: a short label ("Kill") is 40px wide under a coarse pointer, so a height floor alone
	   leaves it under the target. An app's own blanket `button {}` rule may floor the height too —
	   most do — and lands on the same token, so this restates rather than fights it. */
	@media (hover: none) and (pointer: coarse) {
		.ui-btn {
			min-width: var(--panelty-hit, var(--panelty-hit-default));
			min-height: var(--panelty-hit, var(--panelty-hit-default));
		}
	}
	.ui-btn:disabled {
		opacity: var(--panelty-disabled-opacity, var(--panelty-disabled-opacity-default));
		cursor: not-allowed;
	}

	/* Size — padding + type scale from the F step ladder. */
	.ui-btn.s-md {
		padding:
			var(--panelty-space-3, var(--panelty-space-3-default))
			var(--panelty-space-6, var(--panelty-space-6-default));
		font-size: var(--panelty-fs-small, var(--panelty-fs-small-default));
	}
	.ui-btn.s-sm {
		padding:
			var(--panelty-space-2, var(--panelty-space-2-default))
			var(--panelty-space-4, var(--panelty-space-4-default));
		font-size: var(--panelty-fs-micro, var(--panelty-fs-micro-default));
	}

	/* Variants — colour only; the default is the resting surface. Hover is an
	   enhancement, never the sole affordance (the control is always visible + clickable). */
	.ui-btn.v-default:hover:not(:disabled) {
		background: var(--panelty-surface-3, var(--panelty-surface-3-default));
		border-color: var(--panelty-border-strong, var(--panelty-border-strong-default));
	}
	.ui-btn.v-primary {
		background: var(--panelty-accent, var(--panelty-accent-default));
		border-color: var(--panelty-accent, var(--panelty-accent-default));
		color: var(--panelty-on-accent, var(--panelty-on-accent-default));
		font-weight: 600;
	}
	.ui-btn.v-primary:hover:not(:disabled) {
		background: var(--panelty-accent-strong, var(--panelty-accent-strong-default));
		border-color: var(--panelty-accent-strong, var(--panelty-accent-strong-default));
	}
	.ui-btn.v-ghost {
		background: transparent;
		border-color: transparent;
		/* A ghost is ink on someone else's surface, so its ink is the one thing a host may need to
		   restate — a status glyph in a chrome strip carries its meaning in its colour, not in a
		   fill. Per-instance hook, unset it resolves to the same `--panelty-text` every other variant uses. */
		color: var(--panelty-btn-ink, var(--panelty-text, var(--panelty-text-default)));
	}
	/* A ghost has no surface of its own, so its hover LIFTS its host rather than naming a rung —
	   `--panelty-surface-2` was invisible on every chrome strip these actually sit on. */
	.ui-btn.v-ghost:hover:not(:disabled) {
		background: var(--panelty-hover-fill, var(--panelty-hover-fill-default));
	}
	.ui-btn.v-danger {
		background: var(--panelty-danger, var(--panelty-danger-default));
		border-color: var(--panelty-danger, var(--panelty-danger-default));
		color: var(--panelty-on-danger, var(--panelty-on-danger-default));
		font-weight: 600;
	}
	.ui-btn.v-danger:hover:not(:disabled) {
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
</style>
