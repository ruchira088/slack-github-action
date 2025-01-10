export interface GithubWorkflowRun {
  readonly owner: string
  readonly repo: string
  readonly runId: number
}

export interface CommitDetails {
  readonly repository: string
  readonly branch: string
  readonly commitMessage: string
  readonly commitSha: string
}

export type WorkflowRunDetails = CommitDetails & {
  readonly workflowName: string
  readonly url: string
}

export type SuccessfulWorkflowRunDetails = WorkflowRunDetails

export type FailedWorkflowRunDetails = WorkflowRunDetails & {
  readonly failedJob: string
  readonly failedStep: string
  readonly failedStepUrl: string
}
