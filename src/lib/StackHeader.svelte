<!--
  The chrome of one slot: a tab chip per member, the content-type dropdown when there is only one,
  the structural actions, and a right-click / long-press context menu holding every one of them.

  ONE component, two placements. `variant="panel"` is the header inside a panel box — chips (or the
  type dropdown), then Split Right, Split Down, Maximize, ⋯ and ✕. `variant="strip"` is the ROOT
  stack's header, which a consumer hoists into its own app bar: chips and ＋, and no structural
  action, because the workspace is not a panel. A panel and a tab group draw the same header
  because they ARE the same thing — a stack, of one member or of several.

  The right end is a progressive overflow sharing `gesture/overflowFit.ts` with the app
  header rather than restating its arithmetic: Split Right, Split Down and Maximize sit in the
  header while they fit and give themselves up one at a time, lowest priority first, into a ⋯ menu.
  A panel header is the harder case of the two — its width is the PANEL's, not the window's, so two
  panels side by side on a laptop are already narrower than the app header ever gets on a phone.

  Two things differ from the app header, and both are stated at the call site below:
    · the ✕ is NOT in the plan. It is the one control that must be reachable at every width, so it
      is charged off the budget rather than offered a slot in it.
    · the ⋯ is NOT resident (`residentTrigger: false`). Its menu holds the spilled actions and
      nothing else, so at a width where all three fit there is no menu to open and no trigger drawn.

  Naming: the user's "split vertical / split horizontal" is deliberately not the wording used here.
  Those two names mean opposite things in different apps — a "vertical split" is a vertical DIVIDER
  in one editor and a vertical STACK in the next — while this header already had a vocabulary that
  cannot be read two ways, in the context menu these very commands live in. So there is one wording
  and it is the existing one: Split RIGHT is `'row'` (the new panel beside this one) and Split DOWN
  is `'column'` (the new panel under it). One command, one name, two representations — the
  bar button and the menu row are built from the same record below, so they cannot drift.

  The two split ICONS are Lucide's `square-split-horizontal` / `square-split-vertical` as drawn,
  never one of them rotated: Lucide names them for the axis the split runs ALONG, so the
  `-horizontal` one carries the vertical divider (Split Right) and the `-vertical` one the
  horizontal divider (Split Down).
-->
<script lang="ts">
	import { countPanels, type LayoutNode } from './model';
	import { workspace } from './workspace.svelte';
	import { listPanelTypes, resolvePanelType } from './registry';
	import type { MenuItem } from './menu';
	import ContextMenu from './ContextMenu.svelte';
	import { createLongPress, createWidthCache, planOverflow, type OverflowItem } from './gesture';
	import { Button, IconButton, Icon } from './ui';
	import { onDestroy, untrack } from 'svelte';

	let { node, variant = 'panel' }: { node: LayoutNode; variant?: 'panel' | 'strip' } = $props();
	const ws = workspace();

	/** A stack's members, or the one member a lone panel is. */
	const members = $derived(node.kind === 'stack' ? node.children : [node]);
	const activeId = $derived(node.kind === 'stack' ? ws.showing(node.id) : node.id);
	const activeNode = $derived(members.find((m) => m.id === activeId) ?? members[0]);
	/** The type dropdown belongs to a lone panel; a group's members are named by their chips. */
	const soloPanel = $derived(
		variant === 'panel' && members.length === 1 && members[0]?.kind === 'panel'
			? members[0]
			: null
	);
	const chips = $derived(!soloPanel);
	const isMax = $derived(ws.maximizedId === node.id);
	const canClose = $derived(countPanels(ws.root) > countPanels(node));

	/** What a member is CALLED. Nothing in the tree carries a name: a panel is its content's title,
	 * and anything else is its place in the strip. A label that cannot be authored cannot go stale,
	 * and a rename is not addressing — every op names an id. */
	function label(member: LayoutNode, i: number): string {
		return member.kind === 'panel' ? resolvePanelType(member.panelType).title : `Tab ${i + 1}`;
	}

	// `from` discriminates which surface opened this menu: three of them share the one ContextMenu,
	// and only the ⋯ owns an `aria-expanded` that must not light up for the other two.
	let menu = $state<{ x: number; y: number; items: MenuItem[]; from?: 'overflow' } | null>(null);

	/** The ✕, and the menu row beside it. A panel type may TAKE OVER its own close (an agent panel
	 * asks whether to detach or kill first, in the panel holding the terminal); everything else
	 * closes here, as it always did. */
	function requestClose(target: LayoutNode): void {
		if (target.kind === 'panel' && resolvePanelType(target.panelType).confirmClose?.(target.id)) {
			return;
		}
		ws.close(target.id);
	}

	function contentItems(): MenuItem[] {
		const target = activeNode;
		if (target?.kind !== 'panel') return [];
		return listPanelTypes().map((t) => ({
			label: t.title,
			icon: t.icon,
			checked: t.id === target.panelType,
			action: () => ws.setType(target.id, t.id)
		}));
	}

	function openContent(e: MouseEvent): void {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menu = { x: r.left, y: r.bottom + 2, items: contentItems() };
	}

	// --- the structural actions, in one place --------------------------------

	interface HdrAction {
		/** Stable id — the button's `data-testid`, and its key in the spill order. */
		id: string;
		icon: string;
		/** The menu row's text. */
		label: string;
		/** The button's accessible name: an icon says nothing on its own. */
		name: string;
		/** Set on an action that TOGGLES, so the control can say which way it is. */
		pressed?: boolean;
		run: () => void;
	}

	/**
	 * LOWEST PRIORITY FIRST — which is also the DOM order, so the header empties from the left and
	 * whatever survives stays adjacent to the ⋯ it is spilling into.
	 *
	 * Maximize is kept longest on purpose: it is the small-screen mechanism, so it is
	 * the last action a narrowing panel should make a user open a menu for. Between the two splits,
	 * a narrow panel is a tall one, so stacking (Split Down) outlives splitting beside it.
	 */
	function actions(): HdrAction[] {
		return [
			{
				id: 'panel-split-row',
				icon: 'square-split-horizontal',
				label: 'Split Right',
				name: 'Split panel right',
				run: () => ws.split(node.id, 'row')
			},
			{
				id: 'panel-split-column',
				icon: 'square-split-vertical',
				label: 'Split Down',
				name: 'Split panel down',
				run: () => ws.split(node.id, 'column')
			},
			{
				id: 'panel-maximize',
				// The one control in the header that is a TOGGLE, so it is the one that has to draw
				// its state. It used to sit on `maximize-2` in both positions and say which way it
				// was through `title` alone — a tooltip, which is to say: nothing a user sees.
				icon: isMax ? 'minimize-2' : 'maximize-2',
				label: isMax ? 'Restore' : 'Maximize',
				name: isMax ? 'Restore panel' : 'Maximize panel',
				pressed: isMax,
				run: () => ws.toggleMaximize(node.id)
			}
		];
	}

	const asRow = (a: HdrAction): MenuItem => ({ label: a.label, icon: a.icon, action: a.run });

	function structuralItems(): MenuItem[] {
		const [right, down, max] = actions();
		const content = contentItems();
		return [
			asRow(right),
			asRow(down),
			{ separator: true },
			asRow(max),
			...(content.length ? [{ label: 'Change content', items: content }] : []),
			{ separator: true },
			{
				label: 'Close Panel',
				icon: 'x',
				disabled: !canClose,
				action: () => requestClose(activeNode ?? node)
			}
		];
	}

	function onHeaderContext(e: MouseEvent): void {
		if (variant === 'strip') return;
		e.preventDefault();
		menu = { x: e.clientX, y: e.clientY, items: structuralItems() };
	}

	/**
	 * The coarse-pointer door onto the same menu. Split Right and Split Down had NO other
	 * door — the header is a `role="toolbar" tabindex="-1"` with no keydown handler, and its menu
	 * was `oncontextmenu`-only — so on a phone a panel could not be split at all.
	 *
	 * Armed for `touch` alone, and the editor's own recognizer is reused rather than a second
	 * gesture concept invented. It never calls `stopPropagation`, so the same pointerdown still
	 * reaches `Panel.svelte`'s capture-phase `setActive` — freezing `activePanelId` is how a
	 * swallowed press would quietly drift every panel's selection scoping.
	 */
	const headerPress = createLongPress((at) => {
		if (variant === 'strip') return;
		menu = { x: at.clientX, y: at.clientY, items: structuralItems() };
	});

	function onHeaderPointerDown(e: PointerEvent): void {
		if (e.pointerType !== 'touch') return;
		// The header's own controls keep their own actions: a press that landed on ✕ would both
		// open a menu and, on release, close the panel the menu describes.
		if ((e.target as HTMLElement | null)?.closest('button')) return;
		headerPress.start(e);
	}

	// A press in flight must not fire into an unmounted panel (a close, a tab switch, a split).
	onDestroy(headerPress.cancel);

	// --- the drag, both ways -------------------------------------------------

	let dropIndex = $state<number | null>(null);
	const showPreview = $derived(!!ws.dragging && dropIndex !== null);

	function chipIndexAt(container: HTMLElement, clientX: number): number {
		const els = [...container.querySelectorAll<HTMLElement>('.pt-chip')];
		for (let i = 0; i < els.length; i++) {
			const r = els[i].getBoundingClientRect();
			if (clientX < r.left + r.width / 2) return i;
		}
		return els.length;
	}

	function onBarDragOver(e: DragEvent): void {
		if (!ws.dragging) return;
		e.preventDefault();
		dropIndex = chipIndexAt(e.currentTarget as HTMLElement, e.clientX);
	}
	function onBarDragLeave(e: DragEvent): void {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropIndex = null;
	}
	function onBarDrop(e: DragEvent): void {
		const idx = dropIndex ?? members.length;
		dropIndex = null;
		if (!ws.dragging) return;
		e.preventDefault();
		// The stack this header DRAWS. For a lone panel that is the panel itself, and the host wraps
		// it — so dropping on a panel's header groups the two, and dropping on a group's joins it.
		ws.dropOn({ stack: node.id, index: idx });
	}

	// --- progressive overflow -----------------------------------------

	const TRIGGER = 'panel-overflow';
	const CLOSE = 'panel-close';

	let headerEl = $state<HTMLDivElement | null>(null);
	let zoneEl = $state<HTMLDivElement | null>(null);
	let spilled = $state<Set<string>>(new Set());

	const isSpilled = (id: string): boolean => spilled.has(id);

	function px(el: Element, prop: string): number {
		return parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
	}

	/** The three actions' intrinsic widths and the trigger's, read with none of them hidden.
	 *
	 * The hide class is stripped and restored inside one synchronous block, so nothing is painted
	 * mid-measurement and Svelte's own class bookkeeping stays correct (it re-applies from
	 * `spilled` on the next update either way). Only runs when the root font size moved — which is
	 * what the coarse `--panelty-hit` floor does to every one of these boxes at once. */
	function measureWidths(): number[] {
		const host = zoneEl;
		if (!host) return [];
		const hidden = [...host.querySelectorAll<HTMLElement>('.spilled')];
		for (const el of hidden) el.classList.remove('spilled');
		const widths = [...actions().map((a) => a.id), TRIGGER].map(
			(id) =>
				host.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.getBoundingClientRect().width ?? 0
		);
		for (const el of hidden) el.classList.add('spilled');
		return widths;
	}

	const widthCache = createWidthCache(measureWidths);

	function replan(): void {
		const bar = headerEl;
		const host = zoneEl;
		if (!bar || !host) return;
		const names = bar.querySelector<HTMLElement>('.pt-names');
		const close = host.querySelector<HTMLElement>(`[data-testid="${CLOSE}"]`);
		if (!names || !close) return;
		const widths = widthCache.widths(px(document.documentElement, 'font-size'));
		if (widths.length === 0) return;
		const ids = actions().map((a) => a.id);
		const items: OverflowItem[] = ids.map((id, i) => ({ id, width: widths[i] }));

		const gap = px(host, 'gap');
		// MEASURED each replan, off the boxes that do not move when an action spills: the header's
		// own inner width, less the names region and the two gaps around the flexible spacer.
		// Never the action zone's OWN width — that is exactly what shrinks the moment an item
		// leaves, and reading it is the oscillation bug `overflowFit.ts` opens with.
		const zone =
			bar.clientWidth -
			px(bar, 'padding-left') -
			px(bar, 'padding-right') -
			Math.min(names.getBoundingClientRect().width, bar.clientWidth / 2) -
			px(bar, 'gap') * 2;
		// …and the ✕ is charged off the top with the gap beside it, rather than given a slot in the
		// plan. That IS the always-visible guarantee: an action can only ever spill into space the
		// close button has already been paid out of.
		const budget = zone - close.getBoundingClientRect().width - gap;

		const next = planOverflow(items, ids, {
			gap,
			budget,
			trigger: widths[widths.length - 1],
			residentTrigger: false
		});
		// Write only on a real change: the observer re-fires on the layout this write causes, and an
		// unconditional assignment would keep the effect alive forever though the plan has converged.
		if (next.size !== spilled.size || [...next].some((id) => !spilled.has(id))) spilled = next;
	}

	$effect(() => {
		const bar = headerEl;
		if (variant === 'strip' || !bar || !zoneEl) return;
		const ro = new ResizeObserver(replan);
		ro.observe(bar);
		// …and the names region, whose width is a term in the budget and moves on its own when the
		// panel changes type ("Node Editor" is not "Console") or gains a tab.
		const names = bar.querySelector<HTMLElement>('.pt-names');
		if (names) ro.observe(names);
		// `untrack`: replan READS `spilled` to decide whether the plan changed, and writing it from
		// inside a tracked call would make this effect its own dependency.
		untrack(replan);
		// The first measurement can land before the webfont does, and the dropdown is a text button
		// — a different number of pixels in the fallback face, which no resize reports.
		let live = true;
		void document.fonts?.ready.then(() => {
			if (!live) return;
			widthCache.invalidate();
			replan();
		});
		return () => {
			live = false;
			ro.disconnect();
		};
	});

	/** The bar's own actions, but only the ones that no longer fit — same commands, second
	 *  representation, one record. */
	const spilledItems = (): MenuItem[] =>
		actions()
			.filter((a) => isSpilled(a.id))
			.map(asRow);

	function openOverflow(e: MouseEvent): void {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menu = {
			x: Math.max(6, r.right - 180),
			y: r.bottom + 4,
			items: spilledItems(),
			from: 'overflow'
		};
	}
</script>

<div
	class="panel-header {variant}"
	class:maximized={isMax}
	class:dragover={!!ws.dragging}
	bind:this={headerEl}
	draggable={variant === 'panel' && !!soloPanel}
	oncontextmenu={onHeaderContext}
	onpointerdown={onHeaderPointerDown}
	onpointermove={headerPress.move}
	onpointerup={headerPress.cancel}
	onpointercancel={headerPress.cancel}
	ondragstart={(e) => {
		// Don't start a move when the drag begins on a control or a chip (chips carry their own).
		if ((e.target as HTMLElement).closest('button, select, input, .pt-chip')) {
			e.preventDefault();
			return;
		}
		ws.dragging = { node: node.id };
	}}
	ondragend={() => (ws.dragging = null)}
	ondragover={onBarDragOver}
	ondragleave={onBarDragLeave}
	ondrop={onBarDrop}
	role="toolbar"
	tabindex="-1"
	aria-label={variant === 'strip' ? 'Workspace tabs' : 'Panel header'}
	data-testid={variant === 'strip' ? 'workspace-tabs' : 'panel-header'}
>
	<div class="pt-names thin-scrollbar" role={chips ? 'tablist' : undefined}>
		{#if soloPanel}
			<Button
				variant="ghost"
				class="content-btn"
				onclick={openContent}
				title="Change panel content"
			>
				{#if resolvePanelType(soloPanel.panelType).icon}
					<span class="ic"><Icon name={resolvePanelType(soloPanel.panelType).icon!} /></span>
				{/if}
				<span class="title">{resolvePanelType(soloPanel.panelType).title}</span>
				<span class="caret"><Icon name="chevron-down" /></span>
			</Button>
		{:else}
			{#each members as member, i (member.id)}
				{#if showPreview && dropIndex === i}
					<div class="pt-preview" aria-hidden="true"></div>
				{/if}
				<div
					class="pt-chip"
					class:active={member.id === activeId}
					role="tab"
					aria-selected={member.id === activeId}
					tabindex={member.id === activeId ? 0 : -1}
					draggable="true"
					onclick={() => ws.show(node.id, member.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							ws.show(node.id, member.id);
						}
					}}
					ondragstart={() => (ws.dragging = { node: member.id })}
					ondragend={() => (ws.dragging = null)}
				>
					<span class="pt-label">{label(member, i)}</span>
					{#if canClose || members.length > 1}
						<button
							type="button"
							class="pt-close"
							tabindex="-1"
							aria-label="Close tab"
							title="Close tab"
							onclick={(e) => {
								e.stopPropagation();
								requestClose(member);
							}}><Icon name="x" /></button
						>
					{/if}
				</div>
			{/each}
			{#if showPreview && dropIndex === members.length}
				<div class="pt-preview" aria-hidden="true"></div>
			{/if}
			<button
				type="button"
				class="pt-add"
				aria-label="New tab"
				title="New tab"
				onclick={() => ws.add(node.id)}><Icon name="plus" /></button
			>
		{/if}
	</div>
	{#if variant === 'panel'}
		<div class="spacer"></div>
		<div class="hdr-actions" bind:this={zoneEl}>
			{#each actions() as a (a.id)}
				<IconButton
					variant="ghost"
					density="chrome"
					class={`hdr-btn${isSpilled(a.id) ? ' spilled' : ''}`}
					data-testid={a.id}
					title={a.label}
					label={a.name}
					aria-pressed={a.pressed}
					onclick={a.run}><Icon name={a.icon} /></IconButton
				>
			{/each}
			<!-- Not resident: it goes when there is nothing behind it. It stays in the DOM either way so
			     its width can be measured, which is the one thing the plan needs from it. -->
			<IconButton
				variant="ghost"
				density="chrome"
				class={`hdr-btn${spilled.size ? '' : ' spilled'}`}
				data-testid={TRIGGER}
				aria-expanded={menu?.from === 'overflow'}
				title="More panel actions"
				label="More panel actions"
				onclick={openOverflow}><Icon name="ellipsis" /></IconButton
			>
			<IconButton
				variant="ghost"
				density="chrome"
				class="hdr-btn"
				data-testid={CLOSE}
				title="Close panel"
				label="Close panel"
				disabled={!canClose}
				onclick={() => requestClose(activeNode ?? node)}><Icon name="x" /></IconButton
			>
		</div>
	{/if}
</div>

{#if menu}
	<ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => (menu = null)} />
{/if}

<style>
	.panel-header {
		display: flex;
		align-items: center;
		height: var(--panelty-panel-header-h, var(--panelty-panel-header-h-default));
		flex: 0 0 auto;
		padding: 0 var(--panelty-space-2, var(--panelty-space-2-default));
		/* The TOP rung of the panel's own ladder — body `--panelty-surface-1`, content toolbar `--panelty-surface-2`,
		   this `--panelty-surface-3` — so each adjacency is a real step and none needs a hairline, not
		   even the one 26px inside the panel edge. */
		background: var(--panelty-surface-3, var(--panelty-surface-3-default));
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
		user-select: none;
		cursor: grab;
		min-width: 0;
	}
	/* The strip is the ROOT stack's header, hoisted into the consumer's app bar: it blends with the
	   bar rather than painting its own header surface, and it is never a drag handle itself. */
	.panel-header.strip {
		background: transparent;
		height: 100%;
		padding: 0;
		cursor: default;
	}
	.panel-header.dragover {
		background: color-mix(
			in srgb,
			var(--panelty-accent, var(--panelty-accent-default)) 7%,
			transparent
		);
	}
	.panel-header:active {
		cursor: grabbing;
	}
	.panel-header.strip:active {
		cursor: default;
	}

	.pt-names {
		display: flex;
		align-items: stretch;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
	}
	.panel-header.strip .pt-names {
		flex: 1 1 auto;
		height: 100%;
	}

	.pt-chip {
		display: flex;
		align-items: center;
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
		padding: 0 var(--panelty-space-2, var(--panelty-space-2-default));
		min-height: var(--panelty-hit, var(--panelty-hit-default));
		min-width: 0;
		white-space: nowrap;
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		font-size: var(--panelty-fs-chrome, var(--panelty-fs-chrome-default));
		color: var(--panelty-text-dim, var(--panelty-text-dim-default));
		cursor: pointer;
	}
	.pt-chip.active {
		background: var(--panelty-bg, var(--panelty-bg-default));
		color: var(--panelty-text, var(--panelty-text-default));
	}
	.pt-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pt-close,
	.pt-add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--panelty-hit, var(--panelty-hit-default));
		min-height: var(--panelty-hit, var(--panelty-hit-default));
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
	}
	.pt-close {
		opacity: 0;
	}
	.pt-chip:hover .pt-close,
	.pt-chip.active .pt-close,
	.pt-close:focus-visible {
		opacity: 1;
	}
	@media (hover: none) and (pointer: coarse) {
		.pt-close {
			opacity: 1;
		}
	}
	.pt-preview {
		flex: 0 0 auto;
		width: 3rem;
		border-radius: var(--panelty-radius-sm, var(--panelty-radius-sm-default));
		background: color-mix(
			in srgb,
			var(--panelty-accent, var(--panelty-accent-default)) 18%,
			transparent
		);
	}

	.spacer {
		flex: 1 1 auto;
		min-width: 0;
	}
	.hdr-actions {
		display: flex;
		align-items: center;
		flex: 0 0 auto;
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
	}
	.hdr-actions :global(.spilled) {
		display: none;
	}
	.panel-header :global(.content-btn) {
		display: inline-flex;
		align-items: center;
		gap: var(--panelty-space-1, var(--panelty-space-1-default));
		min-width: 0;
	}
	.panel-header :global(.content-btn .title) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ic,
	.caret {
		display: inline-flex;
		align-items: center;
	}
</style>
