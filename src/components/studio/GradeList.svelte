<script lang="ts">
  // Grades ONLY: list the track's grades as buttons, create / rename / delete.
  // Courses and lessons live in their own components.
  import { Plus, Trash2, Pencil, Check, X } from 'lucide-svelte';
  import { fly } from 'svelte/transition';

  interface Grade { id: string; grade_level: string; label: string; }

  let {
    grades,
    selectedGradeId,
    stats,
    ungroupedCount,
    unassignedCount,
    ugLessonsId,
    ugCoursesId,
    onSelect,
    onCreate,
    onRename,
    onDelete,
  }: {
    grades: Grade[];
    selectedGradeId: string;
    stats: Record<string, { courses: number; lessons: number }>;
    ungroupedCount: number;
    unassignedCount: number;
    ugLessonsId: string;
    ugCoursesId: string;
    onSelect: (id: string) => void;
    onCreate: (data: { grade_level: string; label: string }) => Promise<void>;
    onRename: (id: string, data: { label: string; grade_level: string }) => Promise<void>;
    onDelete: (id: string, label: string) => Promise<void>;
  } = $props();

  let showForm = $state(false);
  let newLevel = $state('');
  let newLabel = $state('');
  let busy = $state(false);
  let renamingId = $state('');
  let renameLabel = $state('');
  let renameLevel = $state('');

  async function submitCreate() {
    if (!newLevel.trim() || busy) return;
    busy = true;
    try {
      await onCreate({ grade_level: newLevel.trim(), label: newLabel.trim() || `Grade ${newLevel.trim()}` });
      showForm = false;
      newLevel = ''; newLabel = '';
    } finally {
      busy = false;
    }
  }

  async function submitRename(id: string) {
    if (!renameLabel.trim() || busy) return;
    busy = true;
    try {
      await onRename(id, { label: renameLabel.trim(), grade_level: renameLevel.trim() });
      renamingId = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-3 space-y-2">
  <div class="flex items-center justify-between px-1">
    <h4 class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold">Grades ({grades.length})</h4>
    <button onclick={() => { showForm = !showForm; }} class="text-[9px] font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition">
      {#if showForm}<X class="w-3 h-3" /> Cancel{:else}<Plus class="w-3 h-3" /> Grade{/if}
    </button>
  </div>

  {#if showForm}
    <div transition:fly={{ y: -6 }} class="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-3 space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <input bind:value={newLevel} placeholder="Level (e.g. 4)"
          class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-emerald-500" />
        <input bind:value={newLabel} placeholder="Label (e.g. Fourth Grade)"
          class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-emerald-500" />
      </div>
      <div class="flex items-center gap-2">
        <button onclick={submitCreate} disabled={busy || !newLevel.trim()}
          class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold transition">
          {busy ? 'Adding…' : 'Add Grade'}
        </button>
        <button onclick={() => { showForm = false; }} class="text-[10px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
      </div>
    </div>
  {/if}

  {#if grades.length === 0}
    <p class="text-[10px] text-slate-600 px-2 py-1.5">No grades yet — add the first one above.</p>
  {/if}
  {#each grades as g (g.id)}
    {@const isSel = selectedGradeId === g.id}
    {@const st = stats[g.id] || { courses: 0, lessons: 0 }}
    <div class="flex items-center gap-1">
      {#if renamingId === g.id}
        <div class="flex items-center gap-1.5 flex-1">
          <input bind:value={renameLabel}
            onkeydown={(e) => { if (e.key === 'Enter') submitRename(g.id); if (e.key === 'Escape') renamingId = ''; }}
            class="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-slate-950/70 border border-emerald-500 text-xs text-white outline-none" />
          <input bind:value={renameLevel}
            onkeydown={(e) => { if (e.key === 'Enter') submitRename(g.id); if (e.key === 'Escape') renamingId = ''; }}
            title="Grade level"
            class="w-16 px-2.5 py-2 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-emerald-500" />
          <button onclick={() => submitRename(g.id)} class="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition" title="Save"><Check class="w-3.5 h-3.5" /></button>
          <button onclick={() => { renamingId = ''; }} class="p-2 rounded-lg text-slate-400 hover:text-white transition" title="Cancel"><X class="w-3.5 h-3.5" /></button>
        </div>
      {:else}
        <button onclick={() => onSelect(g.id)}
          class="flex-1 text-left px-3 py-2 rounded-xl text-xs transition border {isSel
            ? 'bg-emerald-600/20 border-emerald-500 text-white'
            : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
          <span class="font-bold block">{g.label}</span>
          <span class="text-[9px] text-slate-500">{st.courses} courses • {st.lessons} lessons</span>
        </button>
        <button onclick={() => { renamingId = g.id; renameLabel = g.label; renameLevel = g.grade_level; }} title="Rename grade"
          class="p-2 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-emerald-950/40 transition">
          <Pencil class="w-3.5 h-3.5" />
        </button>
        <button onclick={() => onDelete(g.id, g.label)} title="Delete grade (courses & lessons are kept)"
          class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      {/if}
    </div>
  {/each}

  {#if ungroupedCount > 0}
    <button onclick={() => onSelect(ugLessonsId)}
      class="w-full text-left px-3 py-2 rounded-xl text-xs transition border border-dashed {selectedGradeId === ugLessonsId
        ? 'bg-slate-700/40 border-slate-400 text-white'
        : 'bg-slate-950/30 border-slate-700 text-slate-400 hover:border-slate-500'}">
      <span class="font-bold block">📄 Ungraded lessons ({ungroupedCount})</span>
    </button>
  {/if}
  {#if unassignedCount > 0}
    <button onclick={() => onSelect(ugCoursesId)}
      class="w-full text-left px-3 py-2 rounded-xl text-xs transition border border-dashed {selectedGradeId === ugCoursesId
        ? 'bg-indigo-700/30 border-indigo-400 text-white'
        : 'bg-slate-950/30 border-indigo-800 text-indigo-300 hover:border-indigo-500'}">
      <span class="font-bold block">📦 Courses without a grade ({unassignedCount})</span>
    </button>
  {/if}
</div>
