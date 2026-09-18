// CSS is built separately by Tailwind CLI in build.ts
import App from './App.svelte';
import { mount } from 'svelte';
import { Capacitor } from '@capacitor/core';

const app = mount(App, {
  target: document.getElementById('root')!,
});

// Edge-to-edge on native: transparent status bar over the app background
// (web builds skip this entirely).
if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {});
  }).catch(() => {});
}

export default app;
