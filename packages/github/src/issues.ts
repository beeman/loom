import type { Octokit } from '@octokit/rest'
import { getClient } from './client.ts'
import type { GitHubIssue, ListIssuesOptions } from './types.ts'

function mapIssue(raw: {
  id: number
  number: number
  title: string
  body?: string | null
  state: string
  labels: Array<
    | string
    | {
        id?: number
        name?: string
        color?: string | null
        description?: string | null
      }
  >
  url: string
  html_url: string
  created_at: string
  updated_at: string
}): GitHubIssue {
  return {
    body: raw.body ?? null,
    createdAt: raw.created_at,
    htmlUrl: raw.html_url,
    id: raw.id,
    labels: raw.labels.map((l) => {
      if (typeof l === 'string') return { color: '', description: null, id: 0, name: l }
      return {
        color: l.color ?? '',
        description: l.description ?? null,
        id: l.id ?? 0,
        name: l.name ?? '',
      }
    }),
    number: raw.number,
    state: raw.state === 'open' ? 'open' : 'closed',
    title: raw.title,
    updatedAt: raw.updated_at,
    url: raw.url,
  }
}

export async function listIssues(options: ListIssuesOptions, client?: Octokit): Promise<GitHubIssue[]> {
  const octokit = client ?? getClient()
  const { owner, repo, label, state = 'open' } = options

  const response = await octokit.issues.listForRepo({
    labels: label,
    owner,
    per_page: 100,
    repo,
    state,
  })

  return response.data.map(mapIssue)
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  client?: Octokit,
): Promise<GitHubIssue> {
  const octokit = client ?? getClient()
  const response = await octokit.issues.get({ issue_number: issueNumber, owner, repo })
  return mapIssue(response.data)
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  client?: Octokit,
): Promise<void> {
  const octokit = client ?? getClient()
  await octokit.issues.createComment({ body, issue_number: issueNumber, owner, repo })
}

export async function addIssueLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
  client?: Octokit,
): Promise<void> {
  const octokit = client ?? getClient()
  await octokit.issues.addLabels({ issue_number: issueNumber, labels: [label], owner, repo })
}
