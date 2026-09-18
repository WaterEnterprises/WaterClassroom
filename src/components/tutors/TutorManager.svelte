<script lang="ts">
  // Human tutor management (invites + class/grade permissions).
  // Rendered inside the Tutors screen for institution accounts.
  import { appState } from '../../lib/store.svelte';
  import { GraduationCap, Plus, Trash2, BookOpen, X, Copy, KeyRound, Check, Mail, Link2, Layers } from 'lucide-svelte';
  import { fade, slide } from 'svelte/transition';

  interface TutorInvite {
    id: string;
    name: string;
    email: string;
    subjects: string[];
    invite_code: string;
    status: string;
    claimed_name: string;
    created_at: string;
    claimed_at: string;
    expires_at: string;
    last_emailed_at: string;
    email_status: string;
    invite_link: string;
  }

  let showAddTutor = $state(false);
  let newTutorName = $state("");
  let newTutorEmail = $state("");
  let newTutorSubjects = $state("");
  let isInvitingTutor = $state(false);
  let tutorError = $state("");
  let justCreatedTutorCode = $state<{ id: string; name: string; code: string; link: string } | null>(null);
  let sendingTutorEmailId = $state("");
  let tutorEmailNotice = $state("");
  let pickingTutorId = $state("");
  let assigningGradeId = $state("");
  let instClasses = $state<Array<any>>([]);
  let instGrades = $state<Array<any>>([]);

  const realTutors = $derived(appState.institutionTutors as any[]);
  // Tracks → grades available for assignment, with each grade's tutors.
  const gradesByTrack = $derived.by(() => {
    const map = new Map<string, { track_id: string; track_name: string; grades: Array<any> }>();
    for (const g of instGrades) {
      const entry = map.get(g.track_id) || { track_id: g.track_id, track_name: g.track_name || 'Track', grades: [] };
      entry.grades.push(g);
      map.set(g.track_id, entry);
    }
    return [...map.values()];
  });
  const tutorsForGrade = (gradeId: string) => realTutors.filter((t: any) => (t.grades || []).some((g: any) => g.grade_id === gradeId));
  const pendingTutorInvites = $derived((appState.institutionTutorInvites as TutorInvite[]).filter(i => i.status === "invited"));
  const claimedTutorInvites = $derived((appState.institutionTutorInvites as TutorInvite[]).filter(i => i.status !== "invited"));
  const pickableClasses = $derived(instClasses);

  function inviteLinkFor(inv: { invite_code: string; invite_link?: string }): string {
    if (inv.invite_link) return inv.invite_link;
    try {
      return `${window.location.origin}/join/${inv.invite_code}`;
    } catch {
      return `/join/${inv.invite_code}`;
    }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { /* clipboard unavailable — code stays visible for manual copy */ }
  }

  // Add a tutor → server generates their UNIQUE tutor signup code (TUT-XXXXXX).
  // Claiming it creates a Tutor account in the system (Academy access +
  // assigned classes/students + forum moderation).
  async function inviteTutor() {
    if (isInvitingTutor || !newTutorName.trim() || !newTutorEmail.trim()) return;
    isInvitingTutor = true;
    tutorError = "";
    justCreatedTutorCode = null;
    try {
      const res = await fetch("/api/institution/roster/tutor-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: newTutorName.trim(), email: newTutorEmail.trim(), subjects: newTutorSubjects }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add tutor");
      justCreatedTutorCode = { id: data.id || "", name: data.name, code: data.invite_code, link: data.invite_link || "" };
      newTutorName = ""; newTutorEmail = ""; newTutorSubjects = "";
      showAddTutor = false;
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to add tutor";
    } finally {
      isInvitingTutor = false;
    }
  }

  async function reloadTutors() {
    try {
      const [tutorsRes, invitesRes, gradesRes, classesRes] = await Promise.all([
        fetch("/api/institution/curriculum/tutors", { credentials: "same-origin" }),
        fetch("/api/institution/roster/tutor-invites", { credentials: "same-origin" }),
        fetch("/api/institution/curriculum/grades", { credentials: "same-origin" }),
        fetch("/api/institution/curriculum/classes", { credentials: "same-origin" }),
      ]);
      if (tutorsRes.ok) {
        const data = await tutorsRes.json();
        if (Array.isArray(data.tutors)) appState.institutionTutors = data.tutors;
      }
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        appState.institutionTutorInvites = data.invites || [];
      }
      if (gradesRes.ok) {
        const data = await gradesRes.json();
        instGrades = data.grades || [];
      }
      if (classesRes.ok) {
        const data = await classesRes.json();
        instClasses = data.classes || [];
      }
    } catch { /* list keeps previous data */ }
  }

  // Email the tutor invite (code + click-to-join link).
  async function sendTutorEmail(inv: TutorInvite) {
    if (sendingTutorEmailId) return;
    sendingTutorEmailId = inv.id;
    tutorEmailNotice = "";
    try {
      const res = await fetch(`/api/institution/roster/tutor-invites/${inv.id}/send-email`, { method: "POST", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      tutorEmailNotice = `Invite emailed to ${inv.email} ✓`;
      await reloadTutors();
    } catch (err: any) {
      tutorEmailNotice = err.message || "Failed to send email";
    } finally {
      sendingTutorEmailId = "";
    }
  }

  async function revokeTutorInvite(id: string) {
    if (!confirm("Revoke this tutor invite code? It will no longer work for signup.")) return;
    try {
      const res = await fetch(`/api/institution/roster/tutor-invites/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to revoke invite");
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to revoke invite";
    }
  }

  async function removeTutor(id: string, name: string) {
    if (!confirm(`Remove tutor ${name}? Their tutor entry and linked Tutor account will be deleted.`)) return;
    try {
      const res = await fetch(`/api/institution/roster/tutors/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove tutor");
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to remove tutor";
    }
  }

  async function assignClassToTutor(tutorId: string, classId: string) {
    tutorError = "";
    try {
      const res = await fetch("/api/institution/curriculum/tutors/assign-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tutor_id: tutorId, class_id: classId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      pickingTutorId = "";
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to assign class";
    }
  }

  async function unassignClassFromTutor(tutorId: string, classId: string) {
    tutorError = "";
    try {
      const res = await fetch(`/api/institution/curriculum/tutors/${tutorId}/classes/${classId}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to unassign");
      }
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to unassign class";
    }
  }

  // Grade permission: the tutor sees every class (with students) in the grade.
  async function assignGradeToTutor(tutorId: string, gradeId: string) {
    tutorError = "";
    try {
      const res = await fetch("/api/institution/curriculum/tutors/assign-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tutor_id: tutorId, grade_id: gradeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      assigningGradeId = "";
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to assign grade";
    }
  }

  async function unassignGradeFromTutor(tutorId: string, gradeId: string) {
    tutorError = "";
    try {
      const res = await fetch(`/api/institution/curriculum/tutors/${tutorId}/grades/${gradeId}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to unassign");
      }
      await reloadTutors();
    } catch (err: any) {
      tutorError = err.message || "Failed to unassign grade";
    }
  }

  $effect(() => {
    if (appState.landingAuthRole === "institution") {
      reloadTutors();
    }
  });
</script>

<div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><GraduationCap class="w-4 h-4 text-amber-400" /> Tutor Management</h3>
      <p class="text-[10px] text-slate-400">{realTutors.length} tutors — give them grade permission or assign individual classes below</p>
    </div>
    <button onclick={() => { showAddTutor = !showAddTutor; tutorError = ""; }} class="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider transition">
      <Plus class="w-3.5 h-3.5" /> Add Tutor
    </button>
  </div>

  {#if showAddTutor}
    <div class="bg-slate-950/60 border border-amber-900/30 rounded-xl p-4 space-y-3 animate-fade-in">
      <p class="text-[10px] text-slate-400">Adding a tutor generates their <strong class="text-amber-300">unique tutor signup code + invite link</strong> — email it with the ✉️ button, or share the link. Claiming it creates a <strong class="text-amber-300">Tutor account</strong> in the system (Academy access + assigned classes/students + forum moderation).</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="text" placeholder="Tutor Name" bind:value={newTutorName} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500" />
        <input type="email" placeholder="Email Address" bind:value={newTutorEmail} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500" />
        <input type="text" placeholder="Subjects (comma-separated)" bind:value={newTutorSubjects} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500" />
      </div>
      {#if tutorError}<p class="text-[10px] text-red-400 font-bold">{tutorError}</p>{/if}
      <button onclick={inviteTutor} disabled={isInvitingTutor || !newTutorName.trim() || !newTutorEmail.trim()}
        class="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold rounded-lg uppercase transition">
        {isInvitingTutor ? 'Generating code…' : 'Generate Tutor Code'}
      </button>
    </div>
  {/if}
  {#if justCreatedTutorCode}
    <div transition:fade={{ duration: 200 }} class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-700/50">
      <div>
        <p class="text-[9px] uppercase font-mono tracking-widest text-amber-400 font-bold">Tutor code for {justCreatedTutorCode.name}</p>
        <code class="text-lg font-mono font-extrabold text-amber-300 tracking-widest">{justCreatedTutorCode.code}</code>
        {#if justCreatedTutorCode.link}<p class="text-[10px] text-slate-400 font-mono break-all mt-1">{justCreatedTutorCode.link}</p>{/if}
      </div>
      <div class="flex items-center gap-2">
        <button onclick={() => copyText(justCreatedTutorCode?.code || '')} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy code"><Copy class="w-4 h-4" /></button>
        {#if justCreatedTutorCode.link}<button onclick={() => copyText(justCreatedTutorCode?.link || '')} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy invite link"><Link2 class="w-4 h-4" /></button>{/if}
        <button onclick={() => { justCreatedTutorCode = null; }} class="p-2 rounded-lg text-slate-500 hover:text-white transition" title="Dismiss"><X class="w-4 h-4" /></button>
      </div>
    </div>
  {/if}
  {#if tutorEmailNotice}<p class="text-[10px] font-bold {tutorEmailNotice.includes('✓') ? 'text-emerald-300' : 'text-red-400'}">{tutorEmailNotice}</p>{/if}
  {#if tutorError && !showAddTutor}<p class="text-[10px] text-red-400 font-bold">{tutorError}</p>{/if}
  {#if pendingTutorInvites.length > 0 || claimedTutorInvites.length > 0}
    <div class="rounded-xl border border-amber-800/40 bg-amber-950/10 p-4 space-y-2">
      <h4 class="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold px-1 flex items-center gap-1.5"><KeyRound class="w-3.5 h-3.5" /> Tutor signup codes ({pendingTutorInvites.length} pending)</h4>
      {#each pendingTutorInvites as inv (inv.id)}
        <div transition:slide={{ duration: 300 }} class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div>
            <span class="text-xs font-bold text-slate-200">{inv.name}</span>
            <span class="text-[10px] text-slate-500 block">{inv.email}{inv.subjects?.length ? ` • ${inv.subjects.join(', ')}` : ''}{inv.last_emailed_at ? ` • emailed ${String(inv.last_emailed_at).slice(0, 10)}` : ''}</span>
          </div>
          <div class="flex items-center gap-2">
            <code class="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-700/50 text-amber-300 text-xs font-mono font-bold tracking-widest">{inv.invite_code}</code>
            <button onclick={() => copyText(inv.invite_code)} class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy code"><Copy class="w-3.5 h-3.5" /></button>
            <button onclick={() => copyText(inviteLinkFor(inv))} class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy invite link"><Link2 class="w-3.5 h-3.5" /></button>
            <button onclick={() => sendTutorEmail(inv)} disabled={sendingTutorEmailId === inv.id} class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-950/40 transition disabled:opacity-40" title="Email code + link to tutor"><Mail class="w-3.5 h-3.5" /></button>
            <button onclick={() => revokeTutorInvite(inv.id)} class="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition" title="Revoke invite"><Trash2 class="w-3.5 h-3.5" /></button>
          </div>
        </div>
      {/each}
      {#each claimedTutorInvites as inv (inv.id)}
        <div class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-900">
          <div>
            <span class="text-xs font-bold text-slate-300">{inv.name}</span>
            <span class="text-[10px] text-slate-500 block">{inv.email}</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1"><Check class="w-2.5 h-2.5" /> Joined{inv.claimed_name && inv.claimed_name !== inv.name ? ` as ${inv.claimed_name}` : ''}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="space-y-2">
    {#each realTutors as tutor (tutor.id)}
      <div transition:slide={{ duration: 300 }} class="p-4 bg-slate-950/50 rounded-xl border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-amber-900/40 border border-amber-700/50 flex items-center justify-center text-amber-300 text-[10px] font-extrabold">{(tutor.name || 'T')[0].toUpperCase()}</div>
            <div>
              <strong class="text-xs text-white block">{tutor.name}</strong>
              <span class="text-[10px] text-slate-400 font-mono">{tutor.email}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-mono text-amber-400 bg-amber-950/60 px-2 py-1 rounded border border-amber-800/50">{(tutor.subjects || []).length} subjects</span>
            <button onclick={() => removeTutor(tutor.id, tutor.name)} class="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition" title="Remove tutor from institution"><Trash2 class="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <!-- Grade permission: tutor sees every class (with students) in these grades.
             Assign grades in the Tracks & Grades list below. -->
        <div class="flex flex-wrap gap-1.5 pl-11">
          {#each tutor.grades || [] as tg (tg.grade_id)}
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-1">
              <Layers class="w-2.5 h-2.5" /> {tg.track_name} • {tg.grade_label}
              <button onclick={() => unassignGradeFromTutor(tutor.id, tg.grade_id)} class="hover:text-red-400 transition" title="Remove grade permission from {tutor.name}"><X class="w-2.5 h-2.5" /></button>
            </span>
          {:else}
            <span class="text-[9px] text-slate-600">No grade permission — assign below.</span>
          {/each}
        </div>
        <div class="flex flex-wrap gap-1.5 pl-11">
          {#each tutor.classes || [] as tc (tc.class_id)}
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950/40 border border-amber-800/60 text-amber-300 flex items-center gap-1">
              <BookOpen class="w-2.5 h-2.5" /> {tc.class_title}
              <button onclick={() => unassignClassFromTutor(tutor.id, tc.class_id)} class="hover:text-red-400 transition" title="Remove this class from {tutor.name}"><X class="w-2.5 h-2.5" /></button>
            </span>
          {/each}
          <button onclick={() => { pickingTutorId = pickingTutorId === tutor.id ? '' : tutor.id; }}
            class="px-2 py-0.5 rounded-full text-[9px] font-bold border border-dashed border-slate-700 text-slate-400 hover:border-amber-700 hover:text-amber-300 transition flex items-center gap-1">
            <Plus class="w-2.5 h-2.5" /> Assign class
          </button>
        </div>
        {#if pickingTutorId === tutor.id}
          <div class="pl-11 animate-fade-in">
            <div class="rounded-xl border border-amber-900/40 bg-slate-950/70 p-3 space-y-1.5">
              <p class="text-[9px] uppercase font-mono tracking-widest text-amber-400 font-bold">Pick a class for {tutor.name}</p>
              {#if pickableClasses.length === 0}
                <p class="text-[10px] text-slate-500">No classes yet — create one in the Studio tab first.</p>
              {:else}
                <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {#each pickableClasses as cls (cls.id)}
                    <button onclick={() => assignClassToTutor(tutor.id, cls.id)}
                      class="w-full text-left px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-amber-700 text-[10px] text-slate-200 transition">
                      <span class="font-bold">{cls.title}</span>
                      <span class="text-slate-500 block">{cls.subject} • Grade {cls.grade_level}</span>
                    </button>
                  {/each}
                </div>
              {/if}
              <button onclick={() => pickingTutorId = ''} class="text-[9px] text-slate-500 hover:text-slate-300 transition">Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    {#if realTutors.length === 0 && pendingTutorInvites.length === 0}
      <div class="text-center py-8 text-xs text-slate-600">
        <GraduationCap class="w-8 h-8 mx-auto mb-2 text-slate-800" />
        <p>No tutors yet. Add your first tutor above — they'll get a signup code for a Tutor account.</p>
      </div>
    {/if}
  </div>

  <!-- Tracks & grades: assign grade permission to tutors -->
  <div class="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4 space-y-3">
    <div>
      <h4 class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold px-1 flex items-center gap-1.5"><Layers class="w-3.5 h-3.5" /> Tracks & Grades</h4>
      <p class="text-[10px] text-slate-400 px-1">Assign a grade to a tutor — they get tutor permission on every class in it, with all enrolled students.</p>
    </div>
    {#if instGrades.length === 0}
      <p class="text-[11px] text-slate-600 px-1">No grades yet — create tracks and grades in the Studio tab first.</p>
    {:else}
      {#each gradesByTrack as tg (tg.track_id)}
        <div class="space-y-1.5">
          <p class="text-[10px] font-bold text-slate-300 px-1">{tg.track_name}</p>
          {#each tg.grades as g (g.id)}
            {@const assigned = tutorsForGrade(g.id)}
            <div class="px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="text-xs font-bold text-slate-200">{g.label}</span>
                  <span class="text-[10px] text-slate-500 block">Grade {g.grade_level} • {g.lesson_count ?? 0} lessons • {assigned.length} tutor{assigned.length === 1 ? '' : 's'}</span>
                </div>
                <button onclick={() => { assigningGradeId = assigningGradeId === g.id ? '' : g.id; tutorError = ""; }}
                  class="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase transition {assigningGradeId === g.id ? 'bg-slate-700 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}">
                  {assigningGradeId === g.id ? 'Cancel' : 'Assign tutor'}
                </button>
              </div>
              {#if assigned.length > 0}
                <div class="flex flex-wrap gap-1.5">
                  {#each assigned as t (t.id)}
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-1">
                      {t.name}
                      <button onclick={() => unassignGradeFromTutor(t.id, g.id)} class="hover:text-red-400 transition" title="Remove {t.name} from {g.label}"><X class="w-2.5 h-2.5" /></button>
                    </span>
                  {/each}
                </div>
              {/if}
              {#if assigningGradeId === g.id}
                <div class="animate-fade-in">
                  {#if realTutors.length === 0}
                    <p class="text-[10px] text-slate-500">No tutors yet — add one above first.</p>
                  {:else}
                    <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                      {#each realTutors as t (t.id)}
                        {@const hasIt = (t.grades || []).some((gg: any) => gg.grade_id === g.id)}
                        <button onclick={() => assignGradeToTutor(t.id, g.id)} disabled={hasIt}
                          class="w-full text-left px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-emerald-700 disabled:opacity-40 text-[10px] text-slate-200 transition">
                          <span class="font-bold">{t.name}</span>
                          <span class="text-slate-500 block">{t.email}{hasIt ? ' • already assigned ✓' : ''}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>
