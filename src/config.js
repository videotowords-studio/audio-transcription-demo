import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

export function getReplicateApiToken(env = process.env) {
  return (env.REPLICATE_API_TOKEN || '').trim()
}
