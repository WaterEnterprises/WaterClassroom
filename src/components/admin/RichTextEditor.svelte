<script lang="ts">
  // Lightweight contenteditable rich text editor (no external deps).
  // Emits HTML via bind:value — sanitized server-side before storage.
  import {
    Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Quote,
    Link2, Undo2, Redo2, Code2,
  } from 'lucide-svelte';

  let {
    value = $bindable(''),
    placeholder = 'Write the lesson content…',
    minHeight = '260px',
  }: {
    value?: string;
    placeholder?: string;
    minHeight?: string;
  } = $props();

  let editorEl: HTMLDivElement | null = $state(null);
  // Last HTML we synced — lets us tell user typing apart from external
  // updates (lesson switch / async load) so we never fight the caret.
  let lastSynced = $state('');

  function sync() {
    if (editorEl) {
      value = editorEl.innerHTML;
      lastSynced = value;
    }
  }

  $effect(() => {
    const incoming = value || '';
    if (editorEl && incoming !== lastSynced && editorEl.innerHTML !== incoming) {
      editorEl.innerHTML = incoming;
      lastSynced = incoming;
    }
  });

  function exec(cmd: string, arg?: string) {
    editorEl?.focus();
    document.execCommand(cmd, false, arg);
    sync();
  }

  function addLink() {
    const url = prompt('Link URL (https://…)');
    if (url) exec('createLink', url);
  }

  const tools: Array<{ icon: any; title: string; run: () => void }> = [
    { icon: Bold, title: 'Bold', run: () => exec('bold') },
    { icon: Italic, title: 'Italic', run: () => exec('italic') },
    { icon: Underline, title: 'Underline', run: () => exec('underline') },
    { icon: Heading1, title: 'Heading 1', run: () => exec('formatBlock', '<h2>') },
    { icon: Heading2, title: 'Heading 2', run: () => exec('formatBlock', '<h3>') },
    { icon: List, title: 'Bullet list', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, title: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: Quote, title: 'Quote', run: () => exec('formatBlock', '<blockquote>') },
    { icon: Code2, title: 'Code block', run: () => exec('formatBlock', '<pre>') },
    { icon: Link2, title: 'Insert link', run: addLink },
    { icon: Undo2, title: 'Undo', run: () => exec('undo') },
    { icon: Redo2, title: 'Redo', run: () => exec('redo') },
  ];
</script>

<div class="rounded-xl overflow-hidden border border-slate-700 bg-slate-950/60 focus-within:border-blue-500 transition">
  <div class="flex flex-wrap gap-0.5 p-1.5 border-b border-slate-800 bg-slate-900/70">
    {#each tools as tool (tool.title)}
      <button
        type="button"
        title={tool.title}
        onclick={tool.run}
        class="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
      >
        <tool.icon class="w-4 h-4" />
      </button>
    {/each}
  </div>
  <div
    bind:this={editorEl}
    contenteditable="true"
    oninput={sync}
    onblur={sync}
    data-placeholder={placeholder}
    class="rich-editor-content p-4 overflow-y-auto text-sm text-slate-200 outline-none"
    style="min-height: {minHeight}"
  ></div>
</div>

<style>
  .rich-editor-content:empty::before {
    content: attr(data-placeholder);
    color: #64748b;
    pointer-events: none;
  }
  .rich-editor-content :global(h2) { font-size: 1.25rem; font-weight: 800; color: #fff; margin: 0.8em 0 0.4em; }
  .rich-editor-content :global(h3) { font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0.7em 0 0.3em; }
  .rich-editor-content :global(p) { margin: 0.5em 0; }
  .rich-editor-content :global(ul) { list-style: disc; padding-left: 1.4em; margin: 0.5em 0; }
  .rich-editor-content :global(ol) { list-style: decimal; padding-left: 1.4em; margin: 0.5em 0; }
  .rich-editor-content :global(blockquote) { border-left: 3px solid #3b82f6; padding-left: 0.8em; color: #94a3b8; margin: 0.6em 0; }
  .rich-editor-content :global(pre) { background: #0f172a; border: 1px solid #1e293b; border-radius: 0.5rem; padding: 0.8em; font-family: var(--font-mono); font-size: 0.8rem; overflow-x: auto; }
  .rich-editor-content :global(a) { color: #60a5fa; text-decoration: underline; }
</style>
