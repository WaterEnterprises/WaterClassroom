import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.waterclassroom.app",
  appName: "Water Classroom",
  webDir: "dist",
  backgroundColor: "#051329",
  android: {
    // Edge-to-edge: content draws behind system bars; the app pads itself
    // with safe-area insets + the StatusBar plugin (transparent bars).
    backgroundColor: "#051329",
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: "#051329",
    // Edge-to-edge on iOS comes from viewport-fit=cover + safe-area CSS.
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },
  },
};

export default config;
