import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.janadesh.app',
  appName: 'Janadesh',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
