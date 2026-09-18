<script lang="ts">
  // Students screen (institution): all tracks → students in each grade,
  // with quiz completion and scores per student.
  import { appState, fetchStudentsSummary } from '../lib/store.svelte';
  import { Users, RefreshCw, BookOpen, Check, GraduationCap, Layers } from 'lucide-svelte';
  import { fade, slide } from 'svelte/transition';

  const isInstitution = $derived(appState.landingAuthRole === 'institution');
  let selectedTrackId = $state('');
  let expandedStudentId = $state('');

  $effect(() => {
    if (isInstitution && appState.studentsSummary.length === 0 && !appState.isStudentsSummaryLoading) {
      fetchStudentsSummary();
    }
  });

  $effect(() => {
    // Default to the first track once loaded.
    if (!selectedTrackId && appState.studentsSummary.length > 0) {
      selectedTrackId = appState.studentsSummary[0].id;
    }
  });

  const selectedTrack = $derived(appState.studentsSummary.find((t: any) => t.id === selectedTrackId) || null);
  const trackStudentCount = (t: any) => {
    const ids = new Set<string>();
    for (const g of t.grades || []) for (const s of g.students || []) ids.add(s.id);
    for (const s of t.ungraded || []) ids.add(s.id);
    return ids.size;
  };

  function scoreClass(pct: number | null): string {
    if (pct === null || pct === undefined) return 'bg-slate-900 text-slate-500 border-slate-800';
    if (pct >= 70) return 'bg-emerald-950 text-emerald-400 border-emerald-800';
    if (pct >= 40) return 'bg-amber-950 text-amber-400 border-amber-800';
    return 'bg-red-950 text-red-400 border-red-800';
  }
</script>

<div transition:fade={{ duration: 300 }} class="space-y-6 animate-fade-in text-white">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
        <Users class="w-5 h-5 text-indigo-400" />
      </div>
      <div>
        <h1 class="text-xl font-extrabold text-white tracking-tight">Students</h1>
        <p class="text-[11px] text-slate-400">Every track, every grade — quiz completion and scores per student.</p>
      </div>
    </div>
    <button onclick={() => fetchStudentsSummary()} disabled={appState.isStudentsSummaryLoading}
      class="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-[10px] font-bold rounded-lg uppercase tracking-wider transition">
      <RefreshCw class="w-3.5 h-3.5 {appState.isStudentsSummaryLoading ? 'animate-spin' : ''}" /> Refresh
    </button>
  </div>

  {#if !isInstitution}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center border border-amber-700/40">
      <Users class="w-10 h-10 text-amber-400 mx-auto mb-3" />
      <p class="text-sm font-bold text-white">Institution account required</p>
      <p class="text-xs text-slate-400 mt-1">The Students screen is available to institution/school accounts.</p>
    </div>
  {:else if appState.isStudentsSummaryLoading && appState.studentsSummary.length === 0}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center">
      <RefreshCw class="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
      <p class="text-xs text-slate-400 mt-3">Loading students…</p>
    </div>
  {:else if appState.studentsSummary.length === 0}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center border border-dashed border-slate-700">
      <Layers class="w-10 h-10 text-slate-600 mx-auto mb-3" />
      <p class="text-sm font-bold text-white">No tracks yet</p>
      <p class="text-xs text-slate-400 mt-1">Create tracks in the Studio tab — your students will appear here by grade.</p>
    </div>
  {:else}
    <!-- Track menu -->
    <div class="flex gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 flex-wrap">
      {#each appState.studentsSummary as t (t.id)}
        <button onclick={() => { selectedTrackId = t.id; expandedStudentId = ''; }}
          class="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {selectedTrackId === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
          <BookOpen class="w-3.5 h-3.5" /> {t.name}
          <span class="font-mono opacity-70">({trackStudentCount(t)})</span>
        </button>
      {/each}
    </div>

    {#if selectedTrack}
      <div class="space-y-4" transition:fade={{ duration: 200 }}>
        {#each selectedTrack.grades as g (g.id)}
          <div class="frosted-glass rounded-2xl p-5 border border-blue-900/30 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <GraduationCap class="w-4 h-4 text-emerald-400" /> {g.label}
                <span class="text-[9px] font-mono text-slate-500">{g.student_count} students • {g.class_count} classes</span>
              </h3>
              {#if g.avg_score !== null && g.avg_score !== undefined}
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border {scoreClass(g.avg_score)}">Avg {g.avg_score}%</span>
              {/if}
            </div>
            {#if g.students.length === 0}
              <p class="text-[11px] text-slate-600 px-1">No students in this grade yet.</p>
            {:else}
              <div class="space-y-2">
                {#each g.students as s (s.id)}
                  <div transition:slide={{ duration: 200 }} class="rounded-xl bg-slate-950/60 border border-slate-800">
                    <button onclick={() => { expandedStudentId = expandedStudentId === s.id ? '' : s.id; }}
                      class="w-full flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-left">
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="w-8 h-8 rounded-full bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center text-indigo-300 text-[10px] font-extrabold shrink-0">{(s.name || 'S')[0].toUpperCase()}</div>
                        <div class="min-w-0">
                          <span class="text-xs font-bold text-slate-200 block truncate">{s.name}</span>
                          <span class="text-[10px] text-slate-500 block truncate">{s.email} • {s.points ?? 0} XP • Level {s.level ?? 1}</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border {s.quizzes_total > 0 && s.quizzes_completed === s.quizzes_total ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-900 text-slate-400 border-slate-700'}">
                          Quiz {s.quizzes_completed}/{s.quizzes_total}
                        </span>
                        {#if s.avg_score !== null && s.avg_score !== undefined}
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border {scoreClass(s.avg_score)}">{s.avg_score}%</span>
                        {/if}
                        <Check class="w-3 h-3 text-slate-600 {expandedStudentId === s.id ? 'rotate-180' : ''} transition" />
                      </div>
                    </button>
                    {#if expandedStudentId === s.id}
                      <div class="px-3.5 pb-3 space-y-1.5 animate-fade-in">
                        {#each s.classes as r (r.class_id)}
                          <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-900">
                            <div class="min-w-0">
                              <span class="text-[11px] font-bold text-slate-300 block truncate">{r.class_title}</span>
                              {#if r.has_quiz}
                                <span class="text-[8px] font-bold uppercase px-1.5 py-px rounded bg-purple-950 border border-purple-800 text-purple-300">Quiz</span>
                              {/if}
                            </div>
                            {#if r.status === 'completed'}
                              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                                {r.total > 0 ? `${r.score}/${r.total}` : 'Completed'} ✓
                              </span>
                            {:else if (r.total > 0 && r.score !== null) || r.status === 'in_progress'}
                              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800 shrink-0">
                                {r.total > 0 ? `${r.score ?? 0}/${r.total}` : 'Started'}
                              </span>
                            {:else}
                              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-800 shrink-0">Not started</span>
                            {/if}
                          </div>
                        {:else}
                          <p class="text-[10px] text-slate-600">No classes in this grade.</p>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if selectedTrack.ungraded.length > 0}
          <div class="frosted-glass rounded-2xl p-5 border border-slate-800 space-y-3">
            <h3 class="text-sm font-bold text-slate-300 px-1">Ungraded ({selectedTrack.ungraded.length})</h3>
            <div class="space-y-2">
              {#each selectedTrack.ungraded as s (s.id)}
                <div class="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-900">
                  <div class="min-w-0">
                    <span class="text-xs font-bold text-slate-300 block truncate">{s.name}</span>
                    <span class="text-[10px] text-slate-500 block truncate">{s.email} • {s.points ?? 0} XP</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-700 shrink-0">No grade placement</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
