<!--
  Tabs — the integrated connected tab bar. NOT floating pills and NOT underlined tabs:
  the ACTIVE tab drops to the BODY surface (`--panelty-tab-body`) while the inactive tabs and the strip sit
  at the HEADER surface (`--panelty-tab-surface`), so the active tab visually merges downward into the panel
  body rendered flush beneath it — one connected piece, no divider lines. A consumer paints its body
  region with the same `--panelty-tab-body` token to complete the seam.

  A horizontal WAI-ARIA tablist: `role=tablist` of `role=tab` buttons, roving tabindex (the active
  tab is the one tab-stop), Left/Right + Home/End move the selection AND focus (automatic activation),
  `aria-selected` marks the active tab. The active-resolution + arrow-navigation logic is the pure,
  unit-tested `tabsState` (so an unset/stale `active` still resolves to a shown tab). `items` in,
  `onSelect(id)` out — dumb. `class` merged, `data-testid` (and any other attribute) forwarded.

  ONE component, two consumers (Phil, 2026-08-08): the inspector's param groups AND the header's
  layout pages are the same control, so the extra affordances the layout bar needs are OPT-IN props
  that default off — absent, this renders exactly the bare tablist the inspector always had:
   · `onAdd`      — a trailing ＋ that mints a new tab.
   · `onRename`   — double-click (double-tap) opens an inline rename; Enter commits, Escape cancels,
                    blur commits.
   · `onClose`    — a hover-revealed ✕ per tab (rested open under a coarse pointer, which has none).
   · `onReorder`  is deliberately NOT here: the layout bar's drag is one half of the workspace-wide
                    drag system (a PANEL dropped on the bar becomes a tab), which lives with the
                    workspace store — and a chrome primitive is a leaf that must not import one. The
                    seam is `tabProps` (per-tab attributes: draggable, ondragstart, …) plus
                    `previewIndex` (the drop-slot placeholder), so the consumer owns the drag and
                    this component only draws it.
-->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import {
		resolveActive,
		nextIndex,
		IDENTIFIER_ATTRS,
		type TabItem,
		type ArrowKey
	} from './tabsState';


	let {
		items,
		active,
		onSelect,
		onAdd,
		onRename,
		onClose,
		previewIndex = null,
		tabProps,
		class: klass = '',
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		items: TabItem[];
		/** The selected tab id; unset or stale resolves to the first tab (see `resolveActive`). */
		active?: string;
		onSelect: (id: string) => void;
		/** Renders the trailing ＋ ("New tab"). Absent → no add affordance. */
		onAdd?: () => void;
		/** Enables double-click inline rename. Absent → labels are static. */
		onRename?: (id: string, label: string) => void;
		/** Renders a hover-revealed ✕ per tab. Absent → tabs cannot be closed. The "keep the last
		 *  tab" policy belongs to the consumer: pass `undefined` when only one tab remains. */
		onClose?: (id: string) => void;
		/** Draw the drop-slot placeholder before this item index (items.length = at the end).
		 *  Null → none. The drag itself is the consumer's — see the header comment. */
		previewIndex?: number | null;
		/** Extra attributes for each tab (draggable, ondragstart, …) — the consumer's half of the
		 *  drag seam. */
		tabProps?: (item: TabItem) => HTMLAttributes<HTMLDivElement>;
	} = $props();

	const resolved = $derived(resolveActive(items, active));
	// Roving-tabindex targets, bound per tab so arrow keys can move DOM focus with the selection.
	let tabEls = $state<HTMLElement[]>([]);

	let editing = $state<string | null>(null);
	let editValue = $state('');

	function startRename(item: TabItem): void {
		if (!onRename) return;
		editing = item.id;
		editValue = item.label;
	}
	function commitRename(): void {
		if (editing && onRename) onRename(editing, editValue);
		editing = null;
	}
	function focusInput(node: HTMLInputElement): void {
		node.focus();
		node.select();
	}

	const ARROW_KEYS: ArrowKey[] = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];

	function onKeydown(e: KeyboardEvent, item: TabItem): void {
		// A tab is a `div[role=tab]`, not a <button> — the optional per-tab ✕ nests inside it,
		// and an interactive descendant inside a real <button> is invalid ARIA — so Enter/Space
		// activation is authored here rather than inherited.
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(item.id);
			return;
		}
		if (!ARROW_KEYS.includes(e.key as ArrowKey)) return;
		e.preventDefault();
		const current = items.findIndex((it) => it.id === resolved);
		const ni = nextIndex(current, items.length, e.key as ArrowKey);
		if (ni < 0) return;
		onSelect(items[ni].id);
		tabEls[ni]?.focus();
	}
</script>

<div {...rest} class={`ui-tabs ${klass}`.trim()} role="tablist">
	{#each items as item, i (item.id)}
		{#if previewIndex === i}
			<div class="ui-tab-preview" aria-hidden="true"></div>
		{/if}
		{#if editing === item.id}
			<!-- The rename editor replaces the tab for its duration: an input cannot live inside a
			     <button>, and the tab's whole face IS the field while renaming. -->
			<div class="ui-tab active editing">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					{...IDENTIFIER_ATTRS}
					class="ui-tab-rename"
					aria-label="Tab name"
					value={editValue}
					oninput={(e) => (editValue = e.currentTarget.value)}
					onblur={commitRename}
					onkeydown={(e) => {
						if (e.key === 'Enter') commitRename();
						else if (e.key === 'Escape') editing = null;
					}}
					use:focusInput
				/>
			</div>
		{:else}
			<div
				bind:this={tabEls[i]}
				role="tab"
				class="ui-tab"
				class:active={item.id === resolved}
				aria-selected={item.id === resolved}
				tabindex={item.id === resolved ? 0 : -1}
				onclick={() => onSelect(item.id)}
				ondblclick={() => startRename(item)}
				onkeydown={(e) => onKeydown(e, item)}
				{...tabProps?.(item)}
			>
				<span class="ui-tab-label">{item.label}</span>
				{#if onClose}
					<button
						type="button"
						class="ui-tab-close"
						tabindex="-1"
						aria-label="Close tab"
						title="Close tab"
						onclick={(e) => {
							e.stopPropagation();
							onClose(item.id);
						}}><Icon name="x" /></button
					>
				{/if}
			</div>
		{/if}
	{/each}
	{#if previewIndex === items.length}
		<div class="ui-tab-preview" aria-hidden="true"></div>
	{/if}
	{#if onAdd}
		<button type="button" class="ui-tab-add" aria-label="New tab" title="New tab" onclick={onAdd}
			><Icon name="plus" /></button
		>
	{/if}
</div>

<style>
	/* The strip sits at the header surface; the active tab drops out of it onto the body surface.
	   Two more per-instance hooks beside the surface pair: `--panelty-tab-align` and `--panelty-tab-pad`. The
	   default (bottom-hugged pills under a breathing-room inset) is the inspector's strip look;
	   the header's layout bar sets `stretch`/`0` so each pill spans the full strip and its LABEL
	   centres on the bar's midline — level with the ＋ and the rest of the header row — while the
	   pill still reaches the bottom edge it merges over (stretch touches both edges). */
	.ui-tabs {
		display: flex;
		align-items: var(--panelty-tab-align, flex-end);
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
		min-width: 0;
		padding: var(
			--panelty-tab-pad,
			var(--panelty-space-2, var(--panelty-space-2-default))
				var(--panelty-space-2, var(--panelty-space-2-default)) 0
		);
		background: var(--panelty-tab-surface, var(--panelty-surface-2, var(--panelty-surface-2-default)));
		font-family: var(--panelty-font-sans, var(--panelty-font-sans-default));
	}
	.ui-tab {
		flex: 0 1 auto;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		min-height: var(--panelty-hit, var(--panelty-hit-default));
		padding:
			var(--panelty-space-3, var(--panelty-space-3-default))
			var(--panelty-space-6, var(--panelty-space-6-default));
		/* `--panelty-tab-fs`: the header's strip takes the bar's integer chrome size so its labels share
		   the one baseline row (`--panelty-tab-fs`); an unset strip keeps the fluid default. */
		font-size: var(--panelty-tab-fs, var(--panelty-fs-small, var(--panelty-fs-small-default)));
		/* Inactive tabs read as part of the header strip. */
		background: var(--panelty-tab-surface, var(--panelty-surface-2, var(--panelty-surface-2-default)));
		color: var(--panelty-text-dim, var(--panelty-text-dim-default));
		border: none;
		border-radius:
			var(--panelty-radius-sm, var(--panelty-radius-sm-default))
			var(--panelty-radius-sm, var(--panelty-radius-sm-default))
			0
			0;
		cursor: pointer;
		transition:
			background var(--panelty-motion, var(--panelty-motion-default)),
			color var(--panelty-motion, var(--panelty-motion-default));
	}
	.ui-tab-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ui-tab:hover:not(.active) {
		background: var(--panelty-surface-3, var(--panelty-surface-3-default));
		color: var(--panelty-text, var(--panelty-text-default));
	}
	/* The connected look: the active tab drops to the body surface so it merges with the panel body
	   painted flush beneath it (same `--panelty-tab-body` token) — one piece, no line. */
	.ui-tab.active {
		background: var(--panelty-tab-body, var(--panelty-surface-1, var(--panelty-surface-1-default)));
		color: var(--panelty-text, var(--panelty-text-default));
		font-weight: 600;
		cursor: default;
	}
	/* Keyboard focus ring — the app :focus-visible convention (never suppressed). */
	.ui-tab:focus-visible {
		outline:
			var(--panelty-focus-width, var(--panelty-focus-width-default))
			solid
			var(--panelty-focus-ink, var(--panelty-focus-ink-default));
		outline-offset: -2px;
	}

	/* --- the opt-in affordances ------------------------------------------------------------- */

	/* The per-tab ✕ HOLDS ITS SEAT: its 16px box and left gap are reserved on every closable
	   tab, hovered or not, so a tab never grows on hover and jumps its neighbours sideways
	   (Phil, 2026-08-08). At rest only the INK is gone — `opacity` hides it and
	   `pointer-events: none` keeps the invisible button from taking the tap a hybrid
	   touchscreen aims at the tab itself; the coarse door below rests it fully open instead
	   (a hover reveal is unreachable on a device with no hover). */
	.ui-tab-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		margin-left: var(--panelty-space-2, var(--panelty-space-2-default));
		padding: 0;
		background: transparent;
		border: none;
		color: var(--panelty-text-muted, var(--panelty-text-muted-default));
		opacity: 0;
		pointer-events: none;
		cursor: pointer;
		transition:
			opacity var(--panelty-motion, var(--panelty-motion-default)),
			color var(--panelty-motion, var(--panelty-motion-default));
	}
	.ui-tab:hover .ui-tab-close,
	.ui-tab.active .ui-tab-close {
		opacity: 1;
		pointer-events: auto;
	}
	.ui-tab-close :global(svg) {
		width: 12px;
		height: 12px;
		flex: 0 0 auto;
	}
	.ui-tab-close:hover {
		color: var(--panelty-danger, var(--panelty-danger-default));
	}

	/* The trailing ＋. Self-styled like the tabs beside it (this is a leaf primitive — it does not
	   compose IconButton, whose --panelty-hit floor would leave the ＋ towering over the strip). */
	.ui-tab-add {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		color: var(--panelty-text-dim, var(--panelty-text-dim-default));
		cursor: pointer;
		transition:
			background var(--panelty-motion, var(--panelty-motion-default)),
			color var(--panelty-motion, var(--panelty-motion-default));
	}
	.ui-tab-add :global(svg) {
		width: 14px;
		height: 14px;
	}
	.ui-tab-add:hover {
		background: var(--panelty-surface-3, var(--panelty-surface-3-default));
		color: var(--panelty-text, var(--panelty-text-default));
	}
	.ui-tab-add:focus-visible {
		outline:
			var(--panelty-focus-width, var(--panelty-focus-width-default))
			solid
			var(--panelty-focus-ink, var(--panelty-focus-ink-default));
		outline-offset: -2px;
	}

	/* The drop-slot placeholder: a tab-sized slot at the drop index so the landing spot is obvious
	   and the ＋ shifts over to make room. */
	.ui-tab-preview {
		flex: 0 0 auto;
		align-self: center;
		width: 96px;
		height: 26px;
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		border: 1px dashed var(--panelty-accent, var(--panelty-accent-default));
		background: color-mix(
			in srgb,
			var(--panelty-accent, var(--panelty-accent-default)) 14%,
			transparent
		);
	}

	/* The inline rename editor — the tab's face becomes the field. */
	.ui-tab.editing {
		cursor: text;
	}
	.ui-tab-rename {
		width: 9ch;
		padding: 1px var(--panelty-space-2, var(--panelty-space-2-default));
		font: inherit;
		font-size: var(--panelty-tab-fs, var(--panelty-fs-small, var(--panelty-fs-small-default)));
	}

	/* Touch. The ✕ is hover-revealed, so on a device with no hover it is not merely
	   invisible — it is unreachable. Resting its ink open (and its pointer live) is half the
	   fix; a 16px seat a finger cannot land on is the other half. The rename input is raised
	   to 16px so iOS does not force-zoom the page on focus. */
	@media (hover: none) and (pointer: coarse) {
		/* Rested open, and floored on its BOX — both axes. This was IconButton's `::after` hit rect,
		   and a chrome strip is the one place that idiom does not hold: the pseudo is invisible to
		   anything that asks a control its size, and the first ancestor hiding its overflow clips
		   it away, so a ✕ that measured 16px wide claimed 44 and nothing could tell. The box is the
		   claim nothing can quietly drop. The ✕ does grow, then — the same restore the ＋ takes
		   below — and the negative block margin eats the pill's own vertical padding so it SPANS
		   the pill instead of pushing it past the floor stated there (a host's blanket
		   `button { min-height }` was doing exactly that, which is how the ✕ came to measure 16
		   BY 44). The ink does not grow: it is still the 12px glyph on a transparent ground, and
		   under a fine pointer none of this exists. */
		.ui-tab-close {
			opacity: 1;
			pointer-events: auto;
			width: var(--panelty-hit, var(--panelty-hit-default));
			height: var(--panelty-hit, var(--panelty-hit-default));
			margin-block: calc(-1 * var(--panelty-space-3, var(--panelty-space-3-default)));
		}
		/* The ＋ CAN grow: the pills beside it already stand at --panelty-hit under coarse, so the dense
		   22px box is a fine-pointer affordance only and the floor comes back here — the same
		   restore `density="chrome"` gives an IconButton: the BOX grows, not merely the hit rect. */
		.ui-tab-add {
			width: var(--panelty-hit, var(--panelty-hit-default));
			height: var(--panelty-hit, var(--panelty-hit-default));
		}
		/* The pill itself, on both axes — stated here rather than taken from a host app's blanket
		   `button {}` reset, which a package cannot assume exists. */
		.ui-tab {
			min-height: var(--panelty-hit, var(--panelty-hit-default));
		}
		/* 16px is the iOS force-zoom threshold: a smaller field zooms the whole page on focus. */
		.ui-tab-rename {
			min-height: var(--panelty-hit, var(--panelty-hit-default));
			font-size: 16px;
		}
	}
</style>
