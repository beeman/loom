import { spawnSync } from 'node:child_process'
import type { Octokit } from '@octokit/rest'
import { getClient } from './client.ts'
import type { CloneRepoOptions, CreateBranchOptions, GitHubRepo } from './types.ts'

export async function getRepo(owner: string, repo: string, client?: Octokit): Promise<GitHubRepo> {
  const octokit = client ?? getClient()
  const response = await octokit.repos.get({ owner, repo })
  const data = response.data

  return {
    cloneUrl: data.clone_url,
    defaultBranch: data.default_branch,
    fullName: data.full_name,
    name: data.name,
    owner: data.owner.login,
    sshUrl: data.ssh_url,
  }
}

export async function createBranch(options: CreateBranchOptions, client?: Octokit): Promise<string> {
  const octokit = client ?? getClient()
  const { owner, repo, branch, fromBranch } = options

  // Get the SHA of the source branch
  const repoInfo = await getRepo(owner, repo, octokit)
  const sourceBranch = fromBranch ?? repoInfo.defaultBranch

  const refResponse = await octokit.git.getRef({
    owner,
    ref: `heads/${sourceBranch}`,
    repo,
  })

  const sha = refResponse.data.object.sha

  // Create the new branch
  await octokit.git.createRef({
    owner,
    ref: `refs/heads/${branch}`,
    repo,
    sha,
  })

  return sha
}

export function cloneRepo(options: CloneRepoOptions): void {
  const { cloneUrl, targetDir, branch } = options

  const args = ['clone', '--depth', '1']
  if (branch) {
    args.push('--branch', branch)
  }
  args.push(cloneUrl, targetDir)

  const result = spawnSync('git', args, { stdio: 'inherit' })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`git clone exited with code ${result.status ?? 'unknown'}`)
  }
}

export function checkoutBranch(repoDir: string, branch: string, create = false): void {
  const args = ['checkout']
  if (create) args.push('-b')
  args.push(branch)

  const result = spawnSync('git', args, { cwd: repoDir, stdio: 'inherit' })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`git checkout exited with code ${result.status ?? 'unknown'}`)
  }
}

export function commitAndPush(repoDir: string, message: string, branch: string): void {
  const commands: [string, string[]][] = [
    ['git', ['add', '-A']],
    ['git', ['commit', '-m', message]],
    ['git', ['push', 'origin', branch]],
  ]

  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { cwd: repoDir, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`)
    }
  }
}
