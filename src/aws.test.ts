import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { getParameter } from './aws'

jest.mock('@aws-sdk/client-ssm', () => {
  return {
    SSMClient: jest.fn(),
    GetParameterCommand: jest.fn().mockImplementation((params) => ({
      input: params,
      _type: 'GetParameterCommand'
    }))
  }
})

const MockedGetParameterCommand = GetParameterCommand as jest.MockedClass<typeof GetParameterCommand>

describe('aws', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getParameter', () => {
    it('should retrieve parameter value with decryption', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Parameter: {
          Value: 'my-secret-value'
        }
      })

      const mockSsmClient = { send: mockSend } as unknown as SSMClient
      const result = await getParameter(mockSsmClient, '/my/parameter/path')

      expect(result).toBe('my-secret-value')
      expect(mockSend).toHaveBeenCalledTimes(1)

      expect(MockedGetParameterCommand).toHaveBeenCalledWith({
        Name: '/my/parameter/path',
        WithDecryption: true
      })
    })

    it('should handle different parameter names', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Parameter: {
          Value: 'another-value'
        }
      })

      const mockSsmClient = { send: mockSend } as unknown as SSMClient
      const result = await getParameter(mockSsmClient, '/github/slack/bot-token')

      expect(result).toBe('another-value')
      expect(MockedGetParameterCommand).toHaveBeenCalledWith({
        Name: '/github/slack/bot-token',
        WithDecryption: true
      })
    })

    it('should propagate errors from SSM client', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Parameter not found'))
      const mockSsmClient = { send: mockSend } as unknown as SSMClient

      await expect(getParameter(mockSsmClient, '/nonexistent')).rejects.toThrow('Parameter not found')
    })

    it('should request decryption for all parameters', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Parameter: { Value: 'decrypted-value' }
      })

      const mockSsmClient = { send: mockSend } as unknown as SSMClient
      await getParameter(mockSsmClient, '/secure/parameter')

      expect(MockedGetParameterCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          WithDecryption: true
        })
      )
    })
  })

  /**
   * Note: loginToAws creates an STSClient instance internally, which makes it
   * difficult to mock with Jest's hoisting behavior. The loginToAws function
   * is indirectly tested through:
   * - github.test.ts: Tests the full notification workflow
   * - index.test.ts: Tests the entry point patterns
   *
   * For comprehensive loginToAws testing, consider:
   * - Refactoring to accept an STSClient factory for dependency injection
   * - Using integration tests with real AWS credentials in a test account
   */
})
