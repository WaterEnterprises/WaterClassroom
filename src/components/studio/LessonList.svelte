<script lang="ts">
  // Lessons ONLY: list one course's (or group of) lessons, create / edit / delete.
  // Editing opens the Studio lesson workspace (class · quiz · game).
  import { Plus, Trash2, KeyRound, Gamepad2, Pencil } from 'lucide-svelte';

  interface Lesson {
    id: string;
    title: string;
    subject: string;
    grade_level: string;
    estimated_minutes: number;
    game_path: string;
  }

  let {
    title,
    lessons,
    editingId,
    showCodes = true,
    onCreate,
    onEdit,
    onDelete,
    onCode,
  }: {
    title: string;
    lessons: Lesson[];
    editingId: string;
    showCodes?: boolean;
    onCreate: () => void;
    onEdit: (lesson: Lesson) => void;
    onDelete: (id: string) => void;
    onCode: (lesson: Lesson) => void;
  } = $props();
</script>

<div class="rounded-2xl border border-blue-900/40 bg-blue-950/10 p-3 space-y-2">
  <div class="flex items-center justify-between px-1">
    <h4 class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold">{title} ({lessons.length})</h4>
    <button onclick={onCreate} class="text-[9px] font-bold px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 transition">
      <Plus class="w-3 h-3" /> Lesson
    </button>
  </div>
  {#if lessons.length === 0}
    <p class="text-[10px] text-slate-600 px-2 py-1.5">No lessons here yet — create the first one above.</p>
  {/if}
  {#each lessons as cls (cls.id)}
    <div class="flex items-center gap-1">
      <button onclick={() => onEdit(cls)}
        title="Edit in the Studio (class · quiz · game)"
        class="flex-1 text-left px-3 py-2 rounded-xl text-xs transition border {editingId === cls.id
          ? 'bg-blue-600/20 border-blue-500 text-white'
          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
        <span class="font-bold flex items-center gap-1.5">
          {#if cls.game_path}<Gamepad2 class="w-3 h-3 text-emerald-400 shrink-0" />{/if}
          {cls.title}
          <Pencil class="w-3 h-3 text-slate-600 shrink-0" />
        </span>
        <span class="text-[9px] text-slate-500">{cls.estimated_minutes} min {cls.game_path ? '• has game' : '• rich text'}</span>
      </button>
      {#if showCodes}
      <button onclick={() => onCode(cls)} title="Join code & students"
        class="p-2 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-950/30 transition">
        <KeyRound class="w-3.5 h-3.5" />
      </button>
      {/if}
      <button onclick={() => onDelete(cls.id)} title="Delete lesson"
        class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
        <Trash2 class="w-3.5 h-3.5" />
      </button>
    </div>
  {/each}
</div>
