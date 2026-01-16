import { SSMClient } from '@aws-sdk/client-ssm'
import * as github from '@actions/github'
import { runNotificationWorkflow, REPOSITORY_OWNER } from './github'
import { GithubWorkflowRun } from './types'
import * as awsModule from './aws'
import * as slackModule from './slack'

jest.mock('./aws')
jest.mock('./slack')
jest.mock('@actions/github')

const mockedGithub = github as jest.Mocked<typeof github>
const mockedAws = awsModule as jest.Mocked<typeof awsModule>
const mockedSlack = slackModule as jest.Mocked<typeof slackModule>

describe('github', () => {
  describe('REPOSITORY_OWNER', () => {
    it('should be ruchira088', () => {
      expect(REPOSITORY_OWNER).toBe('ruchira088')
    })
  })

  describe('runNotificationWorkflow', () => {
    let mockSsmClient: SSMClient
    let mockOctokit: {
      rest: {
        actions: {
          listJobsForWorkflowRun: jest.Mock
          getWorkflowRun: jest.Mock
        }
      }
    }
    let mockSlackClient: {
      sendFailureMessage: jest.Mock
      sendSuccessMessage: jest.Mock
    }

    const mockWorkflowRun: GithubWorkflowRun = {
      owner: 'ruchira088',
      repo: 'test-repo',
      runId: 12345
    }

    beforeEach(() => {
      mockSsmClient = {} as SSMClient

      mockOctokit = {
        rest: {
          actions: {
            listJobsForWorkflowRun: jest.fn(),
            getWorkflowRun: jest.fn()
          }
        }
      }

      mockSlackClient = {
        sendFailureMessage: jest.fn(),
        sendSuccessMessage: jest.fn()
      }

      mockedGithub.getOctokit = jest.fn().mockReturnValue(mockOctokit)
      mockedAws.getParameter.mockResolvedValue('github-token')
      mockedSlack.createSlackClient.mockResolvedValue(mockSlackClient as unknown as slackModule.SlackClient)
    })

    it('should send success message when all jobs pass', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            { id: 1, name: 'build', conclusion: 'success' },
            { id: 2, name: 'test', conclusion: 'success' }
          ]
        }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Add new feature',
          head_sha: 'abc123def',
          name: 'CI Pipeline',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockSlackClient.sendSuccessMessage).toHaveBeenCalledWith('alerts', {
        repository: 'ruchira088/test-repo',
        branch: 'main',
        commitMessage: 'Add new feature',
        commitSha: 'abc123def',
        workflowName: 'CI Pipeline',
        url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
      })
      expect(mockSlackClient.sendFailureMessage).not.toHaveBeenCalled()
    })

    it('should send failure message when a job fails', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            { id: 1, name: 'build', conclusion: 'success' },
            {
              id: 2,
              name: 'test',
              conclusion: 'failure',
              html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345/job/2',
              steps: [
                { name: 'Checkout', conclusion: 'success' },
                { name: 'Run tests', conclusion: 'failure' }
              ]
            }
          ]
        }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'feature-branch',
          display_title: 'Fix bug',
          head_sha: 'xyz789',
          name: 'CI Pipeline',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockSlackClient.sendFailureMessage).toHaveBeenCalledWith('alerts', {
        repository: 'ruchira088/test-repo',
        branch: 'feature-branch',
        commitMessage: 'Fix bug',
        commitSha: 'xyz789',
        workflowName: 'CI Pipeline',
        url: 'https://github.com/ruchira088/test-repo/actions/runs/12345',
        failedJob: 'test',
        failedStep: 'Run tests',
        failedStepUrl: 'https://github.com/ruchira088/test-repo/actions/runs/12345/job/2'
      })
      expect(mockSlackClient.sendSuccessMessage).not.toHaveBeenCalled()
    })

    it('should send failure message when a job times out', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            {
              id: 1,
              name: 'long-running-job',
              conclusion: 'timed_out',
              html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345/job/1',
              steps: [
                { name: 'Setup', conclusion: 'success' },
                { name: 'Long task', conclusion: 'timed_out' }
              ]
            }
          ]
        }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Add timeout test',
          head_sha: 'timeout123',
          name: 'CI Pipeline',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockSlackClient.sendFailureMessage).toHaveBeenCalledWith('alerts',
        expect.objectContaining({
          failedJob: 'long-running-job',
          failedStep: 'Long task'
        })
      )
    })

    it('should use correct parameters for GitHub API calls', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [] }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockOctokit.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: 'ruchira088',
        repo: 'test-repo',
        run_id: 12345
      })

      expect(mockOctokit.rest.actions.getWorkflowRun).toHaveBeenCalledWith({
        owner: 'ruchira088',
        repo: 'test-repo',
        run_id: 12345
      })
    })

    it('should fetch GitHub token from SSM', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [] }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockedAws.getParameter).toHaveBeenCalledWith(mockSsmClient, '/github/slack-github-action/read')
      expect(mockedGithub.getOctokit).toHaveBeenCalledWith('github-token')
    })

    it('should handle jobs with null conclusion', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            { id: 1, name: 'build', conclusion: null },
            { id: 2, name: 'test', conclusion: 'success' }
          ]
        }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockSlackClient.sendSuccessMessage).toHaveBeenCalled()
      expect(mockSlackClient.sendFailureMessage).not.toHaveBeenCalled()
    })

    it('should find the first failed job when multiple jobs fail', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            {
              id: 1,
              name: 'first-failing',
              conclusion: 'failure',
              html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345/job/1',
              steps: [{ name: 'Step A', conclusion: 'failure' }]
            },
            {
              id: 2,
              name: 'second-failing',
              conclusion: 'failure',
              html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345/job/2',
              steps: [{ name: 'Step B', conclusion: 'failure' }]
            }
          ]
        }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockSlackClient.sendFailureMessage).toHaveBeenCalledWith('alerts',
        expect.objectContaining({
          failedJob: 'first-failing',
          failedStep: 'Step A'
        })
      )
    })

    it('should create slack client with SSM client', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [] }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'alerts')

      expect(mockedSlack.createSlackClient).toHaveBeenCalledWith(mockSsmClient)
    })

    it('should send message to the specified slack channel', async () => {
      mockOctokit.rest.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [] }
      })

      mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
        data: {
          repository: { full_name: 'ruchira088/test-repo' },
          head_branch: 'main',
          display_title: 'Test',
          head_sha: 'abc123',
          name: 'CI',
          html_url: 'https://github.com/ruchira088/test-repo/actions/runs/12345'
        }
      })

      await runNotificationWorkflow(mockSsmClient, mockWorkflowRun, 'custom-channel')

      expect(mockSlackClient.sendSuccessMessage).toHaveBeenCalledWith(
        'custom-channel',
        expect.any(Object)
      )
    })
  })
})
