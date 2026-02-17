import type { AgentProvider, EngineConfig, RepoWatchConfig } from './types.ts'

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function parseRepoList(raw: string): RepoWatchConfig[] {
  // Format: "owner/repo:label,owner2/repo2:label2" or "owner/repo" (uses default label)
  return raw.split(',').map((entry) => {
    const [repoPath, label] = entry.trim().split(':')
    const parts = (repoPath ?? '').split('/')
    const owner = parts[0] ?? ''
    const repo = parts[1] ?? ''
    if (!owner || !repo) throw new Error(`Invalid repo entry: ${entry}`)
    return { label: label ?? 'loom', owner, repo }
  })
}

export function loadConfig(): EngineConfig {
  const githubToken = getRequiredEnv('GITHUB_TOKEN')
  const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? '60000')
  const workDir = process.env['WORK_DIR'] ?? '/tmp/loom-agent'

  const reposRaw = process.env['WATCH_REPOS']
  if (!reposRaw) throw new Error('Missing required environment variable: WATCH_REPOS (e.g. owner/repo:loom)')

  const repos = parseRepoList(reposRaw)
  const provider = (process.env['AGENT_PROVIDER'] ?? 'claude') as AgentProvider

  const agentBinaries: Record<AgentProvider, string> = {
    claude: 'claude',
    custom: process.env['AGENT_BINARY'] ?? 'claude',
  }

  return {
    agent: {
      binary: process.env['AGENT_BINARY'] ?? agentBinaries[provider],
      extraArgs: process.env['AGENT_EXTRA_ARGS']?.split(' ').filter(Boolean) ?? [],
      model: process.env['AGENT_MODEL'],
      provider,
      timeoutMs: Number(process.env['AGENT_TIMEOUT_MS'] ?? String(30 * 60 * 1000)),
    },
    githubToken,
    pollIntervalMs,
    repos,
    workDir,
  }
}
