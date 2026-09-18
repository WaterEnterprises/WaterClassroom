<script lang="ts">
  import { appState, handleLoadInstitutionData } from '../lib/store.svelte';
  import { Users, GraduationCap, BarChart3, Settings, Plus, Trash2, Shield, ClipboardList, CreditCard, Download, TrendingUp, BookOpen, X, Copy, KeyRound, Check, Mail, Link2 } from 'lucide-svelte';
  import { fade, slide } from 'svelte/transition';

  interface RosterStudent {
    id: string;
    name: string;
    email: string;
    grade: string;
    curriculum: string;
    status: "active" | "invited" | "pending";
    lastActive: string;
    progress: number;
  }

  interface StudentInvite {
    id: string;
    name: string;
    email: string;
    grade_level: string;
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



  let activeSection = $state<"overview" | "roster" | "analytics" | "settings">("overview");
  let showAddStudent = $state(false);
  let newStudentEmail = $state("");
  let newStudentName = $state("");
  let newStudentGrade = $state("5");
  let isInviting = $state(false);
  let inviteError = $state("");
  let justCreatedCode = $state<{ id: string; name: string; code: string; link: string } | null>(null);
  let sendingEmailId = $state("");
  let emailNotice = $state("");
  // Buy more student spots (seat-based billing via Stripe).
  let buySpotsQty = $state(5);
  let buySpotsBilling = $state<"monthly" | "yearly">("monthly");
  let isBuyingSpots = $state(false);
  let buySpotsMsg = $state("");
  let seatsFlash = $state("");

  async function buySpots() {
    const qty = Math.max(1, Math.min(5000, Math.floor(Number(buySpotsQty) || 0)));
    if (!qty || isBuyingSpots) return;
    isBuyingSpots = true;
    buySpotsMsg = "";
    try {
      const res = await fetch("/api/create-seats-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ spots: qty, billingCycle: buySpotsBilling }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.details || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      buySpotsMsg = err.message || "Checkout failed";
    } finally {
      isBuyingSpots = false;
    }
  }

  $effect(() => {
    // Post-Stripe return: confirm credited spots and refresh.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("seats_success")) {
        seatsFlash = `Payment received — ${params.get("spots") || ""} spots will appear once confirmed. Refreshing…`;
        window.history.replaceState({}, "", window.location.pathname);
        handleLoadInstitutionData();
      } else if (params.get("seats_cancel")) {
        seatsFlash = "Spot purchase cancelled — no charge made.";
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* ignore */ }
  });

  // Server roster rows use grade_level/last_active — normalize for the table.
  const realStudents = $derived((appState.institutionStudents as any[]).map((s: any) => ({
    id: s.id, name: s.name, email: s.email,
    grade: s.grade ?? s.grade_level ?? "—",
    curriculum: s.curriculum ?? "School curriculum",
    status: "active" as const,
    lastActive: s.lastActive ?? s.last_active ?? "",
    progress: typeof s.progress === "number" ? s.progress : Math.min(100, Math.round((s.points || 0) / 10)),
  })) as RosterStudent[]);
  const effectiveStudents = $derived(realStudents);
  const rosterStudents = $derived(effectiveStudents as RosterStudent[]);
  const pendingInvites = $derived((appState.institutionInvites as StudentInvite[]).filter(i => i.status === "invited"));
  const claimedInvites = $derived((appState.institutionInvites as StudentInvite[]).filter(i => i.status !== "invited"));

  async function reloadRoster() {
    try {
      const [rosterRes, invitesRes] = await Promise.all([
        fetch("/api/institution/roster", { credentials: "same-origin" }),
        fetch("/api/institution/roster/invites", { credentials: "same-origin" }),
      ]);
      if (rosterRes.ok) {
        const data = await rosterRes.json();
        appState.institutionStudents = data.students || [];
        appState.institutionSeats = {
          paid: Number(data.paid_seats || 50),
          used: Number(data.used_seats || 0),
        };
      }
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        appState.institutionInvites = data.invites || [];
      }
    } catch { /* table keeps previous data */ }
  }

  // Add a student → server generates their UNIQUE signup code.
  async function inviteStudent() {
    if (isInviting || !newStudentName.trim() || !newStudentEmail.trim()) return;
    isInviting = true;
    inviteError = "";
    justCreatedCode = null;
    try {
      const res = await fetch("/api/institution/roster/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: newStudentName.trim(), email: newStudentEmail.trim(), grade_level: newStudentGrade || "5" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add student");
      justCreatedCode = { id: data.id || "", name: data.name, code: data.invite_code, link: data.invite_link || "" };
      newStudentName = ""; newStudentEmail = ""; newStudentGrade = "5";
      showAddStudent = false;
      await reloadRoster();
    } catch (err: any) {
      inviteError = err.message || "Failed to add student";
    } finally {
      isInviting = false;
    }
  }

  function inviteLinkFor(inv: { invite_code: string; invite_link?: string }): string {
    if (inv.invite_link) return inv.invite_link;
    try {
      return `${window.location.origin}/join/${inv.invite_code}`;
    } catch {
      return `/join/${inv.invite_code}`;
    }
  }

  // Email the invite (code + click-to-join link) to the student.
  async function sendInviteEmail(inv: StudentInvite) {
    if (sendingEmailId) return;
    sendingEmailId = inv.id;
    emailNotice = "";
    try {
      const res = await fetch(`/api/institution/roster/invites/${inv.id}/send-email`, { method: "POST", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      emailNotice = `Invite emailed to ${inv.email} ✓`;
      await reloadRoster();
    } catch (err: any) {
      emailNotice = err.message || "Failed to send email";
    } finally {
      sendingEmailId = "";
    }
  }

  async function revokeInvite(id: string) {
    if (!confirm("Revoke this invite code? It will no longer work for signup.")) return;
    try {
      const res = await fetch(`/api/institution/roster/invites/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to revoke invite");
      await reloadRoster();
    } catch (err: any) {
      inviteError = err.message || "Failed to revoke invite";
    }
  }

  async function removeEnrolledStudent(id: string, name: string) {
    if (!confirm(`Remove ${name} from this institution? Their account and enrollments will be deleted.`)) return;
    try {
      const res = await fetch(`/api/institution/roster/students/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove student");
      await reloadRoster();
    } catch (err: any) {
      inviteError = err.message || "Failed to remove student";
    }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { /* clipboard unavailable — code stays visible for manual copy */ }
  }

  const totalSeats = $derived(appState.institutionSeats.paid || 50);
  const usedSeats = $derived(appState.institutionSeats.used || 0);
  const avgProgress = $derived(Math.round(effectiveStudents.reduce((sum: number, s: any) => sum + Math.round((s.points || 0) / 10), 0) / Math.max(effectiveStudents.length, 1)));
  const isInstitution = $derived(appState.landingAuthRole === "institution");

  const widthClass = (pct: number) => pct >= 100 ? 'w-full' : pct >= 75 ? 'w-3/4' : pct >= 50 ? 'w-1/2' : pct >= 25 ? 'w-1/4' : 'w-0';

  $effect(() => {
    if (isInstitution && appState.institutionStudents.length === 0) {
      handleLoadInstitutionData();
    }
  });
</script>

<div transition:fade={{ duration: 300 }} class="space-y-8 animate-fade-in text-white">
  <!-- Header -->
  <div class="blue-gradient-bg rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl border border-blue-400/20">
    <div class="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 bg-blue-300/30 rounded-full blur-3xl"></div>
    <div class="relative z-10 space-y-3">
      <span class="px-3 py-1 bg-blue-900/60 text-[9px] font-extrabold uppercase tracking-widest border border-blue-300/30 rounded-full">
        🏛️ {isInstitution ? "Institution" : "School"} Admin Panel
      </span>
      <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">{appState.studentName || "School Dashboard"}</h2>
      <p class="text-sm text-blue-100 font-light max-w-xl">Manage your roster, track student progress, and configure your institution's Water Classroom deployment.</p>
      <div class="flex flex-wrap gap-3 pt-2">
        <span class="bg-blue-900/50 border border-blue-400/30 px-3 py-1 rounded-full text-[10px] font-mono">📧 {appState.loginEmail}</span>
        <span class="bg-emerald-900/50 border border-emerald-400/30 px-3 py-1 rounded-full text-[10px] font-mono">📚 {appState.onboardingCurriculum}</span>
      </div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="flex gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 flex-wrap">
    {#each [{ key: "overview" as const, label: "Overview", icon: BarChart3 }, { key: "roster" as const, label: "Student Roster", icon: Users }, { key: "analytics" as const, label: "Analytics", icon: TrendingUp }, { key: "settings" as const, label: "Settings", icon: Settings }] as tab}
      <button onclick={() => activeSection = tab.key} class="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {activeSection === tab.key ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
        <tab.icon class="w-3.5 h-3.5" /> {tab.label}
      </button>
    {/each}
  </div>

  <!-- Sections stay mounted (hidden, not destroyed) so form inputs, codes, and pickers survive tab switches. -->
  <div class="space-y-6" class:hidden={activeSection !== "overview"}>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="frosted-glass rounded-2xl p-5 border border-blue-900/30 space-y-2">
          <div class="flex items-center gap-2 text-indigo-400"><Users class="w-4 h-4" /><span class="text-[10px] uppercase font-mono font-bold text-slate-400">Active Students</span></div>
          <strong class="text-3xl font-extrabold text-white">{usedSeats}</strong>
          <span class="text-[10px] text-slate-500 block">/ {totalSeats} licensed seats</span>
          <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-indigo-500 h-full rounded-full {widthClass((usedSeats / totalSeats) * 100)}"></div></div>
        </div>
        <div class="frosted-glass rounded-2xl p-5 border border-blue-900/30 space-y-2">
          <div class="flex items-center gap-2 text-emerald-400"><GraduationCap class="w-4 h-4" /><span class="text-[10px] uppercase font-mono font-bold text-slate-400">Avg Progress</span></div>
          <strong class="text-3xl font-extrabold text-white">{avgProgress}%</strong>
        </div>
        <div class="frosted-glass rounded-2xl p-5 border border-blue-900/30 space-y-2">
          <div class="flex items-center gap-2 text-amber-400"><ClipboardList class="w-4 h-4" /><span class="text-[10px] uppercase font-mono font-bold text-slate-400">Curriculums</span></div>
          <strong class="text-3xl font-extrabold text-white">{new Set(rosterStudents.map(s => s.curriculum)).size}</strong>
        </div>
        <div class="frosted-glass rounded-2xl p-5 border border-blue-900/30 space-y-2">
          <div class="flex items-center gap-2 text-blue-400"><CreditCard class="w-4 h-4" /><span class="text-[10px] uppercase font-mono font-bold text-slate-400">Monthly Cost</span></div>
          <strong class="text-3xl font-extrabold text-white">${usedSeats * 12}</strong>
        </div>
      </div>
    </div>

  <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4" class:hidden={activeSection !== "roster"}>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Users class="w-4 h-4 text-indigo-400" /> Student Roster</h3>
          <p class="text-[10px] text-slate-400">{rosterStudents.length} enrolled · {pendingInvites.length} invite{pendingInvites.length === 1 ? '' : 's'} pending</p>
        </div>
        <div class="flex gap-2">
          <button onclick={() => { showAddStudent = !showAddStudent; inviteError = ""; }} class="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider transition">
            <Plus class="w-3.5 h-3.5" /> Add Student
          </button>
        </div>
      </div>
      {#if showAddStudent}
        <div class="bg-slate-950/60 border border-indigo-900/30 rounded-xl p-4 space-y-3 animate-fade-in">
          <p class="text-[10px] text-slate-400">Adding a student generates their <strong class="text-emerald-300">unique signup code + invite link</strong> — email it to them with the ✉️ button, or share the link directly. They join instantly, already linked and activated.</p>
          <p class="text-[10px] font-mono {usedSeats >= totalSeats ? 'text-red-400 font-bold' : 'text-slate-500'}">Spots: {usedSeats}/{totalSeats} used{usedSeats >= totalSeats ? ' — buy more spots in Settings to add students' : ''}</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="text" placeholder="Full Name" value={newStudentName} oninput={(e) => newStudentName = (e.target as HTMLInputElement).value} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <input type="email" placeholder="Email Address" value={newStudentEmail} oninput={(e) => newStudentEmail = (e.target as HTMLInputElement).value} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <select value={newStudentGrade} onchange={(e) => newStudentGrade = (e.target as HTMLSelectElement).value} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
              {#each ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as grade}
                <option value={grade}>Grade {grade}</option>
              {/each}
            </select>
          </div>
          {#if inviteError}<p class="text-[10px] text-red-400 font-bold">{inviteError}</p>{/if}
          <button onclick={inviteStudent} class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-bold rounded-lg uppercase transition" disabled={isInviting || !newStudentName.trim() || !newStudentEmail.trim()}>{isInviting ? 'Generating code…' : 'Generate Signup Code'}</button>
        </div>
      {/if}
      {#if justCreatedCode}
        <div transition:fade={{ duration: 200 }} class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50">
          <div>
            <p class="text-[9px] uppercase font-mono tracking-widest text-emerald-400 font-bold">Signup code for {justCreatedCode.name}</p>
            <code class="text-lg font-mono font-extrabold text-emerald-300 tracking-widest">{justCreatedCode.code}</code>
            {#if justCreatedCode.link}<p class="text-[10px] text-slate-400 font-mono break-all mt-1">{justCreatedCode.link}</p>{/if}
          </div>
          <div class="flex items-center gap-2">
            <button onclick={() => copyText(justCreatedCode?.code || '')} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy code"><Copy class="w-4 h-4" /></button>
            {#if justCreatedCode.link}<button onclick={() => copyText(justCreatedCode?.link || '')} class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy invite link"><Link2 class="w-4 h-4" /></button>{/if}
            <button onclick={() => { justCreatedCode = null; }} class="p-2 rounded-lg text-slate-500 hover:text-white transition" title="Dismiss"><X class="w-4 h-4" /></button>
          </div>
        </div>
      {/if}
      {#if emailNotice}<p class="text-[10px] font-bold {emailNotice.includes('✓') ? 'text-emerald-300' : 'text-red-400'}">{emailNotice}</p>{/if}
      {#if inviteError && !showAddStudent}<p class="text-[10px] text-red-400 font-bold">{inviteError}</p>{/if}
      {#if pendingInvites.length > 0 || claimedInvites.length > 0}
        <div class="rounded-xl border border-emerald-800/40 bg-emerald-950/10 p-4 space-y-2">
          <h4 class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold px-1 flex items-center gap-1.5"><KeyRound class="w-3.5 h-3.5" /> Signup codes ({pendingInvites.length} pending)</h4>
          {#each pendingInvites as inv (inv.id)}
            <div transition:slide={{ duration: 300 }} class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <span class="text-xs font-bold text-slate-200">{inv.name}</span>
                <span class="text-[10px] text-slate-500 block">{inv.email} • Grade {inv.grade_level}{inv.last_emailed_at ? ` • emailed ${String(inv.last_emailed_at).slice(0, 10)}` : ''}</span>
              </div>
              <div class="flex items-center gap-2">
                <code class="px-2.5 py-1 rounded-lg bg-slate-950 border border-emerald-700/50 text-emerald-300 text-xs font-mono font-bold tracking-widest">{inv.invite_code}</code>
                <button onclick={() => copyText(inv.invite_code)} class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy code"><Copy class="w-3.5 h-3.5" /></button>
                <button onclick={() => copyText(inviteLinkFor(inv))} class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Copy invite link"><Link2 class="w-3.5 h-3.5" /></button>
                <button onclick={() => sendInviteEmail(inv)} disabled={sendingEmailId === inv.id} class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-950/40 transition disabled:opacity-40" title="Email code + link to student"><Mail class="w-3.5 h-3.5" /></button>
                <button onclick={() => revokeInvite(inv.id)} class="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition" title="Revoke invite"><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
            </div>
          {/each}
          {#each claimedInvites as inv (inv.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-900">
              <div>
                <span class="text-xs font-bold text-slate-300">{inv.name}</span>
                <span class="text-[10px] text-slate-500 block">{inv.email} • Grade {inv.grade_level}</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1"><Check class="w-2.5 h-2.5" /> Joined{inv.claimed_name && inv.claimed_name !== inv.name ? ` as ${inv.claimed_name}` : ''}</span>
            </div>
          {/each}
        </div>
      {/if}
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead><tr class="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500 font-mono">
            <th class="text-left py-2.5 px-2 font-bold">Name</th>
            <th class="text-left py-2.5 px-2 font-bold">Email</th>
            <th class="text-left py-2.5 px-2 font-bold">Grade</th>
            <th class="text-left py-2.5 px-2 font-bold hidden sm:table-cell">Curriculum</th>
            <th class="text-center py-2.5 px-2 font-bold">Status</th>
            <th class="text-center py-2.5 px-2 font-bold hidden md:table-cell">Progress</th>
            <th class="text-right py-2.5 px-2 font-bold"></th>
          </tr></thead>
          <tbody>
            {#each rosterStudents as s (s.id)}
              <tr transition:slide={{ duration: 300 }} class="border-b border-slate-900/60 hover:bg-slate-950/40 transition">
                <td class="py-2.5 px-2 font-bold text-white">{s.name}</td>
                <td class="py-2.5 px-2 text-slate-400">{s.email}</td>
                <td class="py-2.5 px-2 text-slate-300">{s.grade}</td>
                <td class="py-2.5 px-2 text-slate-400 hidden sm:table-cell">{s.curriculum}</td>
                <td class="py-2.5 px-2 text-center">
                  <span class="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase {s.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : s.status === 'invited' ? 'bg-blue-950 text-blue-400 border border-blue-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">{s.status}</span>
                </td>
                <td class="py-2.5 px-2 text-center hidden md:table-cell">
                  <div class="flex items-center gap-2 justify-center">
                    <div class="w-16 bg-slate-900 h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full {s.progress >= 70 ? 'bg-emerald-500' : s.progress >= 30 ? 'bg-amber-500' : 'bg-blue-500'} {widthClass(s.progress)}"></div></div>
                    <span class="text-[9px] font-mono text-slate-400">{s.progress}%</span>
                  </div>
                </td>
                <td class="py-2.5 px-2 text-right">
                  <button class="p-1 hover:bg-rose-950/50 rounded text-slate-500 hover:text-rose-400 transition" title="Remove student from institution" onclick={() => removeEnrolledStudent(s.id, s.name)}>
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" class:hidden={activeSection !== "analytics"}>
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><BarChart3 class="w-4 h-4 text-emerald-400" /> Engagement Overview</h3>
        <div class="space-y-3">
          {#each [{ label: "Daily Active Users", value: `${usedSeats}`, total: `${totalSeats}`, pct: `${Math.round(usedSeats/totalSeats*100)}%` }, { label: "Avg Session Time", value: "47 min", total: "-", pct: "-" }, { label: "Lessons Completed", value: `${rosterStudents.reduce((s, x) => s + Math.floor(x.progress / 10), 0)}`, total: "-", pct: "-" }, { label: "Certificate Readiness", value: `${rosterStudents.filter(s => s.progress >= 80).length}`, total: `${usedSeats}`, pct: usedSeats ? `${Math.round(rosterStudents.filter(s => s.progress >= 80).length / usedSeats * 100)}%` : "0%" }] as item, idx (idx)}
            <div class="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl">
              <div class="space-y-0.5">
                <span class="text-[10px] text-slate-400">{item.label}</span>
                <div class="flex items-center gap-2">
                  <strong class="text-lg font-extrabold text-white">{item.value}</strong>
                  {#if item.total !== "-"}<span class="text-[10px] text-slate-500">/ {item.total}</span>{/if}
                </div>
              </div>
              {#if item.pct !== "-"}
                <div class="text-right"><span class="text-lg font-extrabold text-white">{item.pct}</span></div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><BookOpen class="w-4 h-4 text-blue-400" /> Curriculum Distribution</h3>
        {#each Array.from(new Set(rosterStudents.map(s => s.curriculum))) as curriculum (curriculum)}
          {@const count = rosterStudents.filter(s => s.curriculum === curriculum).length}
          {@const pct = Math.round((count / rosterStudents.length) * 100)}
          <div class="space-y-1">
            <div class="flex justify-between text-[10px]">
              <span class="text-slate-300">{curriculum}</span>
              <span class="text-slate-500 font-mono">{count} students ({pct}%)</span>
            </div>
            <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full {widthClass(pct)}"></div></div>
          </div>
        {/each}
      </div>
    </div>

  <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-6 max-w-2xl" class:hidden={activeSection !== "settings"}>
    <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Settings class="w-4 h-4 text-amber-400" /> Institution Settings</h3>
      <div class="space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Institution Name</label>
          <input type="text" value={appState.studentName} readonly class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white/60 cursor-not-allowed" />
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Admin Email</label>
          <input type="email" value={appState.loginEmail} readonly class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white/60 cursor-not-allowed" />
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Student Spots (paid)</label>
          <div class="flex items-center gap-2">
            <strong class="text-2xl font-extrabold text-white font-mono">{usedSeats}<span class="text-sm text-slate-500"> / {totalSeats}</span></strong>
            <span class="text-[10px] text-slate-500">spots used at $12/spot/month</span>
          </div>
          <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full {widthClass(totalSeats ? (usedSeats / totalSeats) * 100 : 0)}"></div></div>
        </div>
        {#if seatsFlash}<p class="text-[10px] font-bold text-emerald-300">{seatsFlash}</p>{/if}
        <div class="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Buy more spots</label>
          <div class="flex flex-wrap items-center gap-2">
            <input type="number" min={1} max={5000} bind:value={buySpotsQty}
              class="w-24 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono" />
            <div class="flex gap-1.5">
              <button onclick={() => buySpotsBilling = "monthly"}
                class="px-3 py-1.5 text-[10px] font-bold rounded-lg border transition {buySpotsBilling === 'monthly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-700 text-slate-400'}">Monthly $12</button>
              <button onclick={() => buySpotsBilling = "yearly"}
                class="px-3 py-1.5 text-[10px] font-bold rounded-lg border transition {buySpotsBilling === 'yearly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-700 text-slate-400'}">Yearly $144</button>
            </div>
            <button onclick={buySpots} disabled={isBuyingSpots || !(Number(buySpotsQty) >= 1)}
              class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold uppercase transition">
              {isBuyingSpots ? 'Redirecting…' : `Buy ${(Number(buySpotsQty) >= 1 ? Math.floor(Number(buySpotsQty)) : 0)} spots — $${((Number(buySpotsQty) >= 1 ? Math.floor(Number(buySpotsQty)) : 0) * (buySpotsBilling === 'yearly' ? 144 : 12)).toLocaleString()}`}
            </button>
          </div>
          {#if buySpotsMsg}<p class="text-[10px] text-red-400 font-bold">{buySpotsMsg}</p>{/if}
          <p class="text-[9px] text-slate-600">Secure Stripe checkout. Spots are credited automatically after payment.</p>
        </div>
        <div class="flex items-center gap-2 p-3 bg-slate-950/50 rounded-xl border border-slate-800">
          <Shield class="w-5 h-5 text-emerald-400" />
          <div class="text-[10px] text-slate-400">
            <strong class="text-emerald-300 block">Deployment Active</strong>
            Your institution is online. All active students have full access to the Water Classroom.
          </div>
        </div>
      </div>
    </div>
</div>
