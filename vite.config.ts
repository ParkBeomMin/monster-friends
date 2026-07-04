/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './', // portal upload needs relative asset paths
  test: {
    environment: 'node', // engine tests are pure logic, no DOM needed
  },
})
