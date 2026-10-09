import { beforeEach, describe, expect, it } from 'vitest'
import { loadMenuLinks, menuLinkProblem, saveMenuLinks } from './menuLinks'

// Tests run in Node, which has no localStorage; a Map stands in for it.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size },
} as Storage

describe('menu links', () => {
  beforeEach(() => localStorage.clear())

  it('accepts only labelled paths on this site', () => {
    expect(menuLinkProblem({ label: 'Tools', path: '/tools/' })).toBeNull()
    expect(menuLinkProblem({ label: '', path: '/tools/' })).toMatch(/label/)
    for (const path of ['https://example.com/', '//example.com/', 'tools', '/\\example.com', 'javascript:alert(1)'])
      expect(menuLinkProblem({ label: 'X', path }), path).toMatch(/path on this site/)
  })

  it('round-trips saved links and drops anything invalid or malformed', () => {
    expect(loadMenuLinks()).toEqual([])
    saveMenuLinks([{ label: ' Tools ', path: ' /tools/ ' }])
    expect(loadMenuLinks()).toEqual([{ label: 'Tools', path: '/tools/' }])
    localStorage.setItem('party-console-companion:menu-links', JSON.stringify([{ label: 'Bad', path: '//evil' }, 7, { label: 'Ok', path: '/ok' }]))
    expect(loadMenuLinks()).toEqual([{ label: 'Ok', path: '/ok' }])
    localStorage.setItem('party-console-companion:menu-links', '{not json')
    expect(loadMenuLinks()).toEqual([])
  })
})
