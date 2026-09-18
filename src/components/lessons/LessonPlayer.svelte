<script lang="ts">
  // Runtime lesson player — renders lesson JSON (DB index + disk bodies) with
  // zero build step. Create/update a lesson and it plays immediately.
  import { appState, updateProgressOnServer, reportClassResult } from '../../lib/store.svelte';
  import { parseQuizMarkdown } from '../../../server/quiz-parser';
  import { X } from 'lucide-svelte';

  export interface StudioLesson {
    id: string;
    track_id?: string;
    title: string;
    description?: string;
    subject?: string;
    grade_level?: string;
    estimated_minutes?: number;
    content_html?: string;
    quiz_markdown?: string;
    game_path?: string;
  }

  let { lesson, onClose }: { lesson: StudioLesson; onClose?: () => void } = $props();

  const quiz = $derived(parseQuizMarkdown(lesson.quiz_markdown || ""));
  const hasQuiz = $derived(quiz.questions.length > 0);

  let showQuiz = $state(false);
  let current = $state(0);
  let picked = $state(-1);
  let revealed = $state(false);
  let score = $state(0);
  let finished = $state(false);
  let reported = $state(false);
  let hasCompleted = $state(false);

  function award(points: number) {
    updateProgressOnServer({ ...appState.progress, points: appState.progress.points + points });
  }

  function choose(oi: number) {
    if (revealed) return;
    picked = oi;
    revealed = true;
    if (oi === quiz.questions[current].correctAnswerIndex) score += 1;
  }

  function next() {
    if (current + 1 >= quiz.questions.length) {
      finished = true;
      const passed = score >= Math.ceil(quiz.questions.length * 0.7);
      award(passed ? 25 : 10);
      reportClassResult(lesson.id, score, quiz.questions.length).then((r) => { reported = true; hasCompleted = r?.status === 'completed'; });
    } else {
      current += 1;
      picked = -1;
      revealed = false;
    }
  }

  function markComplete() {
    hasCompleted = true;
    award(25);
    reportClassResult(lesson.id, 0, 0, true);
  }

  function retry() {
    current = 0; picked = -1; revealed = false; score = 0; finished = false;
  }
</script>

<div class="space-y-5">
  <div class="flex items-start justify-between gap-4 border-b border-blue-950 pb-4">
    <div>
      <h3 class="text-xl font-extrabold text-white">{lesson.title}</h3>
      {#if lesson.description}
        <p class="text-xs text-slate-400 mt-1">{lesson.description}</p>
      {/if}
    </div>
    <div class="flex items-center gap-2 shrink-0">
      {#if lesson.subject}
        <span class="px-2 py-0.5 text-[9px] font-mono uppercase bg-blue-950 text-blue-300 rounded">{lesson.subject}</span>
      {/if}
      {#if onClose}
        <button onclick={onClose} class="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition" title="Close lesson">
          <X class="w-4 h-4" />
        </button>
      {/if}
    </div>
  </div>

  {#if lesson.game_path}
    <iframe
      src={lesson.game_path}
      title={`${lesson.title} — game`}
      class="w-full h-[480px] rounded-xl border border-blue-900/50 bg-black"
      allow="autoplay; fullscreen"
    ></iframe>
  {:else}
    <div class="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed">{@html lesson.content_html || '<p class="text-slate-500">No content yet.</p>'}</div>
  {/if}

  {#if !hasQuiz || hasCompleted}
    {#if hasCompleted}
      <p class="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Class completed — progress saved</p>
    {:else}
      <button onclick={markComplete} class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">
        Mark class complete (+25 XP)
      </button>
    {/if}
  {:else if showQuiz}
    <div class="rounded-2xl border border-indigo-900/50 bg-slate-950/60 p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-bold text-white uppercase tracking-wider">Quiz</h4>
        {#if finished}
          <button onclick={retry} class="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">Retake</button>
        {/if}
      </div>

      {#if finished}
        <div class="text-center space-y-2 py-4">
          <p class="text-3xl font-extrabold {score >= quiz.questions.length * 0.7 ? 'text-emerald-400' : 'text-amber-400'}">{score} / {quiz.questions.length}</p>
          <p class="text-xs text-slate-400">{score >= quiz.questions.length * 0.7 ? 'Great work — class completed!' : 'Keep practicing — retake the quiz to improve.'}</p>
        </div>
        {#if score >= quiz.questions.length * 0.7 && !reported}
          <p class="text-[10px] text-emerald-400 text-center">Progress saved for your institution ✓</p>
        {/if}
      {:else}
        {@const q = quiz.questions[current]}
        {#if q}
          <div class="space-y-3">
            <p class="text-[10px] uppercase font-mono tracking-widest text-indigo-400 font-bold">Question {current + 1} of {quiz.questions.length}</p>
            <p class="text-sm font-bold text-white">{q.question}</p>
            <div class="space-y-2">
              {#each q.options as opt, oi (oi)}
                <button
                  onclick={() => choose(oi)}
                  class="w-full text-left px-4 py-2.5 rounded-xl text-xs transition border {picked === oi
                    ? opt.trim() === q.options[q.correctAnswerIndex].trim() && revealed
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : revealed
                        ? 'bg-red-600/20 border-red-500 text-white'
                        : 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
                  <span class="font-mono text-[10px] text-slate-500 mr-2">{oi + 1}.</span>{opt}
                  {#if revealed && picked === oi && opt.trim() !== q.options[q.correctAnswerIndex].trim()}
                    <span class="block text-[10px] text-emerald-300 mt-1">Correct answer: {q.options[q.correctAnswerIndex]}</span>
                  {/if}
                  {#if revealed && picked === oi && q.explanation}
                    <span class="block text-[10px] text-slate-400 mt-1">{q.explanation}</span>
                  {/if}
                </button>
              {/each}
            </div>
            {#if revealed}
              <button onclick={next} class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">
                {current + 1 >= quiz.questions.length ? 'Finish quiz' : 'Next question'}
              </button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <button onclick={() => showQuiz = true} class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">
      Start quiz ({quiz.questions.length} questions)
    </button>
  {/if}
</div>
