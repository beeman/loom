import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type * as schema from '@workspace/db/schema'
import type { Repo } from '@workspace/db/schema'
import { agentRuns, repos, tasks } from '@workspace/db/schema'
import { createClient } from '@workspace/github/client'
import { addIssueComment, addIssueLabel, listIssues } from '@workspace/github/issues'
import { createPullRequest } from '@workspace/github/pulls'
import { checkoutBranch, cloneRepo, commitAndPush, createBranch } from '@workspace/github/repos'
import type { GitHubIssue } from '@workspace/github/types'
import { eq } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { runAgent } from './agent.ts'
import type { EngineConfig, RepoWatchConfig } from './types.ts'

type GitHubClient = ReturnType<typeof createClient>

function requireFirst<T>(rows: T[], context: string): T {
  const row = rows[0]
  if (!row) throw new Error(`Expected at least one row: ${context}`)
  return row
}

export class Orchestrator {
  private running = false
  private readonly db: BunSQLiteDatabase<typeof schema>
  private readonly config: EngineConfig

  constructor(db: BunSQLiteDatabase<typeof schema>, config: EngineConfig) {
    this.db = db
    this.config = config
  }

  start(): void {
    if (this.running) return
    this.running = true
    console.log(`[orchestrator] Starting. Poll interval: ${this.config.pollIntervalMs}ms`)
    void this.loop()
  }

  stop(): void {
    this.running = false
    console.log('[orchestrator] Stopped.')
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.poll()
      } catch (err) {
        console.error('[orchestrator] Poll error:', err)
      }
      await sleep(this.config.pollIntervalMs)
    }
  }

  private async poll(): Promise<void> {
    const client = createClient(this.config.githubToken)
    console.log(`[orchestrator] Polling ${this.config.repos.length} repo(s)...`)

    for (const repoConfig of this.config.repos) {
      try {
        await this.processRepo(repoConfig, client)
      } catch (err) {
        console.error(`[orchestrator] Error processing ${repoConfig.owner}/${repoConfig.repo}:`, err)
      }
    }
  }

  private async processRepo(repoConfig: RepoWatchConfig, client: GitHubClient): Promise<void> {
    const { owner, repo, label } = repoConfig

    const repoRecord = this.upsertRepo(repoConfig)

    const issues = await listIssues({ label, owner, repo, state: 'open' }, client)
    console.log(`[orchestrator] ${owner}/${repo}: ${issues.length} issue(s) with label "${label}"`)

    for (const issue of issues) {
      await this.handleIssue(issue, repoRecord, repoConfig, client)
    }
  }

  private async handleIssue(
    issue: GitHubIssue,
    repoRecord: Repo,
    repoConfig: RepoWatchConfig,
    client: GitHubClient,
  ): Promise<void> {
    const { owner, repo } = repoConfig

    const existing = this.db.select().from(tasks).where(eq(tasks.githubIssueId, issue.number)).limit(1).all()

    const existingTask = existing[0]
    if (existingTask) {
      if (existingTask.status === 'in_progress' || existingTask.status === 'completed') {
        console.log(
          `[orchestrator] Issue #${issue.number} already has task ${existingTask.id} (${existingTask.status}), skipping`,
        )
        return
      }
    }

    let taskId: number
    if (existingTask?.status === 'failed') {
      taskId = existingTask.id
      this.db.update(tasks).set({ repoId: repoRecord.id, status: 'in_progress' }).where(eq(tasks.id, taskId)).run()
      console.log(`[orchestrator] Retrying failed task ${taskId} for issue #${issue.number}`)
    } else {
      const inserted = this.db
        .insert(tasks)
        .values({
          description: issue.body ?? undefined,
          githubIssueId: issue.number,
          repoId: repoRecord.id,
          status: 'in_progress',
          title: issue.title,
        })
        .returning({ id: tasks.id })
        .all()
      const row = requireFirst(inserted, 'insert task')
      taskId = row.id
      console.log(`[orchestrator] Created task ${taskId} for issue #${issue.number}: "${issue.title}"`)
    }

    try {
      await addIssueLabel(owner, repo, issue.number, 'loom:working', client)
    } catch {
      // Label may not exist — non-fatal
    }
    try {
      await addIssueComment(
        owner,
        repo,
        issue.number,
        `🤖 Loom is working on this issue (task #${taskId}). I'll open a PR when done.`,
        client,
      )
    } catch {
      // Non-fatal
    }

    await this.runAgentForTask(taskId, issue, repoConfig, client)
  }

  private async runAgentForTask(
    taskId: number,
    issue: GitHubIssue,
    repoConfig: RepoWatchConfig,
    client: GitHubClient,
  ): Promise<void> {
    const runId = this.createAgentRun(taskId)

    try {
      const { repoDir, branch } = this.prepareWorkDir(repoConfig, issue)
      await this.prepareBranch(repoConfig, branch, repoDir, client)

      const result = this.executeAgent(issue, repoDir, branch, taskId)
      await this.submitPullRequest(result, issue, repoConfig, branch, taskId, runId, client)
    } catch (err) {
      this.recordFailure(taskId, runId, err, issue, repoConfig, client)
    }
  }

  private createAgentRun(taskId: number): number {
    const inserted = this.db
      .insert(agentRuns)
      .values({
        model: this.config.agent.model ?? null,
        provider: this.config.agent.provider,
        status: 'running',
        taskId,
      })
      .returning({ id: agentRuns.id })
      .all()
    return requireFirst(inserted, 'insert agentRun').id
  }

  private prepareWorkDir(repoConfig: RepoWatchConfig, issue: GitHubIssue): { branch: string; repoDir: string } {
    const { owner, repo } = repoConfig
    const branch = `loom/issue-${issue.number}`
    const repoDir = join(this.config.workDir, `${owner}-${repo}-${issue.number}`)

    mkdirSync(this.config.workDir, { recursive: true })
    const cloneUrl = `https://${this.config.githubToken}@github.com/${owner}/${repo}.git`
    cloneRepo({ cloneUrl, targetDir: repoDir })

    return { branch, repoDir }
  }

  private async prepareBranch(
    repoConfig: RepoWatchConfig,
    branch: string,
    repoDir: string,
    client: GitHubClient,
  ): Promise<void> {
    const { owner, repo } = repoConfig
    try {
      await createBranch({ branch, fromBranch: repoConfig.baseBranch, owner, repo }, client)
    } catch {
      // Branch may already exist
    }
    checkoutBranch(repoDir, branch, true)
  }

  private executeAgent(
    issue: GitHubIssue,
    repoDir: string,
    branch: string,
    taskId: number,
  ): { output: string; success: true } {
    const result = runAgent({
      branch,
      config: this.config.agent,
      issueBody: issue.body,
      issueTitle: issue.title,
      repoDir,
      taskId,
    })

    if (!result.success) {
      throw new Error(result.error ?? `Agent exited with code ${result.exitCode ?? 'null'}`)
    }

    return result as { output: string; success: true }
  }

  private async submitPullRequest(
    result: { output: string },
    issue: GitHubIssue,
    repoConfig: RepoWatchConfig,
    branch: string,
    taskId: number,
    runId: number,
    client: GitHubClient,
  ): Promise<void> {
    const { owner, repo } = repoConfig
    const repoDir = join(this.config.workDir, `${owner}-${repo}-${issue.number}`)

    commitAndPush(repoDir, `fix: resolve issue #${issue.number} via loom\n\nCloses #${issue.number}`, branch)

    const pr = await createPullRequest(
      {
        base: repoConfig.baseBranch ?? 'main',
        body: [
          `This PR was automatically generated by Loom to resolve issue #${issue.number}.`,
          ``,
          `**Issue:** ${issue.title}`,
          ``,
          `**Agent output:**`,
          '```',
          result.output.slice(0, 3000),
          '```',
          ``,
          `Closes #${issue.number}`,
        ].join('\n'),
        head: branch,
        owner,
        repo,
        title: `fix: ${issue.title} (#${issue.number})`,
      },
      client,
    )

    const now = new Date().toISOString()
    this.db
      .update(tasks)
      .set({ prNumber: pr.number, prUrl: pr.htmlUrl, status: 'completed' })
      .where(eq(tasks.id, taskId))
      .run()
    this.db
      .update(agentRuns)
      .set({ completedAt: now, output: result.output, status: 'completed' })
      .where(eq(agentRuns.id, runId))
      .run()

    console.log(`[orchestrator] ✅ PR opened: ${pr.htmlUrl}`)

    try {
      await addIssueComment(owner, repo, issue.number, `✅ Done! PR opened: ${pr.htmlUrl}`, client)
    } catch {
      // Non-fatal
    }
  }

  private recordFailure(
    taskId: number,
    runId: number,
    err: unknown,
    issue: GitHubIssue,
    repoConfig: RepoWatchConfig,
    client: GitHubClient,
  ): void {
    const { owner, repo } = repoConfig
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[orchestrator] ❌ Task ${taskId} failed:`, errorMsg)

    const now = new Date().toISOString()
    this.db.update(tasks).set({ status: 'failed' }).where(eq(tasks.id, taskId)).run()
    this.db
      .update(agentRuns)
      .set({ completedAt: now, error: errorMsg, status: 'failed' })
      .where(eq(agentRuns.id, runId))
      .run()

    void addIssueComment(owner, repo, issue.number, `❌ Loom failed to process this issue: ${errorMsg}`, client).catch(
      () => {}, // Non-fatal
    )
  }

  private upsertRepo(repoConfig: RepoWatchConfig): Repo {
    const { owner, repo, label } = repoConfig
    const all = this.db.select().from(repos).where(eq(repos.owner, owner)).all()
    const found = all.find((r: Repo) => r.name === repo)
    if (found) return found

    const inserted = this.db
      .insert(repos)
      .values({
        githubUrl: `https://github.com/${owner}/${repo}`,
        name: repo,
        owner,
        watchLabel: label,
      })
      .returning()
      .all()

    return requireFirst(inserted, 'insert repo')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
