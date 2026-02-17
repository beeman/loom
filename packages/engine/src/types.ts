export type AgentProvider = 'claude' | 'custom'

export interface AgentConfig {
  provider: AgentProvider
  model?: string | undefined
  /** Path or name of the CLI binary to invoke */
  binary?: string | undefined
  /** Extra flags passed to the CLI */
  extraArgs?: string[] | undefined
  /** Working directory for the agent process */
  cwd?: string | undefined
  /** Timeout in milliseconds (default: 30 minutes) */
  timeoutMs?: number | undefined
}

export interface AgentRunInput {
  taskId: number
  issueTitle: string
  issueBody: string | null
  repoDir: string
  branch: string
  config: AgentConfig
}

export interface AgentRunResult {
  success: boolean
  output: string
  error?: string | undefined
  exitCode: number | null
}

export interface RepoWatchConfig {
  owner: string
  repo: string
  label: string
  baseBranch?: string | undefined
}

export interface EngineConfig {
  githubToken: string
  pollIntervalMs: number
  repos: RepoWatchConfig[]
  agent: AgentConfig
  workDir: string
}
