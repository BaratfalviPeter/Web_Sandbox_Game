import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `base` is set to the repository name so asset URLs resolve correctly
// when served from https://<user>.github.io/Web_Sandbox_Game/
export default defineConfig({
  base: '/Web_Sandbox_Game/',
  plugins: [react()],
})
