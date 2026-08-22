<!--
  The ROOT stack's header, for a consumer that hoists it into its own app bar. It is the same
  `StackHeader` every tab group draws — a workspace tab is a child of the root stack and nothing
  else — in its `strip` placement: chips and ＋, and no structural action, because the workspace is
  not a panel.
-->
<script lang="ts">
	import { workspace } from './workspace.svelte';
	import StackHeader from './StackHeader.svelte';

	const ws = workspace();
</script>

<StackHeader node={ws.root} variant="strip" />
