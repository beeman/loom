import type { Octokit } from '@octokit/rest'
import { getClient } from './client.ts'
import type { CreatePullRequestOptions, GitHubPullRequest } from './types.ts'

function mapPR(raw: {
  id: number
  number: number
  title: string
  body?: string | null
  state: string
  url: string
  html_url: string
  head: { ref: string }
  base: { ref: string }
  created_at: string
  updated_at: string
  merged_at?: string | null
}): GitHubPullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open'
  if (raw.merged_at) state = 'merged'
  else if (raw.state === 'closed') state = 'closed'

  return {
    baseBranch: raw.base.ref,
    body: raw.body ?? null,
    createdAt: raw.created_at,
    headBranch: raw.head.ref,
    htmlUrl: raw.html_url,
    id: raw.id,
    number: raw.number,
    state,
    title: raw.title,
    updatedAt: raw.updated_at,
    url: raw.url,
  }
}

export async function createPullRequest(
  options: CreatePullRequestOptions,
  client?: Octokit,
): Promise<GitHubPullRequest> {
  const octokit = client ?? getClient()
  const { owner, repo, title, body, head, base } = options

  const response = await octokit.pulls.create({
    base,
    body,
    head,
    owner,
    repo,
    title,
  })

  return mapPR(response.data)
}

export async function addPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  client?: Octokit,
): Promise<void> {
  const octokit = client ?? getClient()
  await octokit.issues.createComment({ body, issue_number: prNumber, owner, repo })
}

export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  client?: Octokit,
): Promise<GitHubPullRequest> {
  const octokit = client ?? getClient()
  const response = await octokit.pulls.get({ owner, pull_number: prNumber, repo })
  return mapPR(response.data)
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
  client?: Octokit,
): Promise<GitHubPullRequest[]> {
  const octokit = client ?? getClient()
  const response = await octokit.pulls.list({ owner, per_page: 100, repo, state })
  return response.data.map(mapPR)
}
