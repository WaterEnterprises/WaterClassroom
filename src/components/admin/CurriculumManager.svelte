<script lang="ts">
  // Reusable curriculum manager used by both the system Class Studio (global
  // K-12/world curriculum) and the institution dashboard (customized curriculum).
  import RichTextEditor from './RichTextEditor.svelte';
  import TrackList from '../studio/TrackList.svelte';
  import GradeList from '../studio/GradeList.svelte';
  import CourseList from '../studio/CourseList.svelte';
  import LessonList from '../studio/LessonList.svelte';
  import { parseQuizMarkdown } from '../../../server/quiz-parser';
  import {
    GraduationCap, Plus, Trash2, Save, Upload, Gamepad2, BookOpen,
    RefreshCw, Check, X, Layers, FileText, Pencil, Users, KeyRound, Copy,
    HelpCircle, Link2,
  } from 'lucide-svelte';
  import { fade, fly } from 'svelte/transition';
  import { COUNTRY_CATALOG } from '../../lib/countryCatalog';
  import { appState } from '../../lib/store.svelte';

  interface AdminTrack { id: string; name: string; description: string; grade_level: string; subject: string; class_count?: number; country_code?: string; }
  interface AdminClass { id: string; track_id: string; title: string; description: string; subject: string; grade_level: string; estimated_minutes: number; game_path: string; game_filename: string; content_html: string; class_code?: string; grade_id?: string; course_id?: string; }
  interface AdminGrade { id: string; track_id: string; grade_level: string; label: string; lesson_count?: number; }
  interface AdminCourse { id: string; track_id: string; grade_id?: string; name: string; description: string; subject: string; lesson_count?: number; }
  interface WaterTrack { id: string; source: 'water-k12' | 'system'; name: string; description: string; institution_name: string; country_code?: string; grade_count: number; course_count: number; lesson_count: number; subjects?: Array<{ subject: string; grades: string[]; lesson_count: number }>; }

  const countryName = (code?: string) => {
    if (!code || code === 'GLOBAL') return 'Global';
    return COUNTRY_CATALOG.find(c => c.code === code)?.name || code;
  };


  let {
    /** API base: '/api/studio' (system) or '/api/institution/curriculum' (institution) */
    apiBase,
    showStudentCode = false,
    showTutors = false,
    /** When false, all class join-code UI (KeyRound buttons + code panel) is hidden.
        Used by the Studio page — codes live only on the School page roster. */
    showClassCodes = true,
    emptyTitle = 'No tracks yet',
    emptyHint = 'Create your first track — then add classes to it.',
    /** Institution Studio: allow cloning Water K-12 templates into own tracks */
    showWaterImport = false,
    /** Institution Studio: organize lessons under grades inside a track */
    groupByGrade = false,
  }: {
    apiBase: string;
    showStudentCode?: boolean;
    showTutors?: boolean;
    showClassCodes?: boolean;
    emptyTitle?: string;
    emptyHint?: string;
    showWaterImport?: boolean;
    groupByGrade?: boolean;
  } = $props();

  const GRADES = ['all', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const SUBJECTS = ['General', 'Mathematics', 'Science', 'History', 'Geography', 'Leadership', 'English', 'Visual Arts', 'Robotics', 'Creed'];

  // ─── State ───
  let tracks = $state<AdminTrack[]>([]);
  let classes = $state<AdminClass[]>([]);
  let selectedTrackId = $state('');
  let editingClassId = $state('');
  let isLoading = $state(false);
  let isSaving = $state(false);
  let isUploading = $state(false);
  let statusMsg = $state('');
  let statusKind = $state<'ok' | 'err'>('ok');

  // Editor form
  let formTitle = $state('');
  let formDescription = $state('');
  let formSubject = $state('General');
  let formGrade = $state('all');
  let formMinutes = $state(15);
  let formContent = $state('');
  let formQuizMarkdown = $state('');
  let formGameFilename = $state('');
  let formGameUrl = $state('');
  let formGameNeedsExtract = $state(false);

  // Live preview of the markdown quiz (same parser the server uses)
  const parsedQuiz = $derived(parseQuizMarkdown(formQuizMarkdown));

  // Class code & students panel
  let codePanelClassId = $state('');
  let classCode = $state('');
  let codeLoading = $state(false);
  let classStudents = $state<Array<any>>([]);
  let studentsLoading = $state(false);
  let classHasQuiz = $state(false);

  // Student signup code
  let studentCode = $state('');
  let studentCodeLoading = $state(false);

  // Tutors (institution tier only)
  let tutors = $state<Array<any>>([]);
  let tutorsLoaded = $state(false);

  // New track form
  let showTrackForm = $state(false);
  let newTrackName = $state('');
  let newTrackDesc = $state('');
  let newTrackGrade = $state('all');
  let newTrackSubject = $state('General');
  let newTrackCountry = $state('');
  // Default new tracks to the institution's own country (GLOBAL = every country).
  $effect(() => {
    if (!newTrackCountry) {
      newTrackCountry = (appState as any).studentCountry || 'GLOBAL';
    }
  });

  // Track → grade → course → lesson (institution Studio structured mode).
  // List forms/rename state lives inside the studio list components —
  // the parent only keeps data, selection, editor and API callbacks.
  let courses = $state<AdminCourse[]>([]);
  let grades = $state<AdminGrade[]>([]);
  let formGradeId = $state('');
  let formCourseId = $state('');

  // Per-item counts for the list components.
  const gradeStats = $derived(
    Object.fromEntries(grades.map(g => [g.id, { courses: coursesForGrade(g.id).length, lessons: lessonsInGrade(g.id).length }]))
  );
  const courseLessonCounts = $derived(
    Object.fromEntries(courses.map(c => [c.id, lessonsForCourse(c.id).length]))
  );
  // Lessons grouped for track → grade → course → lesson.
  const coursesForGrade = (gradeId: string) => courses.filter(c => (c.grade_id || '') === gradeId);
  const unassignedCourses = $derived(courses.filter(c => !(c.grade_id || '')));
  const lessonsForCourse = (courseId: string) => classes.filter(cl => (cl.course_id || '') === courseId);
  const directLessonsForGrade = (gradeId: string) => classes.filter(cl => (cl.grade_id || '') === gradeId && !(cl.course_id || ''));
  const ungroupedClasses = $derived(classes.filter(cl => !(cl.grade_id || '')));
  const lessonsInGrade = (gradeId: string) => classes.filter(cl => (cl.grade_id || '') === gradeId);

  const selectedTrack = $derived(tracks.find(t => t.id === selectedTrackId) || null);
  const codePanelClass = $derived(classes.find(cl => cl.id === codePanelClassId) || null);

  // ─── Drill-down navigation (institution Studio: tracks → grades → courses → lessons)
  const UG_LESSONS = '__ungraded_lessons__';
  const UG_COURSES = '__ungraded_courses__';
  const DIRECT = '__direct__';
  let selectedGradeId = $state('');
  let selectedCourseId = $state('');
  let lessonWorkspaceOpen = $state(false);
  let editorTab = $state<'class' | 'quiz' | 'game'>('class');

  const isRealGradeSelected = $derived(!!selectedGradeId && selectedGradeId !== UG_LESSONS && selectedGradeId !== UG_COURSES);
  const selectedGrade = $derived(grades.find(g => g.id === selectedGradeId) || null);
  const drillCourses = $derived(
    selectedGradeId === UG_COURSES ? unassignedCourses :
    isRealGradeSelected ? coursesForGrade(selectedGradeId) : []
  );
  const selectedCourse = $derived(drillCourses.find(c => c.id === selectedCourseId) || null);
  const drillLessons = $derived(
    selectedCourseId && selectedCourseId !== DIRECT ? lessonsForCourse(selectedCourseId) :
    selectedCourseId === DIRECT && isRealGradeSelected ? directLessonsForGrade(selectedGradeId) :
    selectedGradeId === UG_LESSONS ? ungroupedClasses : []
  );
  const drillLessonsTitle = $derived(
    selectedCourse ? `Lessons — ${selectedCourse.name}` :
    selectedCourseId === DIRECT && selectedGrade ? `Lessons directly in ${selectedGrade.label}` :
    selectedGradeId === UG_LESSONS ? 'Lessons without a grade' : 'Lessons'
  );

  // One level visible at a time: tracks → grades → courses → lessons.
  // Clicking selects WITHOUT auto-advancing, so each list gets its moment.
  // Switching tracks resets the drill; same-track reloads only prune stale picks.
  let loadedTrackId = $state('');

  function pruneDrillSelection() {
    const gradeValid = grades.some(g => g.id === selectedGradeId) || selectedGradeId === UG_LESSONS || selectedGradeId === UG_COURSES;
    if (!gradeValid) {
      selectedGradeId = '';
      selectedCourseId = '';
      return;
    }
    const cs = selectedGradeId === UG_COURSES ? unassignedCourses
      : isRealGradeSelected ? coursesForGrade(selectedGradeId) : [];
    const validCourseIds = [...cs.map(c => c.id), ...(isRealGradeSelected ? [DIRECT] : [])];
    if (!validCourseIds.includes(selectedCourseId)) selectedCourseId = '';
  }

  function selectGrade(id: string) {
    selectedGradeId = id;
    selectedCourseId = '';
  }

  function selectCourse(id: string) {
    selectedCourseId = id;
  }

  function backToTracks() {
    selectedTrackId = '';
    selectedGradeId = '';
    selectedCourseId = '';
  }

  function backToGrades() {
    selectedGradeId = '';
    selectedCourseId = '';
  }

  function backToCourses() {
    selectedCourseId = '';
  }

  const crumbGradeLabel = $derived(
    isRealGradeSelected ? (selectedGrade?.label || '') :
    selectedGradeId === UG_LESSONS ? 'Ungraded lessons' :
    selectedGradeId === UG_COURSES ? 'Unassigned courses' : ''
  );
  const crumbCourseLabel = $derived(
    selectedCourse ? selectedCourse.name :
    selectedCourseId === DIRECT ? 'Direct lessons' : ''
  );

  function openLessonWorkspace() {
    editorTab = 'class';
    lessonWorkspaceOpen = true;
  }

  function newLessonInContext() {
    if (selectedCourse && selectedCourseId !== DIRECT) {
      startNewClass(selectedCourse.grade_id || '', selectedCourse.id);
    } else if (selectedCourseId === DIRECT && isRealGradeSelected) {
      startNewClass(selectedGradeId, '');
    } else {
      startNewClass('', '');
    }
    openLessonWorkspace();
  }

  function notify(msg: string, kind: 'ok' | 'err' = 'ok') {
    statusMsg = msg;
    statusKind = kind;
    setTimeout(() => { statusMsg = ''; }, 4000);
  }

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(`${apiBase}${path}`, { credentials: 'same-origin', ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ─── Data loading ───
  async function loadTracks() {
    isLoading = true;
    try {
      const data = await api('/tracks');
      tracks = data.tracks || [];
      if (!selectedTrackId && tracks.length > 0) selectedTrackId = tracks[0].id;
    } catch (e: any) { notify(e.message, 'err'); } finally { isLoading = false; }
  }

  async function loadClasses() {
    if (!selectedTrackId) { classes = []; grades = []; courses = []; selectedGradeId = ''; selectedCourseId = ''; loadedTrackId = ''; return; }
    try {
      const data = await api(`/classes?track_id=${encodeURIComponent(selectedTrackId)}`);
      classes = data.classes || [];
    } catch (e: any) { notify(e.message, 'err'); }
    if (groupByGrade) {
      await loadCourses();
      await loadGrades();
      if (loadedTrackId !== selectedTrackId) {
        loadedTrackId = selectedTrackId;
        selectedGradeId = '';
        selectedCourseId = '';
      } else {
        pruneDrillSelection();
      }
    }
  }

  async function loadCourses() {
    if (!selectedTrackId) { courses = []; return; }
    try {
      const data = await api(`/tracks/${encodeURIComponent(selectedTrackId)}/courses`);
      courses = data.courses || [];
    } catch { courses = []; }
  }

  // NOTE (contracts): create/update callbacks rethrow after notifying so the
  // studio list components can keep their forms open on error. Deletes and
  // moves swallow (no form state to preserve).
  async function createCourse(data: { grade_id: string; name: string; description: string }) {
    if (!data.name?.trim()) throw new Error('Course name is required (e.g. Mathematics)');
    if (!data.grade_id) throw new Error('Pick a grade for the course first');
    isSaving = true;
    try {
      const created = await api(`/tracks/${encodeURIComponent(selectedTrackId)}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name.trim(), description: data.description || '', subject: selectedTrack?.subject || 'General', grade_id: data.grade_id }),
      });
      courses = [...courses, created];
      // Step forward into the new course.
      if ((created.grade_id || '') === selectedGradeId) selectedCourseId = created.id;
      notify(`Course “${created.name}” added — now add lessons inside it`);
      return created;
    } catch (e: any) { notify(e.message || 'Could not create course', 'err'); throw e; } finally { isSaving = false; }
  }

  async function renameCourse(id: string, data: { name: string }) {
    if (!data.name?.trim()) return;
    try {
      await api(`/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name.trim() }),
      });
      courses = courses.map(c => c.id === id ? { ...c, name: data.name.trim() } : c);
      notify('Course renamed');
    } catch (e: any) { notify(e.message || 'Could not rename course', 'err'); throw e; }
  }

  async function moveCourse(id: string, gradeId: string) {
    try {
      await api(`/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade_id: gradeId }),
      });
      await loadCourses();
      await loadClasses();
      notify(gradeId ? 'Course moved (lessons followed it)' : 'Course unassigned from its grade');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`Delete course “${name}”? Its lessons stay in the grade, detached from the course.`)) return;
    try {
      await api(`/courses/${id}`, { method: 'DELETE' });
      courses = courses.filter(c => c.id !== id);
      await loadClasses();
      notify('Course deleted — lessons kept in the grade');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  async function renameGrade(id: string, data: { label: string; grade_level: string }) {
    if (!data.label?.trim()) return;
    try {
      const updated = await api(`/grades/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: data.label.trim(), grade_level: (data.grade_level || '').trim() }),
      });
      grades = grades.map(g => g.id === id ? { ...g, label: updated.label, grade_level: updated.grade_level } : g);
      notify('Grade updated');
    } catch (e: any) { notify(e.message || 'Could not rename grade', 'err'); throw e; }
  }

  // ─── Track details editing (flat-mode form state lives here; the grouped
  // TrackList component owns its own copies) ───
  let showTrackEditForm = $state(false);
  let editTrackName = $state('');
  let editTrackDesc = $state('');
  let editTrackSubject = $state('General');
  let editTrackCountry = $state('GLOBAL');

  function openTrackEditForm() {
    if (!selectedTrack) return;
    editTrackName = selectedTrack.name;
    editTrackDesc = selectedTrack.description || '';
    editTrackSubject = selectedTrack.subject || 'General';
    editTrackCountry = selectedTrack.country_code || 'GLOBAL';
    showTrackEditForm = true;
  }

  async function updateTrack(id: string, data: { name: string; description: string; subject: string; country_code: string }) {
    if (!data.name?.trim()) throw new Error('Track name is required');
    isSaving = true;
    try {
      const updated = await api(`/tracks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name.trim(), description: data.description || '', subject: data.subject || 'General', country_code: data.country_code || 'GLOBAL' }),
      });
      tracks = tracks.map(t => t.id === updated.id ? { ...t, name: updated.name, description: updated.description, subject: updated.subject, country_code: updated.country_code } : t);
      showTrackEditForm = false;
      notify(`Track updated — “${updated.name}”`);
      return updated;
    } catch (e: any) { notify(e.message || 'Could not update track', 'err'); throw e; } finally { isSaving = false; }
  }

  function saveTrackEdits() {
    if (!selectedTrack) return;
    updateTrack(selectedTrack.id, { name: editTrackName, description: editTrackDesc, subject: editTrackSubject, country_code: editTrackCountry }).catch(() => {});
  }

  async function loadGrades() {
    if (!selectedTrackId) { grades = []; return; }
    try {
      const data = await api(`/tracks/${encodeURIComponent(selectedTrackId)}/grades`);
      grades = data.grades || [];
    } catch { grades = []; }
  }

  async function createGrade(data: { grade_level: string; label: string }) {
    if (!data.grade_level?.trim()) throw new Error('Grade level is required (e.g. 5)');
    isSaving = true;
    try {
      const created = await api(`/tracks/${encodeURIComponent(selectedTrackId)}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade_level: data.grade_level.trim(), label: data.label?.trim() || `Grade ${data.grade_level.trim()}` }),
      });
      grades = [...grades, created];
      // Step forward into the new grade.
      selectedGradeId = created.id;
      selectedCourseId = '';
      notify(`Grade “${created.label}” added — now add courses and lessons inside it`);
      return created;
    } catch (e: any) { notify(e.message || 'Could not create grade', 'err'); throw e; } finally { isSaving = false; }
  }

  async function deleteGrade(id: string, label: string) {
    if (!confirm(`Delete grade “${label}”? Its lessons are kept as ungrouped lessons in this track.`)) return;
    try {
      await api(`/grades/${id}`, { method: 'DELETE' });
      grades = grades.filter(g => g.id !== id);
      await loadClasses();
      notify('Grade deleted — lessons kept as ungrouped');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  // ─── Water library import (driven by the TrackList component) ───
  async function fetchWaterLibrary() {
    const data = await api('/water-tracks');
    return data.tracks || [];
  }

  async function importWaterTrack(payload: { source: string; track_id?: string; subjects?: string[] }) {
    const data = await api('/tracks/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const name = data.track?.name || 'Water track';
    notify(`“${name}” imported: ${data.grades ?? 0} grades, ${data.courses ?? 0} courses, ${data.lessons ?? 0} lessons — all yours to customize`);
    await loadTracks();
    if (data.track?.id) selectedTrackId = data.track.id;
    return { trackId: data.track?.id as string, name, grades: data.grades ?? 0, courses: data.courses ?? 0, lessons: data.lessons ?? 0 };
  }

  $effect(() => { loadTracks(); });
  $effect(() => { selectedTrackId; loadClasses(); });

  // ─── Track actions (flat-mode form state lives here; the grouped
  // TrackList component owns its own copies and calls createTrack(data)) ───
  async function createTrack(data: { name: string; description: string; grade_level: string; subject: string; country_code: string }) {
    if (!data.name?.trim()) throw new Error('Track name is required');
    isSaving = true;
    try {
      const created = await api('/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name.trim(), description: data.description || '', grade_level: data.grade_level || 'all', subject: data.subject || 'General', country_code: data.country_code || 'GLOBAL' }),
      });
      tracks = [created, ...tracks];
      selectedTrackId = created.id;
      showTrackForm = false;
      newTrackName = ''; newTrackDesc = '';
      notify(`Track created (${countryName(created.country_code)})`);
      return created;
    } catch (e: any) { notify(e.message || 'Could not create track', 'err'); throw e; } finally { isSaving = false; }
  }

  function submitFlatTrackForm() {
    if (!newTrackName.trim()) return;
    createTrack({ name: newTrackName, description: newTrackDesc, grade_level: newTrackGrade, subject: newTrackSubject, country_code: newTrackCountry || 'GLOBAL' }).catch(() => {});
  }

  async function deleteTrack(id: string) {
    if (!confirm('Delete this track and ALL its classes? This cannot be undone.')) return;
    try {
      await api(`/tracks/${id}`, { method: 'DELETE' });
      tracks = tracks.filter(t => t.id !== id);
      if (selectedTrackId === id) selectedTrackId = tracks[0]?.id || '';
      notify('Track deleted');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  // ─── Class editor (lessons live in track → grade → course) ───
  // True when the bodies for the lesson being edited failed to load —
  // saving then would wipe the disk content with empty strings.
  let bodyLoadFailed = $state(false);

  function startNewClass(presetGradeId = '', presetCourseId = '') {
    editingClassId = '';
    bodyLoadFailed = false;
    formTitle = ''; formDescription = ''; formSubject = selectedTrack?.subject || 'General';
    formGrade = selectedTrack?.grade_level || 'all'; formMinutes = 15;
    formGradeId = presetGradeId;
    formCourseId = presetCourseId;
    const presetGrade = grades.find(g => g.id === presetGradeId);
    if (presetGrade) formGrade = presetGrade.grade_level;
    formContent = ''; formQuizMarkdown = ''; formGameFilename = ''; formGameUrl = ''; formGameNeedsExtract = false;
    codePanelClassId = '';
    editorTab = 'class';
  }

  async function editClass(cls: AdminClass) {
    editingClassId = cls.id;
    formTitle = cls.title; formDescription = cls.description;
    formSubject = cls.subject; formGrade = cls.grade_level; formMinutes = cls.estimated_minutes;
    formGradeId = cls.grade_id || '';
    formCourseId = cls.course_id || '';
    // Bodies live on disk — lists carry index data only, so fetch the full lesson.
    formContent = ''; formQuizMarkdown = '';
    formGameFilename = cls.game_filename || ''; formGameUrl = cls.game_path || ''; formGameNeedsExtract = false;
    try {
      const data = await api(`/classes/${cls.id}`);
      if (editingClassId !== cls.id) return;
      formTitle = data.title || formTitle;
      formDescription = data.description || '';
      formSubject = data.subject || formSubject;
      formGrade = data.grade_level || formGrade;
      formMinutes = data.estimated_minutes || formMinutes;
      formGradeId = data.grade_id || '';
      formCourseId = data.course_id || '';
      formContent = data.content_html || '';
      formQuizMarkdown = data.quiz_markdown || '';
      formGameFilename = data.game_filename || ''; formGameUrl = data.game_path || '';
      bodyLoadFailed = false;
      if (groupByGrade) openLessonWorkspace();
    } catch (e: any) {
      bodyLoadFailed = true;
      notify(e.message || 'Could not load lesson content', 'err');
    }
  }

  function onLessonGradeChange() {
    const g = grades.find(x => x.id === formGradeId);
    if (g) formGrade = g.grade_level;
    // A course only makes sense inside the chosen grade.
    if (formCourseId && !coursesForGrade(formGradeId).some(c => c.id === formCourseId)) formCourseId = '';
  }

  async function saveClass() {
    if (!formTitle.trim()) { notify('Class title is required', 'err'); return; }
    if (editingClassId && bodyLoadFailed) {
      notify('Lesson content failed to load — reopen the lesson before saving, or your edits would wipe it.', 'err');
      return;
    }
    isSaving = true;
    try {
      const payload = {
        track_id: selectedTrackId,
        title: formTitle, description: formDescription, subject: formSubject,
        grade_level: formGrade, estimated_minutes: formMinutes,
        content_html: formContent, game_filename: formGameFilename,
        quiz_markdown: formQuizMarkdown,
        grade_id: formGradeId || '',
        course_id: formCourseId || '',
      };
      const data = editingClassId
        ? await api(`/classes/${editingClassId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await api('/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      notify(editingClassId
        ? `Lesson updated — live immediately, no rebuild${parsedQuiz.questions.length ? ` (${parsedQuiz.questions.length} quiz questions)` : ''}`
        : `Lesson published — live immediately, no rebuild${parsedQuiz.questions.length ? ` (${parsedQuiz.questions.length}-question quiz)` : ''}`);
      await loadClasses();
      startNewClass();
      if (groupByGrade) lessonWorkspaceOpen = false;
    } catch (e: any) { notify(e.message, 'err'); } finally { isSaving = false; }
  }

  async function deleteClass(id: string) {
    if (!confirm('Delete this class? Enrolled students lose access.')) return;
    try {
      await api(`/classes/${id}`, { method: 'DELETE' });
      classes = classes.filter(cl => cl.id !== id);
      if (editingClassId === id) startNewClass();
      if (codePanelClassId === id) codePanelClassId = '';
      notify('Class deleted');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  // ─── Game upload ───
  async function handleGameUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    isUploading = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api('/upload-game', { method: 'POST', body: fd });
      formGameFilename = data.filename;
      formGameUrl = data.url;
      formGameNeedsExtract = !!data.needsExtract;
      notify(`Game uploaded: ${data.filename}`);
    } catch (err: any) {
      notify(err.message, 'err');
    } finally {
      isUploading = false;
      input.value = '';
    }
  }

  function removeGame() {
    formGameFilename = ''; formGameUrl = ''; formGameNeedsExtract = false;
  }

  // ─── Class code & enrolled students ───
  async function openCodePanel(cls: AdminClass) {
    if (!showClassCodes) return;
    codePanelClassId = cls.id;
    classCode = '';
    classStudents = [];
    classHasQuiz = false;
    codeLoading = true;
    studentsLoading = true;
    try {
      const codeData = await api(`/classes/${cls.id}/code`);
      classCode = codeData.class_code || '';
    } catch (e: any) { notify(e.message, 'err'); } finally { codeLoading = false; }
    try {
      const stuData = await api(`/classes/${cls.id}/students`);
      classStudents = stuData.students || [];
      classHasQuiz = !!stuData.has_quiz;
    } catch (e: any) { notify(e.message, 'err'); } finally { studentsLoading = false; }
  }

  async function regenerateCode() {
    if (!codePanelClassId) return;
    try {
      const data = await api(`/classes/${codePanelClassId}/code/regenerate`, { method: 'POST' });
      classCode = data.class_code;
      notify('Join code regenerated — old code no longer works');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  async function removeStudent(studentId: string) {
    if (!codePanelClassId || !confirm('Remove this student from the class?')) return;
    try {
      await api(`/classes/${codePanelClassId}/students/${studentId}`, { method: 'DELETE' });
      classStudents = classStudents.filter(s => s.id !== studentId);
      notify('Student removed');
    } catch (e: any) { notify(e.message, 'err'); }
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); notify('Copied to clipboard'); }
    catch { notify('Copy failed — select it manually', 'err'); }
  }

  // ─── Tutor ↔ class assignment (institution tier) ───
  async function loadTutors() {
    if (!showTutors) return;
    try {
      const data = await api('/tutors');
      tutors = data.tutors || [];
      tutorsLoaded = true;
    } catch { tutorsLoaded = true; }
  }

  $effect(() => { if (showTutors && apiBase) loadTutors(); });

  async function assignTutor(tutorId: string, classId: string) {
    try {
      await api('/tutors/assign-class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutor_id: tutorId, class_id: classId }) });
      notify('Tutor assigned to class');
      await loadTutors();
    } catch (e: any) { notify(e.message, 'err'); }
  }

  async function unassignTutor(tutorId: string, classId: string) {
    try {
      await api(`/tutors/${tutorId}/classes/${classId}`, { method: 'DELETE' });
      notify('Tutor removed from class');
      await loadTutors();
    } catch (e: any) { notify(e.message, 'err'); }
  }

  // ─── Student signup code ───
  $effect(() => {
    if (showStudentCode && apiBase && !studentCode) {
      studentCodeLoading = true;
      fetch(`${apiBase}/student-code`, { credentials: 'same-origin' })
        .then(r => r.json())
        .then(d => { studentCode = d.student_code || ''; })
        .catch(() => {})
        .finally(() => { studentCodeLoading = false; });
    }
  });

  async function regenerateStudentCode() {
    studentCodeLoading = true;
    try {
      const data = await api('/student-code/regenerate', { method: 'POST' });
      studentCode = data.student_code;
      notify('Student signup code regenerated');
    } catch (e: any) { notify(e.message, 'err'); } finally { studentCodeLoading = false; }
  }
</script>

<div class="space-y-5">
  {#snippet classRow(cls: AdminClass)}
    <div class="flex items-center gap-1 px-1 py-0.5">
      <button onclick={() => editClass(cls)}
        class="flex-1 text-left px-3 py-2 rounded-xl text-xs transition border {editingClassId === cls.id
          ? 'bg-indigo-600/20 border-indigo-500 text-white'
          : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
        <span class="font-bold flex items-center gap-1.5">
          {#if cls.game_path}<Gamepad2 class="w-3 h-3 text-emerald-400 shrink-0" />{/if}
          {cls.title}
        </span>
        <span class="text-[9px] text-slate-500">{cls.estimated_minutes} min {cls.game_path ? '• has game' : '• rich text'}{groupByGrade && !(cls.grade_id || '') ? ' • ungrouped' : ''}</span>
      </button>
      {#if showClassCodes}
      <button onclick={() => openCodePanel(cls)} title="Join code & students"
        class="p-2 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-950/30 transition">
        <KeyRound class="w-3.5 h-3.5" />
      </button>
      {/if}
      <button onclick={() => deleteClass(cls.id)} title="Delete class"
        class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
        <Trash2 class="w-3.5 h-3.5" />
      </button>
    </div>
  {/snippet}

  {#snippet lessonEditor(showBack: boolean)}
    <!-- Lesson workspace: edit the class, the quiz, or the JS canvas game -->
    <div class="frosted-glass-dark rounded-2xl p-5 border border-blue-900/50 space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 min-w-0">
          <Pencil class="w-4 h-4 text-blue-400 shrink-0" />
          <span class="truncate">{editingClassId ? 'Edit Lesson' : 'New Lesson'}</span>
        </h3>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[9px] font-mono text-slate-500 hidden sm:block">Track: {selectedTrack?.name}</span>
          {#if showBack}
            <button onclick={() => { lessonWorkspaceOpen = false; }}
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition flex items-center gap-1">
              <X class="w-3 h-3" /> Back
            </button>
          {/if}
        </div>
      </div>

      <!-- Editor tabs: class content · quiz · interactive game -->
      <div class="flex gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
        <button onclick={() => editorTab = 'class'}
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {editorTab === 'class' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
          <FileText class="w-3.5 h-3.5" /> Class
          {#if formContent.trim()}<span class="w-1.5 h-1.5 rounded-full bg-current"></span>{/if}
        </button>
        <button onclick={() => editorTab = 'quiz'}
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {editorTab === 'quiz' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
          <HelpCircle class="w-3.5 h-3.5" /> Quiz
          {#if parsedQuiz.questions.length > 0}<span class="text-[9px] font-mono px-1.5 py-px rounded-full bg-white/20">{parsedQuiz.questions.length}</span>{/if}
        </button>
        <button onclick={() => editorTab = 'game'}
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {editorTab === 'game' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
          <Gamepad2 class="w-3.5 h-3.5" /> Game
          {#if formGameUrl}<span class="w-1.5 h-1.5 rounded-full bg-current"></span>{/if}
        </button>
      </div>

      {#if editorTab === 'class'}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input bind:value={formTitle} placeholder="Lesson title"
          class="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500" />
        <input bind:value={formDescription} placeholder="One-line description shown to students"
          class="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500" />
        <select bind:value={formSubject} class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
          {#each SUBJECTS as s}<option value={s}>{s}</option>{/each}
        </select>
        <div class="flex gap-3">
          <select bind:value={formGrade} class="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
            {#each GRADES as g}<option value={g}>Grade {g}</option>{/each}
          </select>
          <input type="number" min="1" max="600" bind:value={formMinutes} title="Estimated minutes"
            class="w-24 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500" />
        </div>
        {#if groupByGrade}
          <select bind:value={formGradeId} onchange={onLessonGradeChange}
            class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Grade: none (ungrouped)</option>
            {#each grades as g}<option value={g.id}>{g.label}</option>{/each}
          </select>
          <select bind:value={formCourseId}
            class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
            <option value="">Course: directly in grade (no course)</option>
            {#each coursesForGrade(formGradeId) as c}<option value={c.id}>{c.name}</option>{/each}
          </select>
        {/if}
      </div>

      <div class="space-y-1.5">
        <label class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold flex items-center gap-1.5 px-1">
          <FileText class="w-3 h-3" /> Lesson content {formGameFilename ? '(shown alongside the game)' : ''}
        </label>
        <RichTextEditor bind:value={formContent} />
      </div>
      {/if}

      {#if editorTab === 'quiz'}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <label class="text-[10px] uppercase font-mono tracking-widest text-purple-400 font-bold flex items-center gap-1.5">
            <HelpCircle class="w-3 h-3" /> Quiz (markdown — parsed into interactive questions)
          </label>
          {#if formQuizMarkdown.trim()}
            <span class="text-[9px] font-mono px-2 py-0.5 rounded-full {parsedQuiz.questions.length > 0 ? 'bg-purple-950 border border-purple-800 text-purple-300' : 'bg-red-950 border border-red-800 text-red-300'}">
              {parsedQuiz.questions.length > 0 ? `${parsedQuiz.questions.length} questions ✓` : 'no questions detected'}
            </span>
          {/if}
        </div>
        <textarea bind:value={formQuizMarkdown} rows={10} placeholder={'## Fractions Quiz\n\n**1.** What is 1/2 + 1/2?\n- 1/4\n✅ * 1\n- 2\n> Halves combine into a whole.'}
          class="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-white font-mono outline-none focus:border-purple-500 custom-scrollbar"></textarea>
        {#if formQuizMarkdown.trim() && parsedQuiz.questions.length > 0}
          <details class="px-3 py-2 rounded-xl bg-slate-950/50 border border-slate-800" open>
            <summary class="text-[10px] text-slate-400 cursor-pointer hover:text-slate-200">Preview parsed questions</summary>
            <div class="space-y-1.5 mt-2">
              {#each parsedQuiz.questions as q, i (i)}
                <p class="text-[10px] text-slate-300"><span class="text-purple-400 font-bold">Q{i + 1}.</span> {q.question} <span class="text-emerald-400">→ ✓ {q.options[q.correctAnswerIndex]}</span> ({q.options.length} options)</p>
              {/each}
            </div>
          </details>
        {/if}
      </div>
      {/if}

      {#if editorTab === 'game'}
      <div class="space-y-2">
        <label class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold flex items-center gap-1.5 px-1">
          <Gamepad2 class="w-3 h-3" /> Interactive game (JS canvas)
        </label>
        <p class="text-[10px] text-slate-500 px-1">Upload a single <code class="font-mono text-emerald-300">.html</code> canvas game (HTML + JS in one file) or a <code class="font-mono text-emerald-300">.zip</code> bundle — students play it right inside the lesson.</p>
        {#if formGameUrl}
          <div class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
            <div class="text-xs">
              <span class="font-bold text-emerald-300 flex items-center gap-1.5"><Gamepad2 class="w-3.5 h-3.5" /> {formGameFilename}</span>
              <span class="text-[10px] text-slate-400">{formGameUrl}</span>
              {#if formGameNeedsExtract}
                <span class="block text-[10px] text-amber-400 mt-0.5">ZIP stored — upload a single .html for instant serving, or extract the zip into /public/games.</span>
              {/if}
            </div>
            <button onclick={removeGame} class="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition"><X class="w-4 h-4" /></button>
          </div>
        {:else}
          <label class="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-600/60 cursor-pointer transition bg-slate-950/40">
            {#if isUploading}
              <RefreshCw class="w-6 h-6 text-blue-400 animate-spin" />
              <span class="text-xs text-slate-400">Uploading…</span>
            {:else}
              <Upload class="w-6 h-6 text-slate-500" />
              <span class="text-xs text-slate-400 font-bold">Upload game .zip or single .html</span>
              <span class="text-[9px] text-slate-600">max 20 MB</span>
            {/if}
            <input type="file" accept=".zip,.html,.htm" class="hidden" onchange={handleGameUpload} disabled={isUploading} />
          </label>
        {/if}
      </div>
      {/if}

      <div class="flex items-center gap-3 pt-2 border-t border-slate-800">
        <button onclick={saveClass} disabled={isSaving || !formTitle.trim()}
          class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center gap-2 transition">
          {#if isSaving}<RefreshCw class="w-3.5 h-3.5 animate-spin" />{:else}<Save class="w-3.5 h-3.5" />{/if}
          {editingClassId ? 'Save Lesson' : 'Publish Lesson'}
        </button>
        {#if editingClassId && !showBack}
          <button onclick={() => startNewClass()} class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition">New Lesson</button>
        {/if}
      </div>
    </div>
  {/snippet}

  {#if statusMsg}
    <div transition:fade class="px-4 py-2.5 rounded-xl text-xs font-bold border {statusKind === 'ok' ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300' : 'bg-red-950/50 border-red-700/50 text-red-300'}">
      {statusMsg}
    </div>
  {/if}

  <!-- Student signup code banner -->
  {#if showStudentCode}
    <div class="frosted-glass-dark rounded-2xl p-4 border border-emerald-800/40 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-700/50 flex items-center justify-center">
          <KeyRound class="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold">Student signup code</p>
          <p class="text-[10px] text-slate-400">Share this so students can create accounts under your institution during registration.</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if studentCodeLoading}
          <RefreshCw class="w-4 h-4 text-slate-500 animate-spin" />
        {:else}
          <code class="px-3 py-1.5 rounded-lg bg-slate-950 border border-emerald-700/50 text-emerald-300 text-sm font-mono font-bold tracking-widest">{studentCode || '—'}</code>
          <button onclick={() => copyCode(studentCode)} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy"><Copy class="w-4 h-4" /></button>
          <button onclick={regenerateStudentCode} class="text-[9px] font-bold uppercase px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">Rotate</button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Header + new track -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2 text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">
      <Layers class="w-4 h-4" /> Curriculum tracks & classes
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if !groupByGrade}
        <button onclick={() => { showTrackForm = !showTrackForm; }} class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition">
          {#if showTrackForm}<X class="w-3.5 h-3.5" /> Cancel{:else}<Plus class="w-3.5 h-3.5" /> New Track{/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- New track form -->
  {#if showTrackForm}
    <div transition:fly={{ y: -10 }} class="frosted-glass-dark rounded-2xl p-5 border border-blue-900/50 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input bind:value={newTrackName} placeholder="Track name (e.g. Grade 5 Mathematics — Full Year)"
          class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500" />
        <input bind:value={newTrackDesc} placeholder="Short description"
          class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500" />
        <select bind:value={newTrackGrade} class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
          {#each GRADES as g}<option value={g}>Grade: {g}</option>{/each}
        </select>
        <select bind:value={newTrackSubject} class="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
          {#each SUBJECTS as s}<option value={s}>{s}</option>{/each}
        </select>
        <select bind:value={newTrackCountry} title="Country scope — who will discover this track in the Water library"
          class="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700 text-sm text-white outline-none focus:border-blue-500">
          <option value="GLOBAL">🌍 Global — visible in every country</option>
          {#each COUNTRY_CATALOG as c}<option value={c.code}>{c.name}</option>{/each}
        </select>
      </div>
      <button onclick={submitFlatTrackForm} disabled={isSaving || !newTrackName.trim()}
        class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition">
        Create Track
      </button>
    </div>
  {/if}

  {#if isLoading}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center">
      <RefreshCw class="w-8 h-8 text-blue-400 animate-spin mx-auto" />
    </div>
  {:else if tracks.length === 0}
    <div class="frosted-glass-dark rounded-3xl p-10 text-center border border-dashed border-slate-700">
      <BookOpen class="w-10 h-10 text-slate-600 mx-auto mb-3" />
      <p class="text-sm font-bold text-white">{emptyTitle}</p>
      <p class="text-xs text-slate-400 mt-1">{emptyHint}</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: tracks + classes -->
      <div class="space-y-4">
        {#if groupByGrade}
          {#if !selectedTrack}
            <!-- Step 0 · tracks only -->
          <TrackList
            tracks={tracks} selectedTrackId={selectedTrackId} selectedTrack={selectedTrack}
            defaultCountry={apiBase === '/api/studio' ? 'GLOBAL' : ((appState as any).studentCountry || 'GLOBAL')}
            showImport={showWaterImport}
            onSelect={(id) => { selectedTrackId = id; }}
            onCreate={createTrack} onUpdate={updateTrack} onDelete={deleteTrack}
            fetchLibrary={fetchWaterLibrary} onImport={importWaterTrack} />
          {:else}
            <!-- Breadcrumb back up the drill-down -->
            <div class="flex items-center gap-1.5 flex-wrap text-[11px] px-1">
              <button onclick={backToTracks} class="text-slate-400 hover:text-white font-bold transition flex items-center gap-1">← Tracks</button>
              <span class="text-slate-600">›</span>
              {#if !selectedGradeId}
                <span class="text-white font-bold">{selectedTrack.name}</span>
                <span class="text-[9px] font-mono text-slate-500">· pick a grade ↓</span>
              {:else}
                <button onclick={backToGrades} class="text-slate-400 hover:text-white font-bold transition">{selectedTrack.name}</button>
                <span class="text-slate-600">›</span>
                {#if (!selectedCourseId && selectedGradeId !== UG_LESSONS)}
                  <span class="text-white font-bold">{crumbGradeLabel}</span>
                  <span class="text-[9px] font-mono text-slate-500">· pick a course ↓</span>
                {:else}
                  <button onclick={backToCourses} class="text-slate-400 hover:text-white font-bold transition">{crumbGradeLabel}</button>
                  <span class="text-slate-600">›</span>
                  <span class="text-white font-bold">{crumbCourseLabel || 'Lessons'}</span>
                {/if}
              {/if}
            </div>
            {#if !selectedGradeId}
              <!-- Step 1 · grades only -->
              <GradeList
                grades={grades} selectedGradeId={selectedGradeId} stats={gradeStats}
                ungroupedCount={ungroupedClasses.length} unassignedCount={unassignedCourses.length}
                ugLessonsId={UG_LESSONS} ugCoursesId={UG_COURSES}
                onSelect={selectGrade} onCreate={createGrade} onRename={renameGrade} onDelete={deleteGrade} />
            {:else if selectedGradeId !== UG_LESSONS && !selectedCourseId}
              <!-- Step 2 · courses only -->
              <CourseList
                gradeId={selectedGradeId === UG_COURSES ? '' : selectedGradeId}
                title={selectedGradeId === UG_COURSES ? 'Courses without a grade' : `Courses — ${selectedGrade?.label || ''}`}
                courses={drillCourses}
                directCount={isRealGradeSelected ? directLessonsForGrade(selectedGradeId).length : 0}
                showDirect={isRealGradeSelected}
                selectedCourseId={selectedCourseId} directId={DIRECT}
                moveGrades={grades} lessonCounts={courseLessonCounts}
                onSelect={selectCourse} onSelectDirect={() => selectCourse(DIRECT)}
                onCreate={createCourse} onRename={renameCourse} onMove={moveCourse} onDelete={deleteCourse} />
            {:else}
              <!-- Step 3 · lessons only -->
              <LessonList
                title={drillLessonsTitle} lessons={drillLessons} editingId={editingClassId}
                showCodes={showClassCodes}
                onCreate={newLessonInContext} onEdit={editClass} onDelete={deleteClass} onCode={openCodePanel} />
            {/if}
          {/if}
        {:else}
        <div class="frosted-glass-dark rounded-2xl p-4 border border-blue-900/40 space-y-2">
          <h3 class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">Tracks</h3>
          {#each tracks as t (t.id)}
            <div class="flex items-center gap-1">
              <button onclick={() => { selectedTrackId = t.id; }}
                class="flex-1 text-left px-3 py-2.5 rounded-xl text-xs transition border {selectedTrackId === t.id
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
                <span class="font-bold flex items-center gap-1.5">{t.name}
                  <span class="text-[8px] font-mono font-bold uppercase px-1.5 py-px rounded {(t.country_code || 'GLOBAL') === 'GLOBAL' ? 'bg-emerald-950 border border-emerald-700 text-emerald-300' : 'bg-indigo-950 border border-indigo-700 text-indigo-300'}">
                    {(t.country_code || 'GLOBAL') === 'GLOBAL' ? '🌍' : t.country_code}
                  </span>
                </span>
                <span class="text-[9px] text-slate-500">{t.subject} • Grade {t.grade_level}{t.class_count != null ? ` • ${t.class_count} classes` : ''}</span>
              </button>
              <button onclick={() => deleteTrack(t.id)} title="Delete track"
                class="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          {/each}
        </div>
        {/if}

        {#if selectedTrack && !groupByGrade}
          <div class="frosted-glass-dark rounded-2xl p-4 border border-blue-900/40 space-y-2">
            <div class="flex items-center justify-between px-1">
              <h3 class="text-[10px] uppercase font-mono tracking-widest text-blue-400 font-bold flex items-center gap-1.5 min-w-0">
                <span class="truncate">Classes — {selectedTrack.name}</span>
                <button onclick={openTrackEditForm} title="Edit track name & details"
                  class="p-1 rounded-md text-slate-500 hover:text-blue-300 hover:bg-blue-950/40 transition shrink-0">
                  <Pencil class="w-3 h-3" />
                </button>
              </h3>
              <div class="flex items-center gap-1.5">
                <button onclick={() => startNewClass()} class="text-[9px] font-bold px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 transition">
                  <Plus class="w-3 h-3" /> New
                </button>
              </div>
            </div>

            <!-- Edit track details -->
            {#if showTrackEditForm && selectedTrack}
              <div transition:fly={{ y: -6 }} class="rounded-xl border border-blue-800/50 bg-blue-950/20 p-3 space-y-2">
                <p class="text-[9px] uppercase font-mono tracking-widest text-blue-400 font-bold px-1">Edit track — make it yours</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input bind:value={editTrackName} placeholder="Track name (e.g. K-12 Mathematics)"
                    class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
                  <input bind:value={editTrackDesc} placeholder="Short description"
                    class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500" />
                  <select bind:value={editTrackSubject} class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
                    {#each SUBJECTS as s}<option value={s}>{s}</option>{/each}
                  </select>
                  <select bind:value={editTrackCountry} title="Country scope"
                    class="px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 text-xs text-white outline-none focus:border-blue-500">
                    <option value="GLOBAL">🌍 Global</option>
                    {#each COUNTRY_CATALOG as c}<option value={c.code}>{c.name}</option>{/each}
                  </select>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick={saveTrackEdits} disabled={isSaving || !editTrackName.trim()}
                    class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold transition">
                    Save Track
                  </button>
                  <button onclick={() => { showTrackEditForm = false; }} class="text-[10px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
                </div>
              </div>
            {/if}

              {#if classes.length === 0}
                <p class="text-[11px] text-slate-500 px-1 py-2">No classes in this track yet.</p>
              {/if}
              {#each classes as cls (cls.id)}
                {@render classRow(cls)}
              {/each}
          </div>
        {/if}
      </div>

      <!-- Right: editor / code panel -->
      <div class="lg:col-span-2 space-y-4">
        {#if showClassCodes && codePanelClass}
          <!-- Class code & students -->
          <div class="frosted-glass-dark rounded-2xl p-5 border border-emerald-800/40 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><KeyRound class="w-4 h-4 text-emerald-400" /> {codePanelClass.title}</h3>
              <button onclick={() => { codePanelClassId = ''; }} class="text-slate-500 hover:text-white transition"><X class="w-4 h-4" /></button>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-950/60 border border-emerald-800/40">
              <div>
                <p class="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-bold">Class join code</p>
                {#if codeLoading}
                  <RefreshCw class="w-4 h-4 text-slate-500 animate-spin mt-1" />
                {:else}
                  <code class="text-lg font-mono font-extrabold text-emerald-300 tracking-widest">{classCode}</code>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <button onclick={() => copyCode(classCode)} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy"><Copy class="w-4 h-4" /></button>
                <button onclick={regenerateCode} class="text-[9px] font-bold uppercase px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">Rotate</button>
              </div>
            </div>

            <!-- Tutor assignment -->
            {#if showTutors}
              <div class="space-y-2 pt-2 border-t border-slate-800">
                <p class="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold flex items-center gap-1.5"><GraduationCap class="w-3.5 h-3.5" /> Tutors for this class</p>
                {#if tutors.length === 0}
                  <p class="text-[11px] text-slate-500">No tutors yet — add them in the Tutors tab first.</p>
                {:else}
                  <div class="flex flex-wrap gap-2">
                    {#each tutors as t (t.id)}
                      {@const assigned = (t.classes || []).some((tc: any) => tc.class_id === codePanelClassId)}
                      <button onclick={() => assigned ? unassignTutor(t.id, codePanelClassId) : assignTutor(t.id, codePanelClassId)}
                        class="px-3 py-1.5 rounded-full text-[10px] font-bold border transition flex items-center gap-1.5 {assigned
                          ? 'bg-amber-950/60 border-amber-700 text-amber-300 hover:border-red-700 hover:text-red-300'
                          : 'bg-slate-950/60 border-slate-700 text-slate-400 hover:border-amber-700 hover:text-amber-300'}"
                        title={assigned ? 'Click to remove from this class' : 'Click to assign to this class'}>
                        {#if assigned}<Check class="w-3 h-3" />{/if}
                        {t.name}
                      </button>
                    {/each}
                  </div>
                  <p class="text-[9px] text-slate-600">Click a tutor to assign/unassign them to “{codePanelClass.title}”.</p>
                {/if}
              </div>
            {/if}

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold flex items-center gap-1.5"><Users class="w-3.5 h-3.5" /> Enrolled students ({classStudents.length})</p>
                {#if classStudents.length > 0}
                  <span class="text-[9px] font-mono text-slate-500">
                    {classStudents.filter(s => s.class_status === 'completed').length}/{classStudents.length} completed
                  </span>
                {/if}
              </div>
              {#if studentsLoading}
                <RefreshCw class="w-4 h-4 text-slate-500 animate-spin" />
              {:else if classStudents.length === 0}
                <p class="text-[11px] text-slate-500">No students yet — share the join code {classCode} with your class.</p>
              {:else}
                {#each classStudents as s (s.id)}
                  <div class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <span class="text-xs font-bold text-slate-200">{s.name}</span>
                      <span class="text-[10px] text-slate-500 block">{s.email} • {s.points ?? 0} XP • Level {s.level ?? 1}{s.last_active ? ` • last active ${String(s.last_active).slice(0, 10)}` : ''}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      {#if s.class_status === 'completed'}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Completed{classHasQuiz && s.class_total > 0 ? ` • ${s.class_score}/${s.class_total}` : ''} ✓
                        </span>
                      {:else if s.class_total > 0}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                          Quiz: {s.class_score}/{s.class_total} — retake to pass
                        </span>
                      {:else if s.class_status === 'in_progress'}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-800">Started</span>
                      {:else}
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-800">Not started</span>
                      {/if}
                      <button onclick={() => removeStudent(s.id)} class="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition" title="Remove"><Trash2 class="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {:else if groupByGrade}
          {#if lessonWorkspaceOpen}
            {@render lessonEditor(true)}
          {:else}
            <div class="frosted-glass-dark rounded-3xl p-10 text-center border border-dashed border-slate-700">
              <Pencil class="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p class="text-sm font-bold text-white">Lesson Studio</p>
              <p class="text-xs text-slate-400 mt-1">Pick a lesson on the left to edit its class, quiz, or game — or create a new one. Changes go live instantly.</p>
            </div>
          {/if}
        {:else}
          {@render lessonEditor(false)}
        {/if}
      </div>
    </div>
  {/if}
</div>
