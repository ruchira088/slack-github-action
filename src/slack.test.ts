import axios from 'axios'
import { SlackClient, createSlackClient } from './slack'
import { FailedWorkflowRunDetails, SuccessfulWorkflowRunDetails } from './types'
import { SSMClient } from '@aws-sdk/client-ssm'
import * as awsModule from './aws'

jest.mock('axios')
jest.mock('./aws')

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedAws = awsModule as jest.Mocked<typeof awsModule>

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
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/conversations.list?')
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
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/conversations.list?')
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/conversations.list?cursor=cursor123')
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

    it('should handle cursor parameter correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'my-channel' }]
        }
      })

      const client = new SlackClient('test-token')
      await client.getChannelId('my-channel', 'my-cursor')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/conversations.list?cursor=my-cursor')
    })
  })

  describe('sendMessage', () => {
    const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Test' } }]

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
      await client.sendMessage('test-channel', mockBlocks)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat.postMessage',
        { channel: 'C123', blocks: mockBlocks },
        { headers: { 'Content-Type': 'application/json' } }
      )
      expect(consoleSpy).toHaveBeenCalledWith('Slack message sent')

      consoleSpy.mockRestore()
    })

    it('should log error when message sending fails', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'test-channel' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: false }
      })

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendMessage('test-channel', mockBlocks)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to send Slack message')

      consoleErrorSpy.mockRestore()
    })

    it('should throw error when channel is not found', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: []
        }
      })

      const client = new SlackClient('test-token')

      await expect(client.sendMessage('nonexistent', mockBlocks)).rejects.toThrow(
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

    it('should send failure message with correct block structure', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'alerts' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: true }
      })

      jest.spyOn(console, 'log').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendFailureMessage('alerts', failedDetails)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat.postMessage',
        expect.objectContaining({
          channel: 'C123',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'section',
              text: expect.objectContaining({
                type: 'mrkdwn',
                text: expect.stringContaining('FAILED :x:')
              })
            })
          ])
        }),
        expect.any(Object)
      )
    })

    it('should include all failure details in the message', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'alerts' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: true }
      })

      jest.spyOn(console, 'log').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendFailureMessage('alerts', failedDetails)

      const postCall = mockAxiosInstance.post.mock.calls[0]
      const messageText = postCall[1].blocks[0].text.text

      expect(messageText).toContain('owner/repo')
      expect(messageText).toContain('main')
      expect(messageText).toContain('Fix bug')
      expect(messageText).toContain('abc123')
      expect(messageText).toContain('CI')
      expect(messageText).toContain('build')
      expect(messageText).toContain('Run tests')
      expect(messageText).toContain(failedDetails.failedStepUrl)
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

    it('should send success message with correct block structure', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'alerts' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: true }
      })

      jest.spyOn(console, 'log').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendSuccessMessage('alerts', successDetails)

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat.postMessage',
        expect.objectContaining({
          channel: 'C123',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'section',
              text: expect.objectContaining({
                type: 'mrkdwn',
                text: expect.stringContaining('SUCCESS :white_check_mark:')
              })
            })
          ])
        }),
        expect.any(Object)
      )
    })

    it('should include all success details in the message', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ok: true,
          channels: [{ id: 'C123', name: 'alerts' }]
        }
      })
      mockAxiosInstance.post.mockResolvedValue({
        data: { ok: true }
      })

      jest.spyOn(console, 'log').mockImplementation()

      const client = new SlackClient('test-token')
      await client.sendSuccessMessage('alerts', successDetails)

      const postCall = mockAxiosInstance.post.mock.calls[0]
      const messageText = postCall[1].blocks[0].text.text

      expect(messageText).toContain('owner/repo')
      expect(messageText).toContain('main')
      expect(messageText).toContain('Add feature')
      expect(messageText).toContain('def456')
      expect(messageText).toContain('CI')
      expect(messageText).toContain(successDetails.url)
    })
  })
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
