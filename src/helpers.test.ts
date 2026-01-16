import { map } from './helpers'

describe('helpers', () => {
  describe('map', () => {
    it('should return undefined when input is undefined', () => {
      const result = map(undefined, (x: number) => x * 2)
      expect(result).toBeUndefined()
    })

    it('should apply the function when input is defined', () => {
      const result = map(5, (x) => x * 2)
      expect(result).toBe(10)
    })

    it('should work with string transformation', () => {
      const result = map('hello', (s) => s.toUpperCase())
      expect(result).toBe('HELLO')
    })

    it('should work with object transformation', () => {
      const input = { name: 'test', value: 42 }
      const result = map(input, (obj) => obj.name)
      expect(result).toBe('test')
    })

    it('should handle null values (not treated as undefined)', () => {
      const result = map(null, () => 'transformed')
      expect(result).toBe('transformed')
    })

    it('should handle empty string (not treated as undefined)', () => {
      const result = map('', (s) => s.length)
      expect(result).toBe(0)
    })

    it('should handle zero (not treated as undefined)', () => {
      const result = map(0, (n) => n + 10)
      expect(result).toBe(10)
    })

    it('should handle false (not treated as undefined)', () => {
      const result = map(false, (b) => !b)
      expect(result).toBe(true)
    })

    it('should work with array transformation', () => {
      const result = map([1, 2, 3], (arr) => arr.length)
      expect(result).toBe(3)
    })

    it('should work with complex transformations', () => {
      const result = map('my-repo', (name) => `${name}-oidc`)
      expect(result).toBe('my-repo-oidc')
    })
  })
})
