<script lang="ts">
  import { appState, handleOnboardingNext, handleOnboardingBack, setIsOnboarded, setIsOnboardingComplete, setOnboardingCurriculum, setLandingAuthRole, setStudentCountry, setStudentProgramId, setStudentTrackType, setStudentBillingCycle, setStudentGradeLevelId, setEnrollmentType, setSchoolEnrollCode, fetchAvailableClasses, selectSystemTrack, setSelectedOnboardingTrackId, joinClassByCode } from '../../lib/store.svelte';
  import { Globe, Compass, GraduationCap, BookOpen, ShieldCheck, ArrowLeft, ChevronRight, Check, MapPin, Layers, RefreshCw, Gamepad2, Sparkles, KeyRound, Plus } from 'lucide-svelte';
  import { COUNTRIES, getFilteredPrograms, getFilteredCategories, PROGRAMS, getCountryGradeLevels, getCountryStages, STUDENT_TRACKS } from '../../lib/curriculumData';
  import { fade, scale, fly } from 'svelte/transition';

  const totalSteps = 7;
  const selectedCountry = $derived(COUNTRIES.find(c => c.code === appState.studentCountry));
  const filteredPrograms = $derived(appState.studentCountry ? getFilteredPrograms(appState.studentCountry) : []);
  const filteredCategories = $derived(appState.studentCountry ? getFilteredCategories(appState.studentCountry) : []);
  const selectedProgram = $derived(PROGRAMS.find(p => p.id === appState.studentProgramId));
  const countryGradeLevels = $derived(appState.studentCountry ? getCountryGradeLevels(appState.studentCountry) : []);
  const countryStages = $derived(appState.studentCountry ? getCountryStages(appState.studentCountry) : []);
  const selectedGrade = $derived(countryGradeLevels.find(g => g.id === appState.studentGradeLevelId));
  const selectedStage = $derived(countryStages.find(s => s.key === selectedGrade?.stage));
  const selectedTrack = $derived(STUDENT_TRACKS.find(t => t.id === appState.studentTrackType));

  // ─── Available classes (created by the system in the Class Studio) ───
  const hasAvailableClasses = $derived(appState.availableClasses.length > 0 || appState.availableTracks.length > 0);

  // Join a single class by its institution-issued code
  let joinCodeInput = $state('');
  let joinCodeBusy = $state(false);
  let joinCodeMsg = $state('');
  let joinCodeOk = $state(false);

  async function handleJoinByCode() {
    if (joinCodeBusy || !joinCodeInput.trim()) return;
    joinCodeBusy = true;
    joinCodeMsg = '';
    const result = await joinClassByCode(joinCodeInput);
    joinCodeBusy = false;
    if (result.ok) {
      joinCodeOk = true;
      joinCodeMsg = `Joined “${result.classTitle}” — it's in your Academy.`;
      joinCodeInput = '';
    } else {
      joinCodeOk = false;
      joinCodeMsg = result.error || 'Could not join that class.';
    }
  }

  $effect(() => {
    // Lazily load the class catalog when the user reaches the classes step (5)
    if (appState.onboardingStep === 5 && appState.availableTracks.length === 0 && appState.availableClasses.length === 0 && !appState.isClassesLoading) {
      fetchAvailableClasses();
    }
  });

  const clearOnboardingState = () => {
    try { localStorage.removeItem("wc_onboarding_state"); } catch { /* ignore */ }
  };

  const trackPricing = (trackId: string, yearly: boolean) => {
    if (trackId === "water-student") return yearly ? "$190/yr" : "$19/mo";
    if (trackId === "independent-student") return yearly ? "$150/yr" : "$15/mo";
    if (trackId === "school-student") return yearly ? "$120/yr" : "$12/mo";
    return "";
  };

  const handleConfirmAndPay = async () => {
    setIsOnboarded(true);
    setIsOnboardingComplete(true);
    appState.isUserActivated = true;
    if (selectedProgram) setOnboardingCurriculum(selectedProgram.name);
    if (appState.studentTrackType) setLandingAuthRole(appState.studentTrackType as any);

    let serverType = "Water Student";
    let serverKind = "Water School Homeschool";
    if (appState.studentTrackType === "independent-student") {
      serverType = "Independent Student";
      serverKind = "Self-Directed Learner";
    } else if (appState.studentTrackType === "school-student") {
      serverType = "School Student";
      serverKind = "School-Enrolled Learner";
    } else if (appState.studentTrackType === "water-student") {
      serverType = "Water Student";
      serverKind = "Water School Homeschool";
    }

    try {
      await fetch("/api/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: appState.loginEmail,
          type: serverType,
          kindOfSchool: serverKind,
          country: appState.studentCountry,
          academicTrack: selectedProgram?.name || "General",
          gradeLevel: selectedGrade?.name || "",
          enrollmentType: appState.enrollmentType,
          billingCycle: appState.studentBillingCycle === "yearly" ? "Yearly" : "Monthly",
          isOnboarded: true,
        })
      });
      // If the student picked a system-created track in step 5, persist the enrollment.
      if (appState.selectedOnboardingTrackId) {
        await selectSystemTrack(appState.selectedOnboardingTrackId);
      }
    } catch { /* server update is best-effort */ }

    clearOnboardingState();
  };

  const enrollmentOptions = [
    { id: "independent", label: "Independent Student", desc: "Self-directed learner studying on my own", icon: "🎓" },
    { id: "homeschool", label: "Homeschooled", desc: "Learning at home with family / parent guidance", icon: "🏠" },
    { id: "school", label: "Enrolled at a School", desc: "I have a school enrollment code or access key", icon: "🏫" },
  ];

  // ─── Institution onboarding: a dedicated 3-step flow (institutions are NOT
  // students — skip grade/tracks/billing and go straight to the dashboard). ───
  const INSTITUTION_KINDS = [
    { id: "K-12 School", icon: "🏫", desc: "Primary & secondary education institution" },
    { id: "Homeschool Co-Op", icon: "🏠", desc: "Group of families learning together" },
    { id: "Tutoring Center", icon: "📚", desc: "Supplementary education & tutoring services" },
    { id: "University / Higher-Ed", icon: "🎓", desc: "Colleges, universities & adult education" },
    { id: "Corporate Training", icon: "💼", desc: "Workforce training & professional development" },
    { id: "Other", icon: "🌐", desc: "Any other educational organization" },
  ];

  const isInstitutionOnboarding = $derived(
    appState.landingAuthRole === "institution" && (!appState.isOnboarded || !appState.isOnboardingComplete)
  );
  const instStep = $derived(Math.min(appState.onboardingStep, 3));

  let instKind = $state("");
  let instCompleting = $state(false);
  let instError = $state("");

  function instNext() { appState.onboardingStep = Math.min(appState.onboardingStep + 1, 3); }
  function instBack() { appState.onboardingStep = Math.max(appState.onboardingStep - 1, 1); }

  async function completeInstitutionOnboarding() {
    if (instCompleting) return;
    instCompleting = true;
    instError = "";
    try {
      await fetch("/api/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: appState.loginEmail,
          kindOfSchool: instKind || "Other",
          country: appState.studentCountry || "",
          isOnboarded: true,
        }),
      });
      appState.kindOfSchool = instKind || "Other";
      appState.isOnboarded = true;
      appState.isOnboardingComplete = true;
      appState.isUserActivated = true;
      clearOnboardingState();
    } catch (err: any) {
      instError = err.message || "Could not save your settings. Please try again.";
    } finally {
      instCompleting = false;
    }
  }
</script>

{#if isInstitutionOnboarding}
  <!-- ═══ Institution onboarding (3 steps, different from the student wizard) ═══ -->
  <div transition:fade={{ duration: 200 }} class="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
    <div transition:scale={{ start: 0.95 }} class="frosted-glass-dark p-5 sm:p-8 rounded-3xl max-w-2xl w-full border border-indigo-500/20 space-y-6 my-4">
      <div class="flex items-center justify-between gap-1 mb-2">
        {#each [1, 2, 3] as step}
          <div class="flex items-center gap-1 flex-1">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all {instStep === step
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-110'
              : instStep > step ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'}">
              {#if instStep > step}<Check class="w-3 h-3" />{:else}{step}{/if}
            </div>
            {#if step < 3}<div class="flex-1 h-0.5 rounded {instStep > step ? 'bg-emerald-600' : 'bg-slate-800'}"></div>{/if}
          </div>
        {/each}
      </div>

      {#if instStep === 1}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-indigo-950 border border-indigo-500/30 rounded-full flex items-center justify-center text-indigo-400 mx-auto">
              <Globe class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Where is your institution based?</h3>
            <p class="text-xs text-slate-400">We'll localize dates, examples, and region-specific curriculum options.</p>
          </div>
          <div class="max-h-64 overflow-y-auto custom-scrollbar pr-1">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {#each COUNTRIES as ctry (ctry.code)}
                <button onclick={() => setStudentCountry(ctry.code)}
                  class="px-3 py-2.5 rounded-xl text-xs transition border {appState.studentCountry === ctry.code
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
                  <span class="mr-1.5">{ctry.flag}</span>{ctry.name}
                </button>
            {/each}
            </div>
          </div>
        </div>
      {:else if instStep === 2}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-indigo-950 border border-indigo-500/30 rounded-full flex items-center justify-center text-indigo-400 mx-auto">
              <GraduationCap class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">What kind of institution are you?</h3>
            <p class="text-xs text-slate-400">This shapes your dashboard, defaults, and available curriculum packs.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {#each INSTITUTION_KINDS as k (k.id)}
              <button onclick={() => instKind = k.id}
                class="text-left px-4 py-3 rounded-xl transition border {instKind === k.id
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
                <span class="text-sm font-bold flex items-center gap-2">{k.icon} {k.id}</span>
                <span class="text-[10px] text-slate-500 block mt-0.5">{k.desc}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in text-center">
          <div class="w-14 h-14 bg-emerald-950 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mx-auto">
            <Sparkles class="w-7 h-7" />
          </div>
          <h3 class="text-2xl font-extrabold text-white">You're all set{appState.regSchoolName ? `, ${appState.regSchoolName}` : ''}!</h3>
          <p class="text-xs text-slate-400 max-w-md mx-auto">Your institution dashboard is ready — build your customized tracks in the <strong class="text-slate-200">Studio</strong> tab (start blank or import any Water track, then add grades, courses & lessons), add tutors, and share class join codes with your students.{#if appState.hasSystemPermission} You also have <strong class="text-indigo-300">system access</strong> to author the global K-12 curriculum in the same <strong class="text-indigo-300">Studio</strong> tab.{/if}</p>
          {#if instError}<p class="text-[10px] text-red-400 font-bold">{instError}</p>{/if}
          <button onclick={completeInstitutionOnboarding}
            disabled={instCompleting}
            class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-extrabold uppercase tracking-wider transition">
            {instCompleting ? 'Setting up…' : 'Go to Institution Dashboard'}

          </button>

        </div>
      {/if}

      <!-- Nav buttons -->
      <div class="flex items-center justify-between pt-2">
        <button onclick={instBack} disabled={instStep === 1}
          class="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white disabled:opacity-30 transition flex items-center gap-1">
          <ArrowLeft class="w-3.5 h-3.5" /> Back
        </button>
        {#if instStep < 3}
          <button onclick={instNext} disabled={instStep === 1 && !appState.studentCountry}
            class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center gap-1.5">
            Continue <ChevronRight class="w-3.5 h-3.5" />

          </button>
        {:else}
          <span></span>
        {/if}
      </div>
    </div>
  </div>
{:else if !appState.isOnboarded || (!appState.isOnboardingComplete && !appState.isUserActivated)}
  <div transition:fade={{ duration: 200 }} class="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
    <div transition:scale={{ start: 0.95 }} class="frosted-glass-dark p-5 sm:p-8 rounded-3xl max-w-2xl w-full border border-blue-500/20 space-y-6 my-4">

      <!-- Step Progress -->
      <div class="flex items-center justify-between gap-1 mb-2">
        {#each [1, 2, 3, 4, 5, 6, 7] as step}
          <div class="flex items-center gap-1 flex-1">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all {appState.onboardingStep === step
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-110'
              : appState.onboardingStep > step
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-500'}">
              {#if appState.onboardingStep > step}
                <Check class="w-3 h-3" />
              {:else}
                {step}
              {/if}
            </div>
            {#if step < 7}
              <div class="flex-1 h-0.5 rounded {appState.onboardingStep > step ? 'bg-emerald-600' : 'bg-slate-800'}"></div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Step 1: Select Country -->
      {#if appState.onboardingStep === 1}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-indigo-950 border border-indigo-500/30 rounded-full flex items-center justify-center text-indigo-400 mx-auto">
              <Globe class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Where Are You Located?</h3>
            <p class="text-xs text-slate-400">Select your country so we can show you the right curriculum options. Different countries have different educational standards and homeschooling laws.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {#each COUNTRIES as c (c.code)}
              <button
                onclick={() => { setStudentCountry(c.code); setStudentProgramId(""); }}
                class="flex items-center gap-3 px-4 py-3 rounded-xl text-xs transition border {appState.studentCountry === c.code
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-600'}"
              >
                <span class="text-lg">{c.flag}</span>
                <div class="text-left">
                  <span class="font-bold block text-[11px]">{c.name}</span>
                  <span class="text-[9px] text-slate-500">{c.categories.length} program categories</span>
                </div>
                {#if appState.studentCountry === c.code}
                  <Check class="w-4 h-4 text-indigo-400 ml-auto shrink-0" />
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Step 2: Select Student Track / Type -->
      {#if appState.onboardingStep === 2}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-blue-950 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-400 mx-auto">
              <MapPin class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Choose Your Student Track</h3>
            <p class="text-xs text-slate-400">Select the type of learning experience that fits your needs.</p>
            {#if selectedCountry}
              <span class="inline-block px-2.5 py-1 text-[9px] font-mono bg-indigo-950 text-indigo-300 rounded-full border border-indigo-800/50">
                {selectedCountry.flag} {selectedCountry.name}
              </span>
            {/if}
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {#each STUDENT_TRACKS as track (track.id)}
              <button
                onclick={() => setStudentTrackType(track.id)}
                class="w-full text-left p-4 rounded-xl border transition {appState.studentTrackType === track.id
                  ? track.id === 'water-student' ? 'bg-blue-600/15 border-blue-500 text-white'
                    : track.id === 'independent-student' ? 'bg-emerald-600/15 border-emerald-500 text-white'
                    : 'bg-amber-600/15 border-amber-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-600'}"
              >
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <span class="text-sm font-bold block">{track.label}</span>
                    <span class="text-[10px] text-slate-400 block">{track.desc}</span>
                  </div>
                  <div class="text-right">
                    <span class="text-lg font-extrabold font-mono block">{trackPricing(track.id, appState.studentBillingCycle === "yearly")}</span>
                    <span class="text-[8px] text-slate-400 capitalize">{appState.studentBillingCycle}</span>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {#each track.features as f, i}
                    <span class="px-1.5 py-0.5 text-[8px] rounded-full border {track.id === appState.studentTrackType
                      ? 'border-current opacity-70' : 'border-slate-700 text-slate-500'}">
                      {f.startsWith("✓") ? f : `✓ ${f}`}
                    </span>
                  {/each}
                </div>
              </button>
            {/each}
          </div>

          {#if appState.studentTrackType}
            <div class="flex items-center justify-center gap-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800 max-w-[220px] mx-auto">
              <button onclick={() => setStudentBillingCycle("monthly")}
                class="px-3 py-1.5 text-[9px] font-bold rounded-lg uppercase tracking-wider transition {appState.studentBillingCycle === 'monthly' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
              >Monthly</button>
              <button onclick={() => setStudentBillingCycle("yearly")}
                class="px-3 py-1.5 text-[9px] font-bold rounded-lg uppercase tracking-wider transition {appState.studentBillingCycle === 'yearly' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
              >Yearly <span class="text-emerald-400 text-[7px]">Save 17%</span></button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 3: Select Program / Curriculum -->
      {#if appState.onboardingStep === 3}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-emerald-950 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mx-auto">
              <Compass class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Select Your Curriculum</h3>
            <p class="text-xs text-slate-400">Choose the educational program that matches your learning path.</p>
            {#if selectedCountry}
              <span class="inline-block px-2.5 py-1 text-[9px] font-mono bg-indigo-950 text-indigo-300 rounded-full border border-indigo-800/50">
                {selectedCountry.flag} {selectedCountry.name}
              </span>
            {/if}
            {#if selectedTrack}
              <span class="inline-block px-2.5 py-1 text-[9px] font-mono bg-blue-950 text-blue-300 rounded-full border border-blue-800/50 ml-1">
                {selectedTrack.label}
              </span>
            {/if}
          </div>

          {#if filteredPrograms.length === 0}
            <div class="text-center py-8 text-xs text-slate-500">
              <Compass class="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p>Please go back and select your country first.</p>
            </div>
          {:else}
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {#each filteredCategories as cat}
                {@const catPrograms = filteredPrograms.filter(p => p.category === cat.key)}
                {#if catPrograms.length > 0}
                  <div class="space-y-1">
                    <h4 class="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-500 px-1 pt-2">{cat.label}</h4>
                    {#each catPrograms as p (p.id)}
                      <button
                        onclick={() => setStudentProgramId(p.id)}
                        class="w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition border {appState.studentProgramId === p.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-white'
                          : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-600'}"
                      >
                        <span class="font-bold block text-[11px]">{p.name}</span>
                        <span class="text-[9px] text-slate-500">{p.description}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 4: Select Grade / Stage -->
      {#if appState.onboardingStep === 4}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-amber-950 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-400 mx-auto">
              <GraduationCap class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Select Your Grade / Level</h3>
            <p class="text-xs text-slate-400">We've localized the grade names to match {selectedCountry?.flag} {selectedCountry?.name}'s education system.</p>
            {#if selectedProgram}
              <span class="inline-block px-2.5 py-1 text-[9px] font-mono bg-emerald-950 text-emerald-300 rounded-full border border-emerald-800/50">
                Curriculum: {selectedProgram.name}
              </span>
            {/if}
            {#if selectedCountry && countryStages.length === 0}
              <p class="text-xs text-amber-400">No grade data for this country. Please go back and select a different country.</p>
            {/if}
          </div>

          {#if countryStages.length > 0}
            <div class="space-y-4 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {#each countryStages as stage}
                {@const stageGrades = countryGradeLevels.filter(g => g.stage === stage.key)}
                {#if stageGrades.length > 0}
                  <div class="space-y-1">
                    <h4 class="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-500 px-1">
                      {stage.label}
                    </h4>
                    <p class="text-[8px] text-slate-600 px-1 -mt-0.5">{stage.description}</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {#each stageGrades as g (g.id)}
                        <button
                          onclick={() => setStudentGradeLevelId(g.id)}
                          class="px-3 py-2.5 rounded-lg text-[11px] font-bold text-center transition border {appState.studentGradeLevelId === g.id
                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                            : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600'}"
                        >
                          {g.name}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="text-center py-8 text-xs text-slate-500">
              <GraduationCap class="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p>Please select your country first to see localized grade options.</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 5: Available Classes (created by the system) -->
      {#if appState.onboardingStep === 5}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-cyan-950 border border-cyan-500/30 rounded-full flex items-center justify-center text-cyan-400 mx-auto">
              <Layers class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Available Classes</h3>
            <p class="text-xs text-slate-400">These classes were created by the system / your school. Pick a track to join — or skip to keep the default curriculum.</p>
          </div>

          {#if appState.isClassesLoading}
            <div class="text-center py-10">
              <RefreshCw class="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p class="text-xs text-slate-400 mt-3">Loading available classes…</p>
            </div>
          {:else if !hasAvailableClasses}
            <div class="text-center py-10 text-xs text-slate-500">
              <Layers class="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p>No system classes have been published yet.</p>
              <p class="text-[10px] text-slate-600 mt-1">You can skip this step — the default curriculum will be used.</p>
            </div>
          {:else}
            <div class="space-y-4 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {#each appState.availableTracks as track (track.id)}
                {@const trackClasses = appState.availableClasses.filter(cl => cl.track_id === track.id)}
                <div class="rounded-2xl border transition {appState.selectedOnboardingTrackId === track.id ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-800 bg-slate-950/50'}">
                  <button
                    onclick={() => setSelectedOnboardingTrackId(appState.selectedOnboardingTrackId === track.id ? '' : track.id)}
                    class="w-full text-left p-4 rounded-2xl transition"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <span class="text-sm font-bold text-white block">{track.name}</span>
                        <span class="text-[10px] text-slate-400">{track.description || 'System track'}{track.institution_name ? ` — by ${track.institution_name}` : ''}</span>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2 py-0.5 text-[9px] font-mono bg-slate-900 text-slate-300 rounded">{track.class_count ?? trackClasses.length} classes</span>
                        {#if appState.selectedOnboardingTrackId === track.id}
                          <Check class="w-4 h-4 text-cyan-400" />
                        {/if}
                      </div>
                    </div>
                  </button>

                  {#if appState.selectedOnboardingTrackId === track.id && trackClasses.length > 0}
                    <div class="px-4 pb-4 space-y-1.5 animate-fade-in">
                      {#each trackClasses as cls (cls.id)}
                        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800">
                          <div>
                            <span class="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                              {#if cls.game_path}<Gamepad2 class="w-3 h-3 text-emerald-400" />{/if}
                              {cls.title}
                            </span>
                            <span class="text-[9px] text-slate-500">{cls.subject} • Grade {cls.grade_level} • {cls.estimated_minutes} min</span>
                          </div>
                          <span class="text-[8px] uppercase font-mono text-emerald-400">Included</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {#if appState.selectedOnboardingTrackId}
              <p class="text-[10px] text-cyan-300 text-center flex items-center justify-center gap-1.5">
                <Sparkles class="w-3 h-3" /> You'll be enrolled in this track's classes when onboarding completes.
              </p>
            {/if}
          {/if}

          <!-- Join a single class by its institution-issued code (always available at this step) -->
          <div class="rounded-2xl border border-emerald-800/50 bg-slate-950/50 p-4 space-y-2">
            <p class="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
              <KeyRound class="w-3.5 h-3.5" /> Have a class code from your school?
            </p>
            <div class="flex gap-2">
              <input
                bind:value={joinCodeInput}
                onkeydown={(e) => { if (e.key === 'Enter') handleJoinByCode(); }}
                placeholder="e.g. WC-7F3K2M"
                class="flex-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-sm text-white font-mono tracking-widest uppercase outline-none focus:border-emerald-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
              />
              <button onclick={handleJoinByCode} disabled={joinCodeBusy || !joinCodeInput.trim()}
                class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center gap-1.5">
                {#if joinCodeBusy}<RefreshCw class="w-3.5 h-3.5 animate-spin" />{:else}<Plus class="w-3.5 h-3.5" /> Join{/if}
              </button>
            </div>
            {#if joinCodeMsg}
              <p class="text-[10px] font-bold {joinCodeOk ? 'text-emerald-300' : 'text-red-400'}">{joinCodeMsg}</p>
            {/if}
            {#if appState.joinedClassTitles.length > 0}
              <p class="text-[10px] text-emerald-300/80">Classes joined this session: {appState.joinedClassTitles.join(', ')}</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Step 6: Enrollment Type -->
      {#if appState.onboardingStep === 6}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-purple-950 border border-purple-500/30 rounded-full flex items-center justify-center text-purple-400 mx-auto">
              <BookOpen class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">How Are You Enrolling?</h3>
            <p class="text-xs text-slate-400">Help us understand your learning setup so we can tailor the experience.</p>
          </div>

          <div class="space-y-3">
            {#each enrollmentOptions as opt}
              <button
                onclick={() => setEnrollmentType(opt.id)}
                class="w-full text-left p-4 rounded-xl border transition {appState.enrollmentType === opt.id
                  ? 'bg-purple-600/15 border-purple-500 text-white'
                  : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-600'}"
              >
                <span class="text-sm font-bold block">
                  {opt.icon} {opt.label}
                </span>
                <span class="text-[10px] text-slate-500">{opt.desc}</span>
              </button>
            {/each}

            {#if appState.enrollmentType === "school"}
              <div class="animate-fade-in space-y-2 pt-2 border-t border-slate-800">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">
                  Enter School Enrollment Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. W-CLASS-2026"
                  value={appState.schoolEnrollCode}
                  oninput={(e) => setSchoolEnrollCode((e.target as HTMLInputElement).value.toUpperCase())}
                  class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 uppercase tracking-widest font-mono"
                />
              </div>
            {/if}

            {#if appState.enrollmentType === "homeschool"}
              <div class="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 text-[10px] text-slate-400 space-y-1">
                <p>🏡 <strong class="text-slate-200">Homeschool Settings</strong></p>
                <p>Dashboard configured for parent-guided learning with progress tracking and customizable lesson plans.</p>
              </div>
            {/if}

            {#if appState.enrollmentType === "independent"}
              <div class="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 text-[10px] text-slate-400 space-y-1">
                <p>🎓 <strong class="text-slate-200">Independent Study Mode</strong></p>
                <p>Full autonomy over your learning path with access to all curriculums, AI tutoring, and self-paced assessments.</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Step 7: Review & Complete + Payment Redirect -->
      {#if appState.onboardingStep === 7}
        <div transition:fly={{ x: 20 }} class="space-y-5 animate-fade-in">
          <div class="text-center space-y-2">
            <div class="w-14 h-14 bg-emerald-950 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mx-auto">
              <ShieldCheck class="w-7 h-7" />
            </div>
            <h3 class="text-2xl font-extrabold text-white">Review & Activate</h3>
            <p class="text-xs text-slate-400">Confirm your selections below, then proceed to secure checkout via Stripe.</p>
          </div>

          <div class="frosted-glass-dark p-5 rounded-2xl border border-blue-900/30 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Country</span>
              <span class="text-xs text-white font-bold text-right">{selectedCountry?.flag} {selectedCountry?.name || "Not selected"}</span>
            </div>
            <div class="border-t border-blue-900/20"></div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Student Track</span>
              <span class="text-xs text-white font-bold text-right">{selectedTrack?.label || "Not selected"}</span>
            </div>
            <div class="border-t border-blue-900/20"></div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Curriculum</span>
              <span class="text-xs text-white font-bold text-right">{selectedProgram?.name || "Not selected"}</span>
            </div>
            <div class="border-t border-blue-900/20"></div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Grade / Level</span>
              <span class="text-xs text-white font-bold text-right">
                {selectedGrade?.name || "Not selected"}
                {#if selectedStage}
                  <span class="text-slate-400 text-[9px] block">({selectedStage.label})</span>
                {/if}
              </span>
            </div>
            <div class="border-t border-blue-900/20"></div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Enrollment</span>
              <span class="text-xs text-white font-bold text-right capitalize">
                {appState.enrollmentType === "independent" ? "Independent Student"
                  : appState.enrollmentType === "homeschool" ? "Homeschooled"
                  : appState.enrollmentType === "school" ? `School (Code: ${appState.schoolEnrollCode})`
                  : "Not specified"}
              </span>
            </div>
            <div class="border-t border-blue-900/20"></div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] uppercase font-mono text-slate-500 font-bold">Billing</span>
              <span class="text-xs text-white font-bold text-right capitalize">{appState.studentBillingCycle}</span>
            </div>
            <div class="border-t border-blue-900/20 pt-2 mt-1"></div>
            <div class="flex justify-between items-center">
              <span class="text-sm font-bold text-slate-200">Total</span>
              <span class="text-emerald-400 font-bold font-mono text-lg">
                {trackPricing(appState.studentTrackType ?? "", appState.studentBillingCycle === "yearly")}
              </span>
            </div>
          </div>

          <div class="bg-blue-950/20 border border-blue-500/20 p-4 rounded-xl text-[10px] text-slate-300 space-y-2">
            <p class="font-bold text-blue-300 text-[11px]">🔒 You're almost there!</p>
            <p>
              After confirming, you'll be redirected to Stripe's secure checkout to activate your {selectedTrack?.label || "account"}.
              Your profile selections will be saved. Cancel anytime.
            </p>
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="flex justify-between items-center pt-2 border-t border-slate-800">
        {#if appState.onboardingStep > 1}
          <button onclick={handleOnboardingBack}
            class="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold transition flex items-center gap-1.5">
            <ArrowLeft class="w-3.5 h-3.5" /> Back
          </button>
        {:else}
          <div></div>
        {/if}

        {#if appState.onboardingStep < totalSteps}
          <button
            onclick={handleOnboardingNext}
            disabled={(appState.onboardingStep === 1 && !appState.studentCountry)
              || (appState.onboardingStep === 2 && !appState.studentTrackType)
              || (appState.onboardingStep === 3 && !appState.studentProgramId)
              || (appState.onboardingStep === 4 && !appState.studentGradeLevelId)
              || (appState.onboardingStep === 6 && !appState.enrollmentType)}
            class="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight class="w-3.5 h-3.5" />
          </button>
        {:else}
          <button
            onclick={handleConfirmAndPay}
            disabled={!appState.studentCountry || !appState.studentTrackType || !appState.studentProgramId || !appState.studentGradeLevelId || !appState.enrollmentType}
            class="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm & Pay <ChevronRight class="w-3.5 h-3.5" />
          </button>
        {/if}
      </div>

      <p class="text-[9px] text-slate-600 text-center font-mono">
        Step {appState.onboardingStep} of {totalSteps}
      </p>
    </div>
  </div>
{/if}
