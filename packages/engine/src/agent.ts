import { spawnSync } from 'node:child_process'
import type { AgentRunInput, AgentRunResult } from './types.ts'

function buildPrompt(issueTitle: string, issueBody: string | null, branch: string): string {
  return [
    `You are working on a GitHub issue. Your task is to implement the changes described below.`,
    ``,
    `Issue: ${issueTitle}`,
    issueBody ? `\nDescription:\n${issueBody}` : '',
    ``,
    `You are working on branch: ${branch}`,
    ``,
    `Please implement the changes, commit them, and push the branch.`,
    `When done, output a summary of what you changed.`,
  ]
    .join('\n')
    .trim()
}

function buildArgs(input: AgentRunInput): string[] {
  const { config, issueTitle, issueBody, branch } = input
  const prompt = buildPrompt(issueTitle, issueBody, branch)
  const args: string[] = []

  if (config.provider === 'claude') {
    // claude CLI: `claude -p "<prompt>"`
    args.push('-p', prompt)
    if (config.model) {
      args.push('--model', config.model)
    }
  } else {
    // custom — pass prompt as first positional arg
    args.push(prompt)
  }

  if (config.extraArgs && config.extraArgs.length > 0) {
    args.push(...config.extraArgs)
  }

  return args
}

export function runAgent(input: AgentRunInput): AgentRunResult {
  const { config, repoDir } = input
  const binary = config.binary ?? config.provider
  const args = buildArgs(input)
  const timeoutMs = config.timeoutMs ?? 30 * 60 * 1000

  console.log(`[agent] Running ${binary} in ${repoDir}`)
  console.log(`[agent] Args: ${args.slice(0, 2).join(' ')}...`)

  const result = spawnSync(binary, args, {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10 MB
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: timeoutMs,
  })

  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const output = [stdout, stderr].filter(Boolean).join('\n')

  if (result.error) {
    return {
      error: result.error.message,
      exitCode: null,
      output,
      success: false,
    }
  }

  const exitCode = result.status ?? null
  const success = exitCode === 0

  if (!success) {
    console.error(`[agent] Failed with exit code ${exitCode ?? 'null'}`)
    if (stderr) console.error(`[agent] stderr: ${stderr.slice(0, 500)}`)
  } else {
    console.log(`[agent] Completed successfully`)
    if (stdout) console.log(`[agent] output: ${stdout.slice(0, 200)}`)
  }

  return {
    error: success ? undefined : stderr || `Exit code ${exitCode ?? 'null'}`,
    exitCode,
    output,
    success,
  }
}
