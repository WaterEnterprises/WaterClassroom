<script lang="ts">
  import { appState, updateProgressOnServer } from '../../lib/store.svelte';
  import { GENERATED_CLASSES } from '../../curriculum/registry';
  import MathNumbers from '../../../lessons/components/math-g1-numbers-flappy-3a7f1.svelte';
  import MathCounting from '../../../lessons/components/math-g1-counting-quiz-9b2e4.svelte';
  import MathShapes from '../../../lessons/components/math-g1-shapes-identify-4c1d8.svelte';
  import SciencePlants from '../../../lessons/components/science-g3-plants-quiz-9b2e4.svelte';
  import ScienceSolar from '../../../lessons/components/science-g3-solar-system-flappy-2e5f7.svelte';
  import HistoryEgypt from '../../../lessons/components/history-g5-ancient-egypt-quest-1a2b3.svelte';
  import HistoryRevolution from '../../../lessons/components/history-g5-american-revolution-choices-4c5d6.svelte';
  import GeographyCapitals from '../../../lessons/components/geography-g4-capitals-flappy-7e8f9.svelte';
  import GeographyContinents from '../../../lessons/components/geography-g4-continents-quiz-3a4b5.svelte';
  import LeadershipTeamwork from '../../../lessons/components/leadership-g6-teamwork-scenario-5c6d7.svelte';
  import LeadershipEscape from '../../../lessons/components/leadership-g6-problem-solving-escape-8f9g0.svelte';
  import { RefreshCw } from 'lucide-svelte';

  const componentMap: Record<string, typeof MathNumbers> = {
    'math-g1-numbers-flappy-3a7f1': MathNumbers,
    'math-g1-counting-quiz-9b2e4': MathCounting,
    'math-g1-shapes-identify-4c1d8': MathShapes,
    'science-g3-plants-quiz-9b2e4': SciencePlants,
    'science-g3-solar-system-flappy-2e5f7': ScienceSolar,
    'history-g5-ancient-egypt-quest-1a2b3': HistoryEgypt,
    'history-g5-american-revolution-choices-4c5d6': HistoryRevolution,
    'geography-g4-capitals-flappy-7e8f9': GeographyCapitals,
    'geography-g4-continents-quiz-3a4b5': GeographyContinents,
    'leadership-g6-teamwork-scenario-5c6d7': LeadershipTeamwork,
    'leadership-g6-problem-solving-escape-8f9g0': LeadershipEscape,
  };

  function awardEngagement(points: number) {
    updateProgressOnServer({ ...appState.progress, points: appState.progress.points + points });
  }

  // Studio-generated class components take precedence over the static game map.
  const StudioClass = $derived(appState.currentLessonComponent ? GENERATED_CLASSES[appState.currentLessonComponent.hash] : null);
</script>

{#if !appState.currentLessonComponent}
  <div class="frosted-glass-dark rounded-3xl p-8 text-center text-sm text-slate-400">
    Select a lesson to load its interactive component.
  </div>
{:else if appState.isLessonLoading}
  <div class="frosted-glass-dark rounded-3xl p-8 space-y-4 text-center">
    <RefreshCw class="w-10 h-10 text-blue-400 animate-spin mx-auto" />
    <p class="text-sm text-white font-bold">Loading interactive lesson...</p>
  </div>
{:else if appState.lessonError}
  <div class="frosted-glass-dark rounded-3xl p-8 space-y-3 text-center border border-red-500/40">
    <p class="text-sm text-red-300 font-bold">Lesson component unavailable</p>
    <p class="text-xs text-slate-400">{appState.lessonError}</p>
  </div>
{:else if StudioClass}
  <StudioClass.component />
{:else}
  {@const Lesson = componentMap[appState.currentLessonComponent.hash]}
  {#if Lesson}
    <Lesson />
  {:else}
    <div class="frosted-glass-dark rounded-3xl p-8 space-y-4">
      <p class="text-sm font-bold text-white">Interactive lesson loaded</p>
      <p class="text-xs text-slate-400">{appState.currentLessonComponent.title} is ready for {appState.currentLessonComponent.subject} Grade {appState.currentLessonComponent.grade}.</p>
      <button onclick={() => awardEngagement(10)} class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">Award participation points</button>
    </div>
  {/if}
{/if}
