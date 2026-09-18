<script lang="ts">
  // Courses ONLY: list the courses in one grade as buttons, create / rename /
  // move / delete. Grades and lessons live in their own components.
  import { Plus, Trash2, Pencil, Check, X } from 'lucide-svelte';
  import { fly } from 'svelte/transition';

  interface Course { id: string; grade_id?: string; name: string; }
  interface MoveGrade { id: string; label: string; }

  let {
    title,
    gradeId,
    courses,
    directCount,
    showDirect,
    selectedCourseId,
    directId,
    moveGrades,
    lessonCounts,
    onSelect,
    onSelectDirect,
    onCreate,
    onRename,
    onMove,
    onDelete,
  }: {
    title: string;
    gradeId: string;
    courses: Course[];
    directCount: number;
    showDirect: boolean;
    selectedCourseId: string;
    directId: string;
    moveGrades: MoveGrade[];
    lessonCounts: Record<string, number>;
    onSelect: (id: string) => void;
    onSelectDirect: () => void;
    onCreate: (data: { grade_id: string; name: string; description: string }) => Promise<void>;
    onRename: (id: string, data: { name: string }) => Promise<void>;
    onMove: (id: string, gradeId: string) => Promise<void>;
    onDelete: (id: string, name: string) => Promise<void>;
  } = $props();

  let showForm = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let busy = $state(false);
  let renamingId = $state('');
  let renameName = $state('');

  async function submitCreate() {
    if (!newName.trim() || busy || !gradeId) return;
    busy = true;
    try {
      await onCreate({ grade_id: gradeId, name: newName.trim(), description: newDesc.trim() });
      showForm = false;
      newName = ''; newDesc = '';
    } finally {
      busy = false;
    }
  }

  async function submitRename(id: string) {
    if (!renameName.trim() || busy) return;
    busy = true;
    try {
      await onRename(id, { name: renameName.trim() });
      renamingId = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-2xl border border-indigo-900/40 bg-indigo-950/10 p-3 space-y-2">
  <div class="flex items-center justify-between px-1">
    <h4 class="text-[10px] uppercase font-mono tracking-widest text-indigo-400 font-bold">{title} ({courses.length})</h4>
    {#if gradeId}
      <button onclick={() => { showForm = !showForm; }} class="text-[9px] font-bold px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition">
        {#if showForm}<X class="w-3 h-3" /> Cancel{:else}<Plus class="w-3 h-3" /> Course{/if}
      </button>
    {/if}
  </div>

  {#if showForm && gradeId}
    <div transition:fly={{ y: -6 }} class="rounded-xl border border-indigo-800/50 bg-indigo-950/20 p-3 space-y-2">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input bind:value={newName} placeholder="Course name (e.g. Mathematics)"
          class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-indigo-500" />
        <input bind:value={newDesc} placeholder="Short description"
          class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-indigo-500" />
      </div>
      <div class="flex items-center gap-2">
        <button onclick={submitCreate} disabled={busy || !newName.trim()}
          class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold transition">
          {busy ? 'Adding…' : 'Add Course'}
        </button>
        <button onclick={() => { showForm = false; }} class="text-[10px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
      </div>
    </div>
  {/if}

  {#if courses.length === 0}
    <p class="text-[10px] text-slate-600 px-2 py-1.5">No courses here yet{gradeId ? ' — add the first one above.' : '.'}</p>
  {/if}
  {#each courses as c (c.id)}
    {@const isSel = selectedCourseId === c.id}
    <div class="flex items-center gap-1">
      {#if renamingId === c.id}
        <div class="flex items-center gap-1.5 flex-1">
          <input bind:value={renameName}
            onkeydown={(e) => { if (e.key === 'Enter') submitRename(c.id); if (e.key === 'Escape') renamingId = ''; }}
            class="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-slate-950/70 border border-indigo-500 text-xs text-white outline-none" />
          <button onclick={() => submitRename(c.id)} class="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition" title="Save"><Check class="w-3.5 h-3.5" /></button>
          <button onclick={() => { renamingId = ''; }} class="p-2 rounded-lg text-slate-400 hover:text-white transition" title="Cancel"><X class="w-3.5 h-3.5" /></button>
        </div>
      {:else}
        <button onclick={() => onSelect(c.id)}
          class="flex-1 text-left px-3 py-2 rounded-xl text-xs transition border {isSel
            ? 'bg-indigo-600/20 border-indigo-500 text-white'
            : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
          <span class="font-bold block">{c.name}</span>
          <span class="text-[9px] text-slate-500">{lessonCounts[c.id] ?? 0} lessons</span>
        </button>
        <button onclick={() => { renamingId = c.id; renameName = c.name; }} title="Rename course"
          class="p-2 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-950/40 transition">
          <Pencil class="w-3 h-3" />
        </button>
        <button onclick={() => onDelete(c.id, c.name)} title="Delete course (lessons stay in the grade)"
          class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
          <Trash2 class="w-3 h-3" />
        </button>
      {/if}
    </div>
    {#if isSel}
      <div class="flex items-center gap-2 pl-1 pr-1 -mt-1">
        <span class="text-[9px] uppercase font-mono text-slate-500 font-bold">Move to grade:</span>
        <select value={c.grade_id || ''} onchange={(e) => onMove(c.id, (e.target as HTMLSelectElement).value)}
          class="flex-1 text-[10px] bg-slate-950/70 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 outline-none">
          <option value="">No grade (unassigned)</option>
          {#each moveGrades as g}<option value={g.id}>{g.label}</option>{/each}
        </select>
      </div>
    {/if}
  {/each}

  {#if showDirect}
    <button onclick={onSelectDirect}
      class="w-full text-left px-3 py-2 rounded-xl text-xs transition border border-dashed {selectedCourseId === directId
        ? 'bg-slate-700/40 border-slate-400 text-white'
        : 'bg-slate-950/30 border-slate-700 text-slate-400 hover:border-slate-500'}">
      <span class="font-bold block">📄 Direct lessons ({directCount})</span>
      <span class="text-[9px] text-slate-500">Lessons straight in the grade, no course</span>
    </button>
  {/if}
</div>
