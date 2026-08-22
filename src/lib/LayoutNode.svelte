<!--
  Recursive renderer for the layout tree. A `panel` leaf renders `Panel`; a `stack` renders ONE of
  its children under one shared header; a `split` lays its children out with flexbox (grow = size
  fraction) and inserts a `Splitter` between each adjacent pair. Children are keyed by id so a
  panel's component instance survives content/state changes and tree reshapes.

  A stack whose shown child is a panel hands that panel the stack as its header — one header for the
  group, never one per member stacked on top of another.
-->
<script lang="ts">
	import type { LayoutNode } from './model';
	import { workspace } from './workspace.svelte';
	import Panel from './Panel.svelte';
	import Splitter from './Splitter.svelte';
	import StackHeader from './StackHeader.svelte';
	import Self from './LayoutNode.svelte';

	let { node }: { node: LayoutNode } = $props();
	const ws = workspace();
	const shown = $derived(
		node.kind === 'stack'
			? (node.children.find((c) => c.id === ws.showing(node.id)) ?? node.children[0])
			: null
	);
</script>

{#if node.kind === 'panel'}
	<Panel {node} header={node} />
{:else if node.kind === 'stack'}
	{#if shown?.kind === 'panel'}
		<Panel node={shown} header={node} />
	{:else if shown}
		<div class="stack">
			<StackHeader {node} />
			<div class="stack-body"><Self node={shown} /></div>
		</div>
	{/if}
{:else}
	<div class="split {node.direction}">
		{#each node.children as child, i (child.id)}
			<div class="slot" style="flex-grow: {node.sizes[i]};">
				<Self node={child} />
			</div>
			{#if i < node.children.length - 1}
				<Splitter
					direction={node.direction}
					onResize={(delta, containerPx) => ws.resize(node.id, i, delta, containerPx)}
					onCommit={() => ws.commitResize(node.id)}
				/>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.split {
		display: flex;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}
	.split.row {
		flex-direction: row;
	}
	.split.column {
		flex-direction: column;
	}
	.slot {
		flex-basis: 0;
		min-width: 0;
		min-height: 0;
		display: flex;
	}
	.stack {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}
	.stack-body {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
</style>
