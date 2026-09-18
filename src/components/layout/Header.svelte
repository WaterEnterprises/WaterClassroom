<script lang="ts">
  import { appState, setActiveTab, setIsLoggedIn, navigateTo } from '../../lib/store.svelte';
  import { Flame, TrendingUp, Award, Lock, User } from 'lucide-svelte';
  import { slide, fade } from 'svelte/transition';
</script>

<header transition:slide={{ duration: 200 }} class="sticky top-0 z-30 w-full bg-[#060b18]/80 backdrop-blur-md border-b border-blue-950/50 text-white shadow-lg pt-[max(env(safe-area-inset-top),8px)] sm:pt-0">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[22px] pb-[12px] flex flex-col sm:flex-row justify-between items-center gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-slate-900 border border-blue-500/35 flex items-center justify-center shadow-inner relative overflow-hidden">
        <img src="/icon.png" alt="W" class="w-8 h-8 rounded absolute z-10" onerror={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
        <span class="text-blue-400 font-extrabold text-xl tracking-tighter drop-shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse relative z-0">W</span>
        <div class="absolute inset-0 bg-blue-500/10 animate-pulse"></div>
      </div>
      <div>
        <h1 class="font-extrabold text-lg tracking-tight flex items-center gap-1.5 uppercase leading-none">
          WATER CLASSROOM
          <span class="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/20 shadow-inner">
            {appState.isLoggedIn ? "Classroom Panel" : "Login Access"}
          </span>
        </h1>
        <p class="text-[11px] text-blue-300 font-light tracking-wide mt-0.5">A Complete AI-Powered Educational Ecosystem</p>
      </div>
    </div>

    <div class="flex items-center gap-4 flex-col sm:flex-row w-full sm:w-auto justify-end">
      {#if appState.isLoggedIn}
        {#if appState.landingAuthRole !== 'institution'}
          <div transition:fade={{ duration: 200 }} class="flex items-center gap-3 bg-[#0a162f]/80 px-4 py-1.5 rounded-full border border-blue-400/25 shadow-inner">
            <div class="flex items-center gap-1">
              <Flame class="w-4 h-4 text-amber-500 fill-amber-400 animate-bounce" />
              <span class="text-xs font-bold text-amber-200">{appState.progress.streakDays} Day Streak</span>
            </div>
            <div class="h-4 w-px bg-blue-500/30"></div>
            <div class="flex items-center gap-1">
              <TrendingUp class="w-4 h-4 text-emerald-400" />
              <span class="text-xs font-bold text-emerald-300">{appState.progress.points} Points</span>
            </div>
            <div class="h-4 w-px bg-blue-500/30"></div>
            <div class="flex items-center gap-1">
              <Award class="w-4 h-4 text-cyan-400" />
              <span class="text-xs font-bold text-cyan-300">Lvl {appState.progress.level}</span>
            </div>
          </div>
        {/if}
        <div transition:fade={{ duration: 200 }} class="flex items-center gap-3">
          <button onclick={() => navigateTo('profile')} class="flex items-center gap-2 bg-[#111c35]/50 border border-blue-900/30 rounded-xl px-3 py-1.5 hover:border-blue-500/50 transition cursor-pointer">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-extrabold">
              {appState.studentName.charAt(0).toUpperCase()}
            </div>
            <span class="text-xs font-bold text-slate-100 hidden sm:block">{appState.studentName}</span>
          </button>
          <button onclick={() => { setIsLoggedIn(false); setActiveTab("dashboard"); }}
            class="p-1.5 px-2.5 rounded-lg bg-red-950/50 hover:bg-red-900/60 text-red-300 text-[10px] uppercase font-mono tracking-wider font-bold transition border border-red-500/20">Exit</button>
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <a href="#auth-section"
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-[11px] uppercase tracking-widest flex items-center gap-2 transition-all duration-300 active:scale-95 shadow-lg shadow-blue-500/20 border border-blue-400/20 no-underline">
            <Lock class="w-4 h-4 text-white" /> Secure Login
          </a>
        </div>
      {/if}
    </div>
  </div>
</header>
