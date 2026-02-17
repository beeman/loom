export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  url: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description: string | null
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed' | 'merged'
  url: string
  htmlUrl: string
  headBranch: string
  baseBranch: string
  createdAt: string
  updatedAt: string
}

export interface GitHubRepo {
  owner: string
  name: string
  fullName: string
  cloneUrl: string
  sshUrl: string
  defaultBranch: string
}

export interface CreatePullRequestOptions {
  owner: string
  repo: string
  title: string
  body: string
  head: string
  base: string
  issueNumber?: number | undefined
}

export interface CreateBranchOptions {
  owner: string
  repo: string
  branch: string
  fromBranch?: string | undefined
}

export interface CloneRepoOptions {
  cloneUrl: string
  targetDir: string
  branch?: string | undefined
}

export interface ListIssuesOptions {
  owner: string
  repo: string
  label: string
  state?: 'open' | 'closed' | 'all'
}
