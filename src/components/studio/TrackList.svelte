<script lang="ts">
  // Tracks ONLY: import or create a track, then pick one from the buttons.
  // Grades / courses / lessons live in their own components.
  import { COUNTRY_CATALOG } from '../../lib/countryCatalog';
  import { Plus, Trash2, Download, Globe2, Pencil, Check, RefreshCw, X } from 'lucide-svelte';
  import { fade, fly } from 'svelte/transition';

  interface Track { id: string; name: string; description: string; grade_level: string; subject: string; class_count?: number; country_code?: string; }
  interface WaterTrack { id: string; source: 'water-k12' | 'system'; name: string; description: string; institution_name: string; country_code?: string; grade_count: number; course_count: number; lesson_count: number; subjects?: Array<{ subject: string; grades: string[]; lesson_count: number }>; }
  interface NewTrackData { name: string; description: string; grade_level: string; subject: string; country_code: string; }

  let {
    tracks,
    selectedTrackId,
    selectedTrack,
    defaultCountry,
    showImport = true,
    onSelect,
    onCreate,
    onUpdate,
    onDelete,
    fetchLibrary,
    onImport,
  }: {
    tracks: Track[];
    selectedTrackId: string;
    selectedTrack: Track | null;
    defaultCountry: string;
    showImport?: boolean;
    onSelect: (id: string) => void;
    onCreate: (data: NewTrackData) => Promise<any>;
    onUpdate: (id: string, data: Partial<NewTrackData>) => Promise<any>;
    onDelete: (id: string) => Promise<void>;
    fetchLibrary?: () => Promise<WaterTrack[]>;
    onImport?: (payload: { source: string; track_id?: string; subjects?: string[] }) => Promise<{ trackId: string; name: string; grades: number; courses: number; lessons: number }>;
  } = $props();

  const GRADES = ['all', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const SUBJECTS = ['General', 'Mathematics', 'Science', 'History', 'Geography', 'Leadership', 'English', 'Visual Arts', 'Robotics', 'Creed'];

  const countryName = (code?: string) => {
    if (!code || code === 'GLOBAL') return 'Global';
    return COUNTRY_CATALOG.find(c => c.code === code)?.name || code;
  };

  // ─── Create form (local — ONLY track fields) ───
  let showCreateForm = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let newGrade = $state('all');
  let newSubject = $state('General');
  let newCountry = $state('');
  let busy = $state(false);
  let formError = $state('');

  function openCreateForm() {
    newName = ''; newDesc = ''; newGrade = 'all'; newSubject = 'General';
    newCountry = defaultCountry || 'GLOBAL';
    formError = '';
    showCreateForm = true;
  }

  async function submitCreate() {
    if (!newName.trim() || busy) return;
    busy = true;
    formError = '';
    try {
      await onCreate({ name: newName.trim(), description: newDesc.trim(), grade_level: newGrade, subject: newSubject, country_code: newCountry || 'GLOBAL' });
      showCreateForm = false;
    } catch (e: any) {
      formError = e.message || 'Could not create track';
    } finally {
      busy = false;
    }
  }

  // ─── Edit form (local — selected track only) ───
  let showEditForm = $state(false);
  let editName = $state('');
  let editDesc = $state('');
  let editSubject = $state('General');
  let editCountry = $state('GLOBAL');

  function openEditForm(t: Track) {
    onSelect(t.id);
    editName = t.name;
    editDesc = t.description || '';
    editSubject = t.subject || 'General';
    editCountry = t.country_code || 'GLOBAL';
    formError = '';
    showEditForm = true;
  }

  async function submitEdit() {
    if (!selectedTrack || !editName.trim() || busy) return;
    busy = true;
    formError = '';
    try {
      await onUpdate(selectedTrack.id, { name: editName.trim(), description: editDesc.trim(), subject: editSubject, country_code: editCountry || 'GLOBAL' });
      showEditForm = false;
    } catch (e: any) {
      formError = e.message || 'Could not update track';
    } finally {
      busy = false;
    }
  }

  // ─── Import modal (local) ───
  let showImportModal = $state(false);
  let waterTracks = $state<WaterTrack[]>([]);
  let waterLoading = $state(false);
  let pickedTrackId = $state('');
  let pickedSubjects = $state<string[]>([]);
  let waterSearch = $state('');
  let waterScope = $state('ALL');
  let isImporting = $state(false);

  const pickedTrack = $derived(waterTracks.find(t => t.id === pickedTrackId) || null);
  const myCountry = $derived(defaultCountry || '');
  const libraryCountries = $derived([...new Set(waterTracks.map(t => t.country_code || 'GLOBAL').filter(c => c !== 'GLOBAL'))].sort());
  const filteredTracks = $derived(waterTracks.filter(t => {
    const code = t.country_code || 'GLOBAL';
    if (waterScope !== 'ALL' && code !== waterScope) return false;
    const q = waterSearch.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.description, t.institution_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  }));

  async function openImportModal() {
    if (!showImport || !fetchLibrary) return;
    showImportModal = true;
    if (waterTracks.length > 0) return;
    waterLoading = true;
    try {
      waterTracks = await fetchLibrary();
      const k12 = waterTracks.find(t => t.source === 'water-k12');
      if (k12) {
        pickedTrackId = k12.id;
        pickedSubjects = (k12.subjects || []).map(s => s.subject);
      } else if (waterTracks.length > 0) {
        pickedTrackId = waterTracks[0].id;
      }
    } catch (e: any) {
      formError = e.message || 'Could not load Water tracks';
    } finally {
      waterLoading = false;
    }
  }

  function pickTrack(id: string) {
    pickedTrackId = id;
    const t = waterTracks.find(x => x.id === id);
    pickedSubjects = t?.source === 'water-k12' ? (t.subjects || []).map(s => s.subject) : [];
  }

  function toggleSubject(subject: string) {
    pickedSubjects = pickedSubjects.includes(subject)
      ? pickedSubjects.filter(s => s !== subject)
      : [...pickedSubjects, subject];
  }

  async function runImport() {
    if (isImporting || !pickedTrack || !onImport) return;
    if (pickedTrack.source === 'water-k12' && pickedSubjects.length === 0) {
      formError = 'Pick at least one K-12 subject';
      return;
    }
    isImporting = true;
    formError = '';
    try {
      await onImport({
        source: pickedTrack.source,
        track_id: pickedTrack.source === 'system' ? pickedTrack.id : undefined,
        subjects: pickedTrack.source === 'water-k12' ? pickedSubjects : undefined,
      });
      showImportModal = false;
    } catch (e: any) {
      formError = e.message || 'Import failed';
    } finally {
      isImporting = false;
    }
  }
</script>

<div class="frosted-glass-dark rounded-2xl p-4 border border-blue-900/40 space-y-2">
  <div class="flex items-center justify-between px-1 gap-2 flex-wrap">
    <h3 class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold">Tracks</h3>
    <div class="flex items-center gap-1.5">
      {#if showImport}
        <button onclick={openImportModal} class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 transition">
          <Download class="w-3 h-3" /> Import
        </button>
      {/if}
      <button onclick={openCreateForm} class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center gap-1 transition">
        <Plus class="w-3 h-3" /> New
      </button>
    </div>
  </div>

  {#if formError && !showImportModal}
    <p class="text-[10px] text-red-400 font-bold px-1">{formError}</p>
  {/if}

  {#if showCreateForm}
    <div transition:fly={{ y: -6 }} class="rounded-xl border border-blue-800/50 bg-blue-950/20 p-3 space-y-2">
      <input bind:value={newName} placeholder="Track name (e.g. K-12 Mathematics)"
        class="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
      <input bind:value={newDesc} placeholder="Short description"
        class="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <select bind:value={newGrade} class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
          {#each GRADES as g}<option value={g}>Grade: {g}</option>{/each}
        </select>
        <select bind:value={newSubject} class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
          {#each SUBJECTS as s}<option value={s}>{s}</option>{/each}
        </select>
        <select bind:value={newCountry} title="Country scope"
          class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
          <option value="GLOBAL">🌍 Global</option>
          {#each COUNTRY_CATALOG as c}<option value={c.code}>{c.name}</option>{/each}
        </select>
      </div>
      <div class="flex items-center gap-2">
        <button onclick={submitCreate} disabled={busy || !newName.trim()}
          class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold transition">
          {busy ? 'Creating…' : 'Create Track'}
        </button>
        <button onclick={() => { showCreateForm = false; }} class="text-[10px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
      </div>
    </div>
  {/if}

  {#if showEditForm && selectedTrack}
    <div transition:fly={{ y: -6 }} class="rounded-xl border border-blue-800/50 bg-blue-950/20 p-3 space-y-2">
      <p class="text-[9px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">Edit track — make it yours</p>
      <input bind:value={editName} placeholder="Track name"
        class="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
      <input bind:value={editDesc} placeholder="Short description"
        class="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
      <div class="grid grid-cols-2 gap-2">
        <select bind:value={editSubject} class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
          {#each SUBJECTS as s}<option value={s}>{s}</option>{/each}
        </select>
        <select bind:value={editCountry} class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
          <option value="GLOBAL">🌍 Global</option>
          {#each COUNTRY_CATALOG as c}<option value={c.code}>{c.name}</option>{/each}
        </select>
      </div>
      <div class="flex items-center gap-2">
        <button onclick={submitEdit} disabled={busy || !editName.trim()}
          class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold transition">
          {busy ? 'Saving…' : 'Save Track'}
        </button>
        <button onclick={() => { showEditForm = false; }} class="text-[10px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
      </div>
    </div>
  {/if}

  {#if tracks.length === 0}
    <p class="text-[11px] text-slate-500 px-1 py-2">No tracks yet — import a Water track or create your first one above.</p>
  {/if}
  {#each tracks as t (t.id)}
    {@const isSel = selectedTrackId === t.id}
    <div class="flex items-center gap-1">
      <button onclick={() => onSelect(t.id)}
        class="flex-1 text-left px-3 py-2.5 rounded-xl text-xs transition border {isSel
          ? 'bg-blue-600/20 border-blue-500 text-white'
          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
        <span class="font-bold flex items-center gap-1.5">{t.name}
          <span class="text-[8px] font-mono font-bold uppercase px-1.5 py-px rounded {(t.country_code || 'GLOBAL') === 'GLOBAL' ? 'bg-emerald-950 border border-emerald-700 text-emerald-300' : 'bg-indigo-950 border border-indigo-700 text-indigo-300'}">
            {(t.country_code || 'GLOBAL') === 'GLOBAL' ? '🌍' : t.country_code}
          </span>
        </span>
        <span class="text-[9px] text-slate-500">{t.subject} • Grade {t.grade_level}{t.class_count != null ? ` • ${t.class_count} classes` : ''}</span>
      </button>
      <button onclick={() => openEditForm(t)} title="Edit track"
        class="p-2 rounded-lg text-slate-500 hover:text-blue-300 hover:bg-blue-950/40 transition">
        <Pencil class="w-3.5 h-3.5" />
      </button>
      <button onclick={() => onDelete(t.id)} title="Delete track"
        class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
        <Trash2 class="w-3.5 h-3.5" />
      </button>
    </div>
  {/each}
</div>

{#if showImportModal && showImport}
  <div transition:fade={{ duration: 200 }} class="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
    <div transition:fly={{ y: 16 }} class="frosted-glass-dark p-5 sm:p-7 rounded-3xl max-w-xl w-full border border-emerald-500/20 space-y-5 my-4">
      <div class="text-center space-y-2">
        <div class="w-14 h-14 bg-emerald-950 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mx-auto">
          <Globe2 class="w-7 h-7" />
        </div>
        <h3 class="text-xl font-extrabold text-white">Import a Water track</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto">Pick <strong class="text-slate-200">any track in the Water database</strong>. The whole thing (grades, courses, lessons) is cloned into your institution — then everything is yours.</p>
      </div>

      {#if waterLoading}
        <div class="text-center py-8">
          <RefreshCw class="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p class="text-xs text-slate-400 mt-3">Loading Water tracks…</p>
        </div>
      {:else if waterTracks.length === 0}
        <p class="text-xs text-slate-500 text-center py-6">No Water tracks available right now.</p>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select bind:value={waterScope} title="Filter by country scope"
            class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-emerald-500">
            <option value="ALL">All countries + Global</option>
            <option value="GLOBAL">🌍 Global only</option>
            {#if myCountry && myCountry !== 'GLOBAL'}
              <option value={myCountry}>📍 My country — {countryName(myCountry)}</option>
            {/if}
            {#each libraryCountries as c}<option value={c}>{countryName(c)}</option>{/each}
          </select>
          <input bind:value={waterSearch} placeholder="🔍 Search tracks, subjects, authors…"
            class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-emerald-500 placeholder:text-slate-600" />
        </div>
        <p class="text-[10px] font-mono text-slate-500 px-1">Showing {filteredTracks.length} of {waterTracks.length} tracks</p>
        {#if filteredTracks.length === 0}
          <p class="text-xs text-slate-500 text-center py-6">No tracks match — try another country or search.</p>
        {:else}
        <div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
          {#each filteredTracks as t (t.id)}
            <button onclick={() => pickTrack(t.id)}
              class="w-full text-left px-4 py-3 rounded-xl border transition {pickedTrackId === t.id
                ? 'bg-emerald-600/15 border-emerald-500 text-white'
                : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
              <span class="flex items-center justify-between gap-2">
                <span class="text-sm font-bold flex items-center gap-2 flex-wrap">
                  {#if t.source === 'water-k12'}
                    <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">Built-in</span>
                  {:else}
                    <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-300">System</span>
                  {/if}
                  {#if (t.country_code || 'GLOBAL') === 'GLOBAL'}
                    <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">🌍 Global</span>
                  {:else}
                    <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">{t.country_code}</span>
                  {/if}
                  {t.name}
                </span>
                {#if pickedTrackId === t.id}
                  <span class="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0"><Check class="w-3 h-3 text-white" /></span>
                {/if}
              </span>
              <span class="text-[10px] text-slate-400 block mt-0.5">{countryName(t.country_code)} • {t.grade_count} grades • {t.course_count} courses • {t.lesson_count} lessons{#if t.institution_name} • by {t.institution_name}{/if}</span>
            </button>
          {/each}
        </div>
        {/if}
        {#if pickedTrack?.source === 'water-k12'}
          <div class="space-y-1.5">
            <p class="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-bold px-1">K-12 subjects to include</p>
            <div class="flex flex-wrap gap-1.5">
              {#each pickedTrack.subjects || [] as s (s.subject)}
                <button onclick={() => toggleSubject(s.subject)}
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition {pickedSubjects.includes(s.subject)
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                    : 'bg-slate-950/50 border-slate-700 text-slate-400 hover:border-slate-500'}">
                  {s.subject} · {s.lesson_count}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      {#if formError}
        <p class="text-[10px] text-red-400 font-bold text-center">{formError}</p>
      {/if}
      <div class="flex items-center justify-between pt-2 border-t border-slate-800">
        <button onclick={() => { showImportModal = false; }}
          class="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition">
          Cancel
        </button>
        <button onclick={runImport} disabled={isImporting || !pickedTrack}
          class="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center gap-2">
          {#if isImporting}<RefreshCw class="w-3.5 h-3.5 animate-spin" />{:else}<Download class="w-3.5 h-3.5" />{/if}
          {isImporting ? 'Importing…' : `Import “${pickedTrack?.name || '…'}”`}
        </button>
      </div>
    </div>
  </div>
{/if}
