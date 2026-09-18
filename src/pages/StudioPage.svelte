<script lang="ts">
  import { appState } from '../lib/store.svelte';
  import CurriculumManager from '../components/admin/CurriculumManager.svelte';
  import { Layers, Globe2 } from 'lucide-svelte';
  import { fade } from 'svelte/transition';

  const isInstitution = $derived(appState.landingAuthRole === 'institution');
  const isK12 = $derived(((appState as any).kindOfSchool || '').toLowerCase().includes('k-12'));
</script>

<div transition:fade={{ duration: 300 }} class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
        <Layers class="w-5 h-5 text-blue-400" />
      </div>
      <div>
        <h1 class="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
          Class Studio <span class="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-300 flex items-center gap-1"><Globe2 class="w-3 h-3" /> {appState.hasSystemPermission ? 'Global + Yours' : 'Your curriculum'}</span>
        </h1>
        <p class="text-[11px] text-slate-400">Your institution's tracks — track → grade → course → lesson. Add a track from scratch or import any Water track, then shape grades, courses & lessons however you want. Published classes become live components students can join.</p>
      </div>
    </div>
  </div>

  {#if !isInstitution}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center border border-amber-700/40">
      <Layers class="w-10 h-10 text-amber-400 mx-auto mb-3" />
      <p class="text-sm font-bold text-white">Institution account required</p>
      <p class="text-xs text-slate-400 mt-1">The Class Studio is available to institution/school accounts. Sign in with an institution account to author curriculum.</p>
    </div>
  {:else}
      {#if isK12}
        <div class="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-[11px] text-emerald-200">
          🏫 <strong>K-12 institution detected</strong> — shortcut: click <strong>Import Water track</strong> below to clone the full K-12 curriculum (grades → courses → lessons, e.g. Fourth Grade → Mathematics → Algebra) into your own customizable track.
        </div>
      {/if}

    <!-- Institution's own (customized) tracks — no codes here;
         per-student signup codes are generated in School → Student Roster → Add Student -->
    <CurriculumManager
      apiBase="/api/institution/curriculum"
      showTutors
      showWaterImport
      showClassCodes={false}
      groupByGrade
      emptyTitle="No tracks yet"
      emptyHint="Create a blank track with “New Track”, or import any Water track with “Import Water track” — then add grades, courses and lessons."
    />

    <!-- System-wide curriculum (system permission only) — no codes here either -->
    {#if appState.hasSystemPermission}
      <div class="pt-4 space-y-4">
        <div class="flex items-center gap-2 text-[10px] uppercase font-mono tracking-widest text-indigo-300 font-bold px-1">
          <Globe2 class="w-4 h-4" /> Global Water curriculum (system)
        </div>
        <CurriculumManager
          apiBase="/api/studio"
          showClassCodes={false}
          groupByGrade
          emptyTitle="No global tracks yet"
          emptyHint="Create the first system-wide track — then add grades, courses and lessons to it."
        />
      </div>
    {:else}
      <p class="text-[10px] text-slate-600 text-center font-mono">Need to author the global Water curriculum? An administrator can grant system access with <code class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-emerald-300">bun run grant-system your@email.com</code></p>
    {/if}
  {/if}
</div>
