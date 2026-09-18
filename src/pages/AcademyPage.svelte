<script lang="ts">
import { appState, startVerifiedProctorExam, stopVerifiedProctorExam, handleQuizSubmit, setSelectedCurriculum, setSelectedLesson, setActiveQuiz, setQuizAnswers, setShowQuizResult, setActiveGame, setIsCurriculumLoading, setCurriculumError, loadCurriculumForStudent, loadLessonComponent, fetchJoinedClasses, fetchAvailableClasses, fetchMyInstitution, fetchBrowseTree, fetchTutorClasses, openStudioLesson, closeStudioLesson, toggleFavoriteTrack } from '../lib/store.svelte';
import { QUIZZES } from '../lib/lessonsData';
import { CheckCircle, ChevronRight, ChevronLeft, ArrowLeft, Video, BookOpen, Shield, Check, Send, RefreshCw, X, GraduationCap, Play, Star, Layers } from 'lucide-svelte';
import TrinityGame from '../components/games/TrinityGame.svelte';
import RoboticsGame from '../components/games/RoboticsGame.svelte';
import IncentiveGame from '../components/games/IncentiveGame.svelte';
import LessonComponentRenderer from '../components/lessons/LessonComponentRenderer.svelte';
import LessonPlayer from '../components/lessons/LessonPlayer.svelte';
import { fly, fade, slide } from 'svelte/transition';

  let videoEl: HTMLVideoElement | null = $state(null);

  $effect(() => {
    (appState as any).videoRef = videoEl;
  });

$effect(() => {
  if (appState.isOnboarded && appState.currentTrackId === "" && appState.trackLessons.length === 0) {
    loadCurriculumForStudent();
  }
});

$effect(() => {
  if (appState.isLoggedIn && appState.joinedClasses.length === 0) {
    fetchJoinedClasses();
  }
});

$effect(() => {
  if (appState.isLoggedIn && appState.landingAuthRole === 'tutor' && appState.tutorClasses.length === 0 && !appState.isTutorClassesLoading) {
    fetchTutorClasses();
  }
});

$effect(() => {
  if (appState.isLoggedIn && appState.availableTracks.length === 0 && appState.availableClasses.length === 0 && !appState.isClassesLoading) {
    fetchAvailableClasses();
  }
  if (appState.isLoggedIn && appState.browseTree.length === 0 && !appState.isBrowseTreeLoading) {
    fetchBrowseTree();
  }
  if (appState.isLoggedIn && !appState.myInstitution) {
    fetchMyInstitution();
  }
});

  // ─── Favorite tracks + Water Classroom track menu ───
  let expandedTrackId = $state('');

  const favoriteTracks = $derived(appState.availableTracks.filter(t => appState.favoriteTrackIds.includes(t.id)));
  const classesForTrack = (trackId: string) => appState.availableClasses.filter(c => c.track_id === trackId);
  // Browse order: the user's own institution first, then every other Water track.
  const myInstitutionTracks = $derived(
    appState.myInstitution
      ? appState.availableTracks.filter(t => (t.institution_id || '') === appState.myInstitution!.id)
      : []
  );

  const isInstitution = $derived(appState.landingAuthRole === 'institution');

  // Student's enrolled track tree (the overall track they're following).
  const enrolledTree = $derived(
    (appState.browseTree as any[]).find((t: any) => t.id === appState.selectedOnboardingTrackId) || null
  );

  // Flatten the enrolled track in order: grades → courses → lessons.
  const enrolledLessonsFlat = $derived.by(() => {
    if (!enrolledTree) return [];
    const flat: Array<any> = [];
    const push = (cls: any, gradeId: string, gradeLabel: string, courseName: string) =>
      flat.push({ ...cls, _gradeId: gradeId, _gradeLabel: gradeLabel, _courseName: courseName });
    for (const g of enrolledTree.grades || []) {
      for (const co of g.courses || []) for (const cls of co.lessons || []) push(cls, g.id, g.label, co.name);
      for (const cls of g.directLessons || []) push(cls, g.id, g.label, '');
    }
    for (const co of enrolledTree.looseCourses || []) for (const cls of co.lessons || []) push(cls, '', '', co.name);
    for (const cls of enrolledTree.ungroupedLessons || []) push(cls, '', '', '');
    return flat;
  });

  // The student's enrolled grade key (id or level string, as saved on the account).
  const enrolledGradeKey = $derived(String(appState.studentGradeLevelId || ''));

  // Lessons in the enrolled grade only (empty when the grade has no match —
  // callers fall back to the whole track so the screen never goes blank).
  const enrolledGradeFlat = $derived(
    enrolledGradeKey
      ? enrolledLessonsFlat.filter((l: any) => l._gradeId === enrolledGradeKey || String(l.grade_level) === enrolledGradeKey)
      : []
  );

  // The latest next lesson to complete — scoped to the enrolled grade first,
  // falling back to the overall track order when the grade has no match.
  const upNextLesson = $derived.by(() => {
    const pool = enrolledGradeFlat.length > 0 ? enrolledGradeFlat : enrolledLessonsFlat;
    return pool.find((l: any) => !appState.progress.completedLessons.includes(l.id)) || null;
  });

  // Courses & subjects — only the student's enrolled grade (whole track fallback).
  const enrolledGradeViews = $derived.by(() => {
    if (!enrolledTree) return [];
    const grades = (enrolledTree.grades || []).filter((g: any) =>
      enrolledGradeKey ? (g.id === enrolledGradeKey || String(g.grade_level) === enrolledGradeKey) : true
    );
    return grades.length > 0 || !enrolledGradeKey ? grades : (enrolledTree.grades || []);
  });

  // Courses & subjects on the enrolled track (enrolled grade only).
  const enrolledCourses = $derived.by(() => {
    if (!enrolledTree) return [];
    const list: Array<any> = [];
    for (const g of enrolledGradeViews) {
      for (const co of g.courses || []) {
        const lessons = co.lessons || [];
        list.push({
          id: co.id, name: co.name, gradeLabel: g.label,
          lessonCount: lessons.length,
          subjects: [...new Set(lessons.map((l: any) => l.subject || 'General'))],
        });
      }
    }
    for (const co of enrolledTree.looseCourses || []) {
      const lessons = co.lessons || [];
      list.push({
        id: co.id, name: co.name, gradeLabel: '',
        lessonCount: lessons.length,
        subjects: [...new Set(lessons.map((l: any) => l.subject || 'General'))],
      });
    }
    return list;
  });
  const enrolledSubjects = $derived.by(() => {
    const source = enrolledGradeFlat.length > 0 ? enrolledGradeFlat : enrolledLessonsFlat;
    const map = new Map<string, number>();
    for (const l of source) map.set(l.subject || 'General', (map.get(l.subject || 'General') || 0) + 1);
    return [...map.entries()].map(([subject, count]) => ({ subject, count }));
  });

  // Full-screen lesson reader: back to lectures, prev/next, quiz + complete.
  let isLessonFullscreen = $state(false);

  function openLesson(id: string) {
    isLessonFullscreen = true;
    openStudioLesson(id);
  }

  function closeFullscreen() {
    isLessonFullscreen = false;
    closeStudioLesson();
  }

  // Prev/next order: enrolled track order when the lesson is in it,
  // otherwise the lesson's own track order.
  const lessonNavList = $derived.by((): Array<any> => {
    const activeId = appState.activeStudioLesson?.id;
    if (!activeId) return [];
    if (enrolledLessonsFlat.some((l: any) => l.id === activeId)) return enrolledLessonsFlat;
    const tid = appState.activeStudioLesson?.track_id;
    return tid ? classesForTrack(tid) : [];
  });
  const lessonNavIdx = $derived(lessonNavList.findIndex((l: any) => l.id === appState.activeStudioLesson?.id));
  const prevLesson = $derived(lessonNavIdx > 0 ? lessonNavList[lessonNavIdx - 1] : null);
  const nextLesson = $derived(lessonNavIdx >= 0 && lessonNavIdx < lessonNavList.length - 1 ? lessonNavList[lessonNavIdx + 1] : null);

  const formatExamTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Recently played lessons (last 5 completed)
  const recentlyPlayedLessons = $derived(
    appState.trackLessons
      .filter(l => appState.progress.completedLessons.includes(l.id))
      .slice(0, 5)
  );

  const examTimerWidthClass = $derived(appState.examTimer / 600 >= 1 ? 'w-full' : appState.examTimer / 600 >= 0.75 ? 'w-3/4' : appState.examTimer / 600 >= 0.5 ? 'w-1/2' : appState.examTimer / 600 >= 0.25 ? 'w-1/4' : 'w-0');
</script>

<div class="animate-fade-in space-y-6">
  <!-- Lesson browser (whole page): tracks, favorites, enrolled, recents -->
  <div class="space-y-6 min-w-0">
  {#if !isInstitution && (upNextLesson || enrolledCourses.length > 0 || enrolledSubjects.length > 0)}
    <!-- Up next: latest next lesson on the overall track -->
    {#if upNextLesson}
      {@const openUpNext = appState.activeStudioLesson?.id === upNextLesson.id}
      <div class="rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 border border-blue-400/30 shadow-2xl space-y-3">
        <span class="text-[9px] uppercase font-mono tracking-widest text-blue-200 font-bold flex items-center gap-1.5">
          <Play class="w-3 h-3" /> Up Next — {enrolledTree?.name || 'Your track'}
        </span>
        <h3 class="text-lg font-extrabold text-white leading-snug">{upNextLesson.title}</h3>
        <p class="text-[10px] text-blue-200">
          {#if upNextLesson._gradeLabel}{upNextLesson._gradeLabel}{/if}{#if upNextLesson._courseName} • {upNextLesson._courseName}{/if}
          • {upNextLesson.subject} • {upNextLesson.estimated_minutes} min
        </p>
        <div class="flex flex-wrap items-center gap-1.5">
          {#if upNextLesson.has_quiz}<span class="text-[8px] font-bold uppercase px-1.5 py-px rounded bg-white/15 border border-white/25 text-white">Quiz</span>{/if}
          {#if upNextLesson.game_path}<span class="text-[8px] font-bold uppercase px-1.5 py-px rounded bg-white/15 border border-white/25 text-white">Game</span>{/if}
          <button onclick={() => openLesson(upNextLesson.id)}
            class="ml-auto px-4 py-2 rounded-xl bg-white text-blue-950 text-[11px] font-extrabold uppercase tracking-wider transition hover:bg-blue-50 flex items-center gap-1.5">
            {#if openUpNext}<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span> Open{:else}<Play class="w-3 h-3" /> Continue{/if}
          </button>
        </div>
      </div>
    {/if}
    <!-- Courses & subjects on enrolled tracks -->
    {#if enrolledCourses.length > 0 || enrolledSubjects.length > 0}
      <div class="space-y-3">
        {#if enrolledSubjects.length > 0}
          <div class="flex flex-wrap gap-1.5 px-1">
            {#each enrolledSubjects as s (s.subject)}
              <span class="px-2.5 py-1 rounded-full text-[9px] font-bold bg-blue-950/60 border border-blue-800/60 text-blue-300">{s.subject} • {s.count}</span>
            {/each}
          </div>
        {/if}
        {#if enrolledCourses.length > 0}
          <div>
            <span class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">Courses — {enrolledTree?.name || 'Enrolled track'}{enrolledGradeViews.length === 1 && enrolledGradeViews[0] ? ` • ${enrolledGradeViews[0].label}` : ''}</span>
            <div class="space-y-1.5 mt-2">
              {#each enrolledCourses as co (co.id)}
                <div class="px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span class="text-xs font-bold text-slate-200 block">{co.name}</span>
                  <span class="text-[9px] text-slate-500 block mt-0.5">
                    {#if co.gradeLabel}{co.gradeLabel} • {/if}{co.lessonCount} lesson{co.lessonCount === 1 ? '' : 's'}{co.subjects.length ? ` • ${co.subjects.join(', ')}` : ''}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
  <!-- Tutor workspace: assigned classes + their students -->
  {#if appState.landingAuthRole === 'tutor'}
    <div class="space-y-3 mb-6">
      <div class="flex items-center justify-between px-1">
        <span class="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
          <GraduationCap class="w-3.5 h-3.5" /> My Assigned Classes
        </span>
        {#if appState.isTutorClassesLoading}<RefreshCw class="w-3.5 h-3.5 text-amber-400 animate-spin" />{/if}
      </div>
      {#if appState.tutorClasses.length === 0 && !appState.isTutorClassesLoading}
        <p class="text-[11px] text-slate-600 px-1">No classes assigned yet — your school will assign you in School → Tutors.</p>
      {:else}
        <div class="space-y-2">
          {#each appState.tutorClasses as tc (tc.id)}
            <div class="rounded-2xl border border-amber-800/40 bg-amber-950/10 p-4 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h4 class="font-bold text-white text-sm">{tc.title}</h4>
                  <p class="text-[10px] text-slate-400">{tc.subject} • Grade {tc.grade_level}{tc.institution_name ? ` • ${tc.institution_name}` : ''}</p>
                </div>
                <button onclick={() => openLesson(tc.id)}
                  class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition flex items-center gap-1 shrink-0">
                  <Play class="w-2.5 h-2.5" /> Open
                </button>
              </div>
              {#if tc.students.length === 0}
                <p class="text-[10px] text-slate-600">No students enrolled yet.</p>
              {:else}
                <div class="space-y-1">
                  <p class="text-[9px] uppercase font-mono tracking-widest text-slate-500 font-bold">Students ({tc.students.length})</p>
                  {#each tc.students as s (s.id)}
                    <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div>
                        <span class="text-xs font-bold text-slate-200">{s.name}</span>
                        <span class="text-[10px] text-slate-500 block">{s.email} • {s.points ?? 0} XP • Level {s.level ?? 1}</span>
                      </div>
                      {#if s.class_status === 'completed'}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Completed{tc.has_quiz && s.class_total > 0 ? ` • ${s.class_score}/${s.class_total}` : ''} ✓
                        </span>
                      {:else if s.class_total > 0}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                          Quiz: {s.class_score}/{s.class_total}
                        </span>
                      {:else}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-800">Not started</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Favorite tracks (starred — persisted per device) -->
  {#if favoriteTracks.length > 0}
    <div class="space-y-3 mb-6">
      <span class="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold px-1 flex items-center gap-1.5">
        <Star class="w-3.5 h-3.5" /> Favorite Tracks
      </span>
      <div class="flex gap-3 overflow-x-auto pb-2 scroll-smooth">
        {#each favoriteTracks as t (t.id)}
          {@const tClassCount = t.class_count ?? classesForTrack(t.id).length}
          <div class="flex-shrink-0 w-64 frosted-glass-dark rounded-2xl p-4 border border-amber-700/40 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-bold text-white text-sm line-clamp-2 flex-1">{t.name}</h4>
              <button onclick={() => toggleFavoriteTrack(t.id)} title="Remove from favorites"
                class="p-1 rounded-lg text-amber-400 hover:text-slate-400 transition shrink-0">
                <Star class="w-4 h-4 fill-current" />
              </button>
            </div>
            <p class="text-[10px] text-slate-400">{t.subject || 'General'}{t.institution_name ? ` • ${t.institution_name}` : ''} • {tClassCount} classes</p>
            <div class="flex gap-1.5">
              <button onclick={() => { expandedTrackId = expandedTrackId === t.id ? '' : t.id; }}
                class="flex-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition">
                {expandedTrackId === t.id ? 'Hide' : 'View'}
              </button>
            </div>
            {#if expandedTrackId === t.id}
              <div class="space-y-1.5 pt-1 animate-fade-in">
                {@render gradeTree(t.id)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#snippet lessonRow(cls: any)}
    {@const clsOpen = appState.activeStudioLesson?.id === cls.id}
    <button onclick={() => openLesson(cls.id)}
      class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border text-left transition {clsOpen ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'}">
      <div class="min-w-0">
        <span class="text-[11px] font-bold text-slate-200 block truncate">{cls.title}</span>
        <span class="text-[9px] text-slate-500">{cls.subject} • Grade {cls.grade_level} • {cls.estimated_minutes} min</span>
        <span class="flex flex-wrap gap-1 mt-1">
          {#if cls.has_quiz}<span class="text-[8px] font-bold uppercase px-1.5 py-px rounded bg-purple-950 border border-purple-800 text-purple-300">Quiz</span>{/if}
          {#if cls.game_path}<span class="text-[8px] font-bold uppercase px-1.5 py-px rounded bg-emerald-950 border border-emerald-800 text-emerald-300">Game</span>{/if}
        </span>
      </div>
      {#if clsOpen}<span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0"></span>{/if}
    </button>
  {/snippet}

  {#snippet gradeTree(trackId: string)}
    {@const tree = appState.browseTree.find((t: any) => t.id === trackId)}
    {#if !tree}
      {#each classesForTrack(trackId) as cls (cls.id)}
        {@render lessonRow(cls)}
      {:else}
        <p class="text-[10px] text-slate-600">No classes listed for this track yet.</p>
      {/each}
    {:else}
      {#each tree.grades as g (g.id)}
        <div class="space-y-1.5">
          <p class="text-[9px] uppercase font-mono tracking-widest text-slate-400 font-bold px-1 pt-1.5">📚 {g.label}</p>
          {#each g.courses as co (co.id)}
            <p class="text-[10px] font-bold text-slate-300 px-2">📖 {co.name}</p>
            <div class="space-y-1.5 pl-2">
              {#each co.lessons as cls (cls.id)}
                {@render lessonRow(cls)}
              {/each}
            </div>
          {/each}
          {#each g.directLessons as cls (cls.id)}
            {@render lessonRow(cls)}
          {/each}
        </div>
      {/each}
      {#each tree.looseCourses as co (co.id)}
        <div class="space-y-1.5">
          <p class="text-[10px] font-bold text-slate-300 px-2">📖 {co.name}</p>
          <div class="space-y-1.5 pl-2">
            {#each co.lessons as cls (cls.id)}
              {@render lessonRow(cls)}
            {/each}
          </div>
        </div>
      {/each}
      {#each tree.ungroupedLessons as cls (cls.id)}
        {@render lessonRow(cls)}
      {/each}
      {#if tree.grades.length === 0 && tree.looseCourses.length === 0 && tree.ungroupedLessons.length === 0}
        <p class="text-[10px] text-slate-600">No classes listed for this track yet.</p>
      {/if}
    {/if}
  {/snippet}

  {#snippet trackBrowserCard(track: any, accent: 'cyan' | 'emerald')}
    {@const trackClasses = classesForTrack(track.id)}
    {@const isFav = appState.favoriteTrackIds.includes(track.id)}
    {@const activeBorder = accent === 'emerald' ? 'border-emerald-500 bg-emerald-950/20' : 'border-cyan-500 bg-cyan-950/20'}
    <div class="rounded-2xl border transition {expandedTrackId === track.id ? activeBorder : 'border-slate-800 bg-slate-950/50'}">
      <div class="flex items-center gap-1.5 p-2.5">
        <button onclick={() => toggleFavoriteTrack(track.id)} title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          class="p-2 rounded-lg transition shrink-0 {isFav ? 'text-amber-400 hover:text-slate-400' : 'text-slate-600 hover:text-amber-400'}">
          <Star class="w-4 h-4 {isFav ? 'fill-current' : ''}" />
        </button>
        <button onclick={() => { expandedTrackId = expandedTrackId === track.id ? '' : track.id; }}
          class="flex-1 text-left px-2 py-1 min-w-0">
          <span class="font-bold text-white text-xs block truncate">{track.name}</span>
          <span class="text-[9px] text-slate-500">{track.subject || 'General'}{track.institution_name ? ` • ${track.institution_name}` : ''} • {track.class_count ?? trackClasses.length} classes</span>
        </button>
      </div>
      {#if expandedTrackId === track.id}
        <div class="px-3.5 pb-3.5 space-y-1.5 animate-fade-in">
          {#if track.description}<p class="text-[10px] text-slate-400">{track.description}</p>{/if}
          {@render gradeTree(track.id)}
        </div>
      {/if}
    </div>
  {/snippet}

  <!-- Your school's classes first — browse lessons, quizzes & games -->
  {#if appState.myInstitution}
    <div class="space-y-3 mb-6">
      <div class="flex items-center justify-between px-1">
        <span class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
          <GraduationCap class="w-3.5 h-3.5" /> {appState.myInstitution.name} — School Classes
        </span>
        {#if appState.isClassesLoading}<RefreshCw class="w-3.5 h-3.5 text-emerald-400 animate-spin" />{/if}
      </div>
      {#if myInstitutionTracks.length === 0 && !appState.isClassesLoading}
        <p class="text-[11px] text-slate-600 px-1">Your school hasn't published classes yet — open any class below to get a feel for the education.</p>
      {:else}
        <div class="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
          {#each myInstitutionTracks as track (track.id)}
            {@render trackBrowserCard(track, 'emerald')}
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Left: Recents + enrolled classes -->
  <div class="space-y-6">
    <!-- Enrolled institution classes (runtime JSON lessons — no rebuild) -->
    {#if appState.joinedClasses.length > 0}
      <div class="space-y-3">
        <span class="text-[10px] uppercase font-mono tracking-widest text-indigo-400 font-bold px-1 flex items-center gap-1.5">
          <GraduationCap class="w-3.5 h-3.5" /> My Enrolled Classes
        </span>
        <div class="space-y-2">
          {#each appState.joinedClasses as jc (jc.id)}
            {@const isOpen = appState.activeStudioLesson?.id === jc.id}
            <button onclick={() => openLesson(jc.id)}
              class="w-full text-left p-3 rounded-xl transition border text-xs flex items-start justify-between gap-2 {isOpen ? 'bg-indigo-600/15 border-indigo-500' : 'bg-slate-950/60 hover:bg-[#09152b]/55 border-indigo-900/50'}">
              <div class="space-y-1 flex-1">
                <h4 class="font-bold text-white">{jc.title}</h4>
                <p class="text-[10px] text-slate-400">{jc.subject}{jc.grade_level && jc.grade_level !== 'all' ? ` • Grade ${jc.grade_level}` : ''}{jc.institution_name ? ` • ${jc.institution_name}` : ''}</p>
              </div>
              <span class="px-2 py-0.5 rounded {isOpen ? 'bg-indigo-600' : 'bg-slate-800'} text-white text-[9px] font-bold uppercase shrink-0 flex items-center gap-1">
                {#if isOpen}<span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Open{:else}<Play class="w-2.5 h-2.5" /> Open{/if}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    <!-- Recently Played Section -->
    {#if recentlyPlayedLessons.length > 0}
      <div class="space-y-4">
        <span class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">Recently Played</span>
        <div class="flex gap-4 overflow-x-auto pb-2 scroll-smooth">
          {#each recentlyPlayedLessons as recent}
            <button transition:fly={{ y: 20, duration: 300 }} onclick={() => { setSelectedLesson(recent as any); setActiveQuiz(null); setActiveGame(null); loadLessonComponent(recent.id); }}
              class="flex-shrink-0 w-64 frosted-glass-dark rounded-2xl p-4 border border-blue-900/50 hover:border-blue-600 transition snap-start">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                  <BookOpen class="w-6 h-6 text-white" />
                </div>
                <div class="space-y-1 flex-1 text-left">
                  <h4 class="font-bold text-white text-sm line-clamp-2">{recent.title}</h4>
                  <div class="flex items-center gap-2">
                    <span class="text-[9px] uppercase font-mono tracking-widest bg-blue-950 text-blue-400 px-1 py-0.5 rounded">{recent.subject}</span>
                    <CheckCircle class="w-3 h-3 text-emerald-400" />
                  </div>
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}

  </div>

  </div>

  <!-- Active learning panes (quiz / games / proctor exams) -->
  <div class="space-y-6 min-w-0">
    {#if appState.selectedLesson && !appState.activeQuiz && !appState.activeGame}
      {@const lesson = appState.selectedLesson}
      <div class="frosted-glass-dark rounded-3xl p-6 sm:p-8 border border-blue-950 overflow-hidden relative space-y-6">
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-600"></div>
        <div class="flex justify-between items-start flex-wrap gap-4 border-b border-blue-950 pb-5">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold text-blue-400 bg-blue-950 border border-blue-900/40 px-2 py-0.5 rounded">Track: {lesson.curriculum?.toUpperCase?.() ?? ''}</span>
              <span class="text-xs text-slate-400 font-light">• {(lesson.durationMin ?? 0)} Min lecture</span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">{lesson.title}</h2>
          </div>
          <div class="flex gap-2">
            <button onclick={() => {
              const targetQuiz = QUIZZES.find(q => q.lessonId === lesson.id);
              if (targetQuiz) { setActiveQuiz(targetQuiz); setQuizAnswers(new Array(targetQuiz.questions.length).fill(-1)); setShowQuizResult(false); startVerifiedProctorExam(); }
            }} class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-1.5">
              <Video class="w-4 h-4 animate-pulse text-red-400" /> Start Proctored Exam
            </button>
          </div>
        </div>
        <div class="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-light">
          {lesson.content}
        </div>
        <div class="flex flex-wrap gap-3 pt-4 border-t border-blue-950">
          <button onclick={() => setActiveQuiz(QUIZZES.find(q => q.lessonId === lesson.id) || null)}
            class="px-4 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold transition">Take Quiz</button>
          <button onclick={() => setActiveGame("trinity")}
            class="px-4 py-2 rounded-lg bg-cyan-800/50 hover:bg-cyan-700 text-cyan-200 text-xs font-bold border border-cyan-700/50 transition">Trinity Game</button>
          <button onclick={() => setActiveGame("robotics")}
            class="px-4 py-2 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 text-xs font-bold border border-indigo-700/50 transition">Robotics Calibration</button>
          <button onclick={() => setActiveGame("incentive")}
            class="px-4 py-2 rounded-lg bg-emerald-800/50 hover:bg-emerald-700 text-emerald-200 text-xs font-bold border border-emerald-700/50 transition">Incentive Equation</button>
        </div>
      </div>
    {/if}

    {#if appState.selectedLesson && appState.currentLessonComponent && !appState.activeQuiz && !appState.activeGame}
      <LessonComponentRenderer />
    {/if}

    <!-- Full-screen lesson reader: whole-page content with back / prev / next -->
    {#if isLessonFullscreen && (appState.activeStudioLesson || appState.isStudioLessonLoading || appState.studioLessonError)}
      <div transition:fade={{ duration: 200 }} class="fixed inset-0 z-50 bg-[#030712] overflow-y-auto">
        <div class="sticky top-0 z-10 bg-[#060b18]/95 backdrop-blur border-b border-blue-950/60">
          <div class="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
            <button onclick={closeFullscreen}
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition shrink-0">
              <ArrowLeft class="w-3.5 h-3.5" /> Lectures
            </button>
            <div class="flex-1 min-w-0 text-center">
              <p class="text-sm font-extrabold text-white truncate">{appState.activeStudioLesson?.title || 'Loading lesson…'}</p>
              {#if lessonNavList.length > 1}
                <p class="text-[9px] font-mono text-slate-500">Lesson {lessonNavIdx + 1} of {lessonNavList.length}</p>
              {/if}
            </div>
            <button onclick={() => prevLesson && openLesson(prevLesson.id)} disabled={!prevLesson}
              class="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 text-[11px] font-bold transition shrink-0">
              <ChevronLeft class="w-3.5 h-3.5" /> Prev
            </button>
            <button onclick={() => nextLesson && openLesson(nextLesson.id)} disabled={!nextLesson}
              class="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[11px] font-bold transition shrink-0">
              Next <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {#if appState.isStudioLessonLoading}
            <div class="text-center space-y-3 py-16">
              <RefreshCw class="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
              <p class="text-xs text-slate-400">Loading lesson…</p>
            </div>
          {:else if appState.studioLessonError}
            <div class="text-center space-y-3 py-16">
              <p class="text-sm font-bold text-red-300">Could not open lesson</p>
              <p class="text-xs text-slate-400">{appState.studioLessonError}</p>
              <button onclick={closeFullscreen} class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition">Back to lectures</button>
            </div>
          {:else if appState.activeStudioLesson}
            {#key appState.activeStudioLesson.id}
              <LessonPlayer lesson={appState.activeStudioLesson} onClose={closeFullscreen} />
            {/key}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Quiz -->
    {#if appState.activeQuiz && !appState.showQuizResult}
      <div transition:fade={{ duration: 300 }} class="frosted-glass-dark rounded-3xl p-6 sm:p-8 border border-blue-950 space-y-6">
        <div class="flex justify-between items-center border-b border-blue-950 pb-4">
          <h3 class="font-extrabold text-white text-lg uppercase">{appState.activeQuiz.title}</h3>
          {#if appState.isExamProctoring}
            <span class="px-3 py-1 rounded bg-red-950 border border-red-500/30 text-red-300 text-xs font-mono flex items-center gap-1.5">
              <Shield class="w-3.5 h-3.5" /> Proctored: {formatExamTime(appState.examTimer)}
            </span>
          {/if}
        </div>
        {#if appState.isExamProctoring}
          <div class="bg-slate-950 rounded-xl p-3 space-y-2">
            <div class="flex items-center gap-3">
              <video bind:this={videoEl} autoplay muted playsinline class="w-20 h-16 rounded-lg bg-black border border-blue-900 object-cover"></video>
              <div class="text-[10px] font-mono text-slate-400 space-y-0.5 flex-1">
                {#each appState.proctorLogs.slice(-3) as log, i}
                  <p class={log.includes("WARNING") ? "text-amber-400" : "text-emerald-400"}>{log}</p>
                {/each}
              </div>
            </div>
            <div class="w-full bg-slate-900 h-1 rounded overflow-hidden">
              <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-full transition-all duration-1000 {examTimerWidthClass}"></div>
            </div>
          </div>
        {/if}
        <div class="space-y-6">
          {#each appState.activeQuiz.questions as q, qIdx}
            <div class="space-y-3">
              <h4 class="text-sm font-bold text-white">{qIdx + 1}. {q.question}</h4>
              <div class="space-y-2">
                {#each q.options as opt, oIdx}
                  <button onclick={() => {
                    const copy = [...appState.quizAnswers]; copy[qIdx] = oIdx; setQuizAnswers(copy);
                  }} class="w-full text-left p-3 rounded-xl border text-xs transition {appState.quizAnswers[qIdx] === oIdx ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">{opt}</button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        <button onclick={handleQuizSubmit} disabled={appState.quizAnswers.includes(-1)}
          class="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition {appState.quizAnswers.includes(-1) ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}">Submit & Verify Answers</button>
      </div>
    {/if}

    <!-- Quiz Result -->
    {#if appState.showQuizResult && appState.activeQuiz}
      <div transition:fade={{ duration: 300 }} class="frosted-glass-dark rounded-3xl p-8 border border-blue-500 text-center space-y-4 animate-fade-in">
        <h3 class="text-2xl font-extrabold text-white uppercase">Quiz Complete</h3>
        <div class="text-6xl font-extrabold text-blue-400 font-mono">{appState.quizScore}/{appState.activeQuiz.questions.length}</div>
        <p class="text-slate-400 text-sm">{appState.quizScore === appState.activeQuiz.questions.length ? "Perfect score! Badge unlocked!" : "Keep studying and try again!"}</p>
        <button onclick={() => setActiveQuiz(null)} class="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition">Back to Lessons</button>
      </div>
    {/if}

    <!-- Games -->
    {#if appState.activeGame === "trinity" && !appState.activeQuiz}
      <div transition:fade={{ duration: 300 }}><TrinityGame onClose={() => setActiveGame(null)} /></div>
    {/if}
    {#if appState.activeGame === "robotics" && !appState.activeQuiz}
      <div transition:fade={{ duration: 300 }}><RoboticsGame onClose={() => setActiveGame(null)} /></div>
    {/if}
    {#if appState.activeGame === "incentive" && !appState.activeQuiz}
      <div transition:fade={{ duration: 300 }}><IncentiveGame onClose={() => setActiveGame(null)} /></div>
    {/if}

    <!-- Proctor Exam Button (when no quiz active) -->
    {#if appState.isExamProctoring && !appState.activeQuiz}
      <div class="frosted-glass rounded-2xl p-6 border border-red-900 text-center space-y-4">
        <Shield class="w-10 h-10 text-red-400 mx-auto animate-pulse" />
        <h3 class="font-bold text-white">Proctoring Active</h3>
        <p class="text-xs text-slate-400">Time remaining: {formatExamTime(appState.examTimer)}</p>
        <button onclick={() => stopVerifiedProctorExam(0, 0)} class="px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs">Stop Proctoring</button>
      </div>
    {/if}
  </div>
</div>

{#if appState.isOnboarded && appState.currentTrackId && appState.isCurriculumLoading}
  <div class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 flex items-center justify-center">
    <div class="frosted-glass-dark p-8 rounded-3xl space-y-4 text-center">
      <RefreshCw class="w-10 h-10 text-blue-400 animate-spin mx-auto" />
      <p class="text-sm text-white font-bold">Loading your personalized curriculum...</p>
    </div>
  </div>
{/if}

{#if appState.isOnboarded && appState.curriculumError}
  <div class="fixed bottom-20 left-4 right-4 z-50 frosted-glass-dark border border-red-500/40 p-4 rounded-2xl flex items-start gap-3">
    <Shield class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
    <div>
      <p class="text-xs text-red-300 font-bold">Curriculum load failed</p>
      <p class="text-[11px] text-slate-400">{appState.curriculumError}</p>
      <button onclick={() => { setCurriculumError(''); loadCurriculumForStudent(); }} class="mt-2 px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 text-[10px] font-bold uppercase tracking-wider">Retry</button>
    </div>
  </div>
{/if}