<!--
  Renders the page the root stack is showing — or, under a maximize, the node that names. The page
  is keyed so switching tabs swaps the whole tree.
-->
<script lang="ts">
	import { workspace } from './workspace.svelte';
	import LayoutNode from './LayoutNode.svelte';

	const ws = workspace();
	const shown = $derived(ws.pageRoot);
</script>

<div class="workspace" data-testid="workspace">
	{#if shown}
		{#key ws.page}
			<LayoutNode node={shown} />
		{/key}
	{/if}
</div>

<style>
	.workspace {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		padding: var(--panelty-space-2, var(--panelty-space-2-default));
		gap: 0;
	}
	.workspace :global(> *) {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
</style>
