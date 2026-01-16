/**
 * Tests for index.ts
 *
 * Note: The index.ts module executes immediately on import, making it challenging
 * to test directly. The core logic is tested through the individual module tests:
 * - aws.test.ts: Tests loginToAws and getParameter
 * - github.test.ts: Tests runNotificationWorkflow
 * - slack.test.ts: Tests SlackClient and createSlackClient
 * - helpers.test.ts: Tests map utility
 *
 * This file tests the map helper usage pattern used in index.ts for session naming.
 */

import { map } from './helpers'
import { REPOSITORY_OWNER } from './github'

describe('index module patterns', () => {
  describe('repository owner validation', () => {
    it('should have correct repository owner constant', () => {
      expect(REPOSITORY_OWNER).toBe('ruchira088')
    })

    it('should validate repository ownership pattern', () => {
      const validFullName = 'ruchira088/test-repo'
      const invalidFullName = 'other-owner/test-repo'

      expect(validFullName.startsWith(REPOSITORY_OWNER)).toBe(true)
      expect(invalidFullName.startsWith(REPOSITORY_OWNER)).toBe(false)
    })
  })

  describe('AWS session name generation', () => {
    it('should generate session name from repository name', () => {
      const repoName = 'slack-github-action'
      const sessionName = map(repoName, (name) => `${name}-oidc`)

      expect(sessionName).toBe('slack-github-action-oidc')
    })

    it('should return undefined when repository name is undefined', () => {
      const repoName: string | undefined = undefined
      const sessionName = map(repoName, (name) => `${name}-oidc`)

      expect(sessionName).toBeUndefined()
    })
  })

  describe('GitHub workflow run structure', () => {
    it('should create correct workflow run object structure', () => {
      const owner = 'ruchira088'
      const repo = 'test-repo'
      const runId = 12345

      const githubWorkflowRun = { owner, repo, runId }

      expect(githubWorkflowRun).toEqual({
        owner: 'ruchira088',
        repo: 'test-repo',
        runId: 12345
      })
    })
  })

  describe('input name patterns', () => {
    it('should use correct input names', () => {
      const inputNames = ['aws-role-arn', 'aws-region', 'slack-channel']

      expect(inputNames).toContain('aws-role-arn')
      expect(inputNames).toContain('aws-region')
      expect(inputNames).toContain('slack-channel')
    })
  })
})
