import axios from 'axios'
import { SlackClient, createSlackClient } from './slack'
import { FailedWorkflowRunDetails, SuccessfulWorkflowRunDetails } from './types'
import { SSMClient } from '@aws-sdk/client-ssm'
import * as awsModule from './aws'

jest.mock('axios')
jest.mock('./aws')

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedAws = awsModule as jest.Mocked<typeof awsModule>

type SlackBlock = { type: string; text?: { text: string }; fields?: { text: string }[] }

/** Flattens every mrkdwn string in a Block Kit payload for content assertions. */
function blockText(blocks: SlackBlock[]): string {
  return blocks.flatMap(block => [block.text?.text ?? '', ...(block.fields ?? []).map(f => f.text)]).join('\n')
}

describe('SlackClient', () => {
  let mockAxiosInstance: {
    get: jest.Mock
    post: jest.Mock
  }

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn()
    }
    mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof axios.create>)
  })

  describe('constructor', () => {
    it('should create an axios instance with correct configuration', () => {
      // oxlint-disable-next-line no-new -- constructed for its side effect on axios.create
      new SlackClient('test-token')

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://slack.com/api/',
        headers: {
          Authorization: 'Bearer test-token'
        }
      })
    })
  })

  describe('getChannelId', () => {
    it('should return channel id when channel is found', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [
            { id: 'C123', name: 'general' },
            { id: 'C456', name: 'random' }
          ]
        }
      })

      const client = new SlackClient('test-token')
      const channelId = await client.getChannelId('random')

      expect(channelId).toBe('C456')
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/conversations.list', {
        params: { limit: 1000, exclude_archived: true, cursor: undefined }
      })
    })

    it('should return undefined when channel is not found and no more pages', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [
            { id: 'C123', name: 'general' }
          ]
        }
      })

      const client = new SlackClient('test-token')
      const channelId = await client.getChannelId('nonexistent')

      expect(channelId).toBeUndefined()
    })

    it('should paginate when channel is not found but more pages exist', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: {
            ok: true,
            channels: [{ id: 'C123', name: 'general' }],
            response_metadata: { next_cursor: 'cursor123' }
          }
        })
        .mockResolvedValueOnce({
          data: {
            ok: true,
            channels: [{ id: 'C456', name: 'target-channel' }]
          }
        })

      const client = new SlackClient('test-token')
      const channelId = await client.getChannelId('target-channel')

      expect(channelId).toBe('C456')
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2)
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/conversations.list', {
        params: expect.objectContaining({ cursor: undefined })
      })
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/conversations.list', {
        params: expect.objectContaining({ cursor: 'cursor123' })
      })
    })

    it('should throw error when API returns not ok', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: false,
          error: 'invalid_auth'
        }
      })

      const client = new SlackClient('test-token')

      await expect(client.getChannelId('any-channel')).rejects.toThrow('invalid_auth')
    })

    it('should throw error when maximum number of pages is reached', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'other-channel' }],
          response_metadata: { next_cursor: 'next' }
        }
      })

      const client = new SlackClient('test-token')

      await expect(client.getChannelId('nonexistent', undefined, 51)).rejects.toThrow(
        'Maximum number of pages reached'
      )
      expect(mockAxiosInstance.get).not.toHaveBeenCalled()
    })

    it('should return undefined when next_cursor is empty string', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'general' }],
          response_metadata: { next_cursor: '' }
        }
      })

      const client = new SlackClient('test-token')
      const channelId = await client.getChannelId('nonexistent')

      expect(channelId).toBeUndefined()
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1)
    })

    it('should handle cursor parameter correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'my-channel' }]
        }
      })

      const client = new SlackClient('test-token')
      await client.getChannelId('my-channel', 'my-cursor')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/conversations.list', {
        params: expect.objectContaining({ cursor: 'my-cursor' })
      })
    })
  })

  describe('sendMessage', () => {
    const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Test' } }]
    const mockMessage = { text: 'Test fallback', blocks: mockBlocks }

    it('should send message successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'test-channel' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: true }
      })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendMessage('test-channel', mockMessage)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat.postMessage',
        { channel: 'C123', text: 'Test fallback', blocks: mockBlocks },
        { headers: { 'Content-Type': 'application/json' } }
      )
      expect(consoleSpy).toHaveBeenCalledWith('Slack message sent')

      consoleSpy.mockRestore()
    })

    it('should throw error when message sending fails', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'test-channel' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: false, error: 'channel_not_found' }
      })

      const client = new SlackClient('test-token')

      await expect(client.sendMessage('test-channel', mockMessage)).rejects.toThrow(
        'Failed to send Slack message: channel_not_found'
      )
    })

    it('should throw with unknown error when no error detail provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'test-channel' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: false }
      })

      const client = new SlackClient('test-token')

      await expect(client.sendMessage('test-channel', mockMessage)).rejects.toThrow(
        'Failed to send Slack message: unknown error'
      )
    })

    it('should throw error when channel is not found', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: []
        }
      })

      const client = new SlackClient('test-token')

      await expect(client.sendMessage('nonexistent', mockMessage)).rejects.toThrow(
        'Channel name: nonexistent not found'
      )
    })
  })

  describe('sendFailureMessage', () => {
    const failedDetails: FailedWorkflowRunDetails = {
      repository: 'owner/repo',
      branch: 'main',
      commitMessage: 'Fix bug',
      commitSha: 'abc123',
      workflowName: 'CI',
      url: 'https://github.com/owner/repo/actions/runs/123',
      failedJob: 'build',
      failedStep: 'Run tests',
      failedStepUrl: 'https://github.com/owner/repo/actions/runs/123/job/456'
    }

    beforeEach(() => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { ok: true, channels: [{ id: 'C123', name: 'alerts' }] }
      })
      mockAxiosInstance.post.mockResolvedValue({ data: { ok: true } })
      jest.spyOn(console, 'log').mockImplementation()
    })

    it('should include a plain-text fallback summarising the failure', async () => {
      const client = new SlackClient('test-token')
      await client.sendFailureMessage('alerts', failedDetails)

      const { text } = postedMessage()
      expect(text).toContain('FAILED')
      expect(text).toContain('owner/repo')
      expect(text).toContain('CI')
      expect(text).toContain('build')
      expect(text).toContain('Run tests')
    })

    it('should lay out the details as section fields', async () => {
      const client = new SlackClient('test-token')
      await client.sendFailureMessage('alerts', failedDetails)

      const { blocks } = postedMessage()
      expect(blocks[0]).toEqual(
        expect.objectContaining({
          type: 'section',
          fields: expect.arrayContaining([
            { type: 'mrkdwn', text: '*Repository*\nowner/repo' },
            { type: 'mrkdwn', text: '*Branch*\nmain' },
            { type: 'mrkdwn', text: '*Message*\nFix bug' },
            { type: 'mrkdwn', text: '*Commit SHA*\n`abc123`' },
            { type: 'mrkdwn', text: '*Workflow*\nCI' },
            { type: 'mrkdwn', text: '*Result*\nFAILED :x:' },
            { type: 'mrkdwn', text: '*Failed Job*\nbuild' },
            { type: 'mrkdwn', text: '*Failed Step*\nRun tests' }
          ])
        })
      )
    })

    it('should link to the failed step', async () => {
      const client = new SlackClient('test-token')
      await client.sendFailureMessage('alerts', failedDetails)

      expect(blockText(postedMessage().blocks)).toContain(`<${failedDetails.failedStepUrl}|Failed Step URL>`)
    })
  })

  describe('sendSuccessMessage', () => {
    const successDetails: SuccessfulWorkflowRunDetails = {
      repository: 'owner/repo',
      branch: 'main',
      commitMessage: 'Add feature',
      commitSha: 'def456',
      workflowName: 'CI',
      url: 'https://github.com/owner/repo/actions/runs/123'
    }

    beforeEach(() => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { ok: true, channels: [{ id: 'C123', name: 'alerts' }] }
      })
      mockAxiosInstance.post.mockResolvedValue({ data: { ok: true } })
      jest.spyOn(console, 'log').mockImplementation()
    })

    it('should include a plain-text fallback summarising the success', async () => {
      const client = new SlackClient('test-token')
      await client.sendSuccessMessage('alerts', successDetails)

      const { text } = postedMessage()
      expect(text).toContain('SUCCESS')
      expect(text).toContain('owner/repo')
      expect(text).toContain('CI')
    })

    it('should lay out the details as section fields', async () => {
      const client = new SlackClient('test-token')
      await client.sendSuccessMessage('alerts', successDetails)

      const { blocks } = postedMessage()
      expect(blocks[0]).toEqual(
        expect.objectContaining({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Repository*\nowner/repo' },
            { type: 'mrkdwn', text: '*Branch*\nmain' },
            { type: 'mrkdwn', text: '*Message*\nAdd feature' },
            { type: 'mrkdwn', text: '*Commit SHA*\n`def456`' },
            { type: 'mrkdwn', text: '*Workflow*\nCI' },
            { type: 'mrkdwn', text: '*Result*\nSUCCESS :white_check_mark:' }
          ]
        })
      )
    })

    it('should link to the workflow run', async () => {
      const client = new SlackClient('test-token')
      await client.sendSuccessMessage('alerts', successDetails)

      expect(blockText(postedMessage().blocks)).toContain(`<${successDetails.url}|Job URL>`)
    })
  })

  function postedMessage(): { text: string; blocks: SlackBlock[] } {
    return mockAxiosInstance.post.mock.calls[0][1]
  }
})

describe('createSlackClient', () => {
  it('should create SlackClient with token from SSM', async () => {
    mockedAws.getParameter.mockResolvedValue('ssm-slack-token')

    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn()
    } as unknown as ReturnType<typeof axios.create>)

    const mockSsmClient = {} as SSMClient
    const client = await createSlackClient(mockSsmClient)

    expect(mockedAws.getParameter).toHaveBeenCalledWith(mockSsmClient, '/github/slack/bot-token')
    expect(client).toBeInstanceOf(SlackClient)
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://slack.com/api/',
      headers: {
        Authorization: 'Bearer ssm-slack-token'
      }
    })
  })
})
