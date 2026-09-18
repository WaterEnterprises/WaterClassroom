<script lang="ts">
  import { appState, fetchDMConversations, fetchDMDirectory, openDMConversation, closeDMConversation, handleSendDM } from '../lib/store.svelte';
  import { MessageSquare, Send, Plus, X, RefreshCw, Search, GraduationCap, Building, User } from 'lucide-svelte';
  import { fade } from 'svelte/transition';

  let search = $state("");
  let showCompose = $state(false);

  const filteredConversations = $derived(
    search.trim()
      ? appState.dmConversations.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
      : appState.dmConversations
  );
  const filteredDirectory = $derived(
    search.trim()
      ? appState.dmDirectory.filter(u =>
          u.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          (u.email || '').toLowerCase().includes(search.trim().toLowerCase()))
      : appState.dmDirectory
  );

  function roleBadge(type: string): string {
    if (type === 'Institution') return '🏛️ School';
    if (type === 'Tutor') return '🎓 Tutor';
    return '👤';
  }

  $effect(() => {
    if (appState.isLoggedIn) {
      fetchDMConversations();
      fetchDMDirectory();
      // Keep unread counts + threads fresh while logged in.
      const timer = setInterval(() => {
        if (appState.isLoggedIn) fetchDMConversations();
      }, 20000);
      return () => clearInterval(timer);
    }
  });

  function startNewMessage(userId: string) {
    appState.dmRecipientId = userId;
    appState.dmOther = null;
    appState.dmMessages = [];
    showCompose = false;
  }

  function timeOf(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }
</script>

<div transition:fade={{ duration: 300 }} class="space-y-6 animate-fade-in text-white">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
        <MessageSquare class="w-5 h-5 text-blue-400" />
      </div>
      <div>
        <h1 class="text-xl font-extrabold text-white tracking-tight">Messages</h1>
        <p class="text-[11px] text-slate-400">Direct messages with students, tutors, and your school.</p>
      </div>
    </div>
    <div class="flex gap-2">
      <button onclick={() => { showCompose = !showCompose; }} class="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider transition">
        {#if showCompose}<X class="w-3.5 h-3.5" /> Cancel{:else}<Plus class="w-3.5 h-3.5" /> New Message{/if}
      </button>
      <button onclick={() => fetchDMConversations()} class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition" title="Refresh">
        <RefreshCw class="w-4 h-4" />
      </button>
    </div>
  </div>

  {#if showCompose}
    <div class="frosted-glass rounded-2xl p-4 border border-blue-900/30 space-y-3 animate-fade-in">
      <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">To (people in your school)</label>
      {#if filteredDirectory.length === 0}
        <p class="text-[11px] text-slate-600">Nobody to message yet — people in your school will appear here.</p>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {#each filteredDirectory as u (u.id)}
            <button onclick={() => startNewMessage(u.id)}
              class="text-left px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-blue-600 transition">
              <span class="text-xs font-bold text-slate-200 block">{roleBadge(u.type)} {u.name}</span>
              <span class="text-[9px] text-slate-500 font-mono">{u.type}{u.email ? ` • ${u.email}` : ''}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
    <!-- Left: conversations -->
    <div class="lg:col-span-1 space-y-3">
      <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800">
        <Search class="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <input type="text" placeholder="Search conversations…" bind:value={search}
          class="flex-1 bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none" />
      </div>
      {#if filteredConversations.length === 0}
        <div class="frosted-glass-dark rounded-2xl p-8 text-center border border-dashed border-slate-700">
          <MessageSquare class="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p class="text-xs text-slate-500">No conversations yet.<br />Start one with New Message above.</p>
        </div>
      {:else}
        <div class="space-y-1.5">
          {#each filteredConversations as c (c.user_id)}
            {@const isOpen = appState.dmOther?.id === c.user_id}
            <button onclick={() => openDMConversation(c.user_id, c.name)}
              class="w-full text-left p-3 rounded-xl transition border {isOpen ? 'bg-blue-600/15 border-blue-500' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'}">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold text-white truncate">{roleBadge(c.type)} {c.name}</span>
                <span class="flex items-center gap-1.5 shrink-0">
                  {#if c.unread > 0}<span class="min-w-5 h-5 px-1 rounded-full bg-blue-600 text-white text-[9px] font-extrabold flex items-center justify-center">{c.unread}</span>{/if}
                  <span class="text-[9px] font-mono text-slate-500">{timeOf(c.last_at)}</span>
                </span>
              </div>
              <p class="text-[10px] text-slate-500 truncate mt-0.5">{c.last_from_me ? 'You: ' : ''}{c.last_content}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right: thread -->
    <div class="lg:col-span-2">
      {#if !appState.dmOther && !appState.dmRecipientId}
        <div class="frosted-glass rounded-3xl p-12 text-center space-y-4">
          <MessageSquare class="w-10 h-10 text-slate-700 mx-auto" />
          <p class="text-sm font-bold text-white">No conversation selected</p>
          <p class="text-xs text-slate-500">Pick a conversation on the left, or start a new message.</p>
        </div>
      {:else}
        <div class="frosted-glass rounded-3xl border border-blue-950 overflow-hidden flex flex-col h-[60vh]">
          <div class="bg-[#050b18]/80 px-4 py-3 border-b border-blue-950 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              {#if appState.dmOther?.type === 'Institution'}
                <Building class="w-4 h-4 text-indigo-400 shrink-0" />
              {:else if appState.dmOther?.type === 'Tutor'}
                <GraduationCap class="w-4 h-4 text-amber-400 shrink-0" />
              {:else}
                <User class="w-4 h-4 text-blue-400 shrink-0" />
              {/if}
              <div class="min-w-0">
                <h3 class="font-bold text-white text-sm truncate">
                  {#if appState.dmOther}
                    {appState.dmOther.name}
                  {:else}
                    {appState.dmDirectory.find(u => u.id === appState.dmRecipientId)?.name || 'New message'}
                  {/if}
                </h3>
                {#if appState.dmOther}<p class="text-[9px] text-slate-500 font-mono">{appState.dmOther.type || 'Member'}</p>{/if}
              </div>
            </div>
            <button onclick={closeDMConversation} class="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition" title="Close"><X class="w-4 h-4" /></button>
          </div>
          <div class="flex-grow overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
            {#if appState.isDMsLoading}
              <p class="text-center text-[11px] text-slate-500 py-6">Loading messages…</p>
            {:else if appState.dmMessages.length === 0}
              <p class="text-center text-[11px] text-slate-600 py-6">No messages yet — say hello below.</p>
            {:else}
              {#each appState.dmMessages as m (m.id)}
                {@const fromMe = appState.dmOther ? m.sender_id !== appState.dmOther.id : true}
                <div class="flex {fromMe ? 'justify-end' : 'justify-start'}">
                  <div class="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed {fromMe ? 'bg-blue-600 text-white' : 'bg-slate-950/85 border border-slate-800 text-slate-200'}">
                    <p class="whitespace-pre-wrap">{m.content}</p>
                    <span class="block text-[8px] font-mono opacity-60 mt-1 text-right">{timeOf(m.created_at)}</span>
                  </div>
                </div>
              {/each}
            {/if}
            {#if appState.dmError}<p class="text-[10px] text-red-400 font-bold text-center">{appState.dmError}</p>{/if}
          </div>
          <div class="p-3 bg-[#050b18]/80 border-t border-blue-950/70 shrink-0">
            <div class="flex gap-2">
              <input type="text" placeholder="Write a message…" maxlength={2000}
                value={appState.dmInput} oninput={(e) => appState.dmInput = (e.target as HTMLInputElement).value}
                onkeydown={(e) => { if (e.key === 'Enter') handleSendDM(); }}
                class="flex-grow rounded-xl bg-slate-900 border border-slate-700/60 px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <button onclick={handleSendDM} disabled={appState.isDMSending || !appState.dmInput.trim()}
                class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold transition-all flex items-center justify-center">
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
