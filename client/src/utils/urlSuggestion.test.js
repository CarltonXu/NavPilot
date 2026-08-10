import { describe, expect, it } from 'vitest';
import { possibleURL } from './urlSuggestion.js';

describe('possibleURL', () => {
  it('recognizes explicit and bare web URLs', () => {
    expect(possibleURL('https://docs.example.com/path')).toBe('https://docs.example.com/path');
    expect(possibleURL('docs.example.com/path')).toBe('https://docs.example.com/path');
    expect(possibleURL('localhost:8787/admin')).toBe('https://localhost:8787/admin');
  });

  it('does not suggest unsafe protocols or ordinary search text', () => {
    expect(possibleURL('javascript:alert(1)')).toBe('');
    expect(possibleURL('file:///tmp/private')).toBe('');
    expect(possibleURL('研发文档')).toBe('');
  });
});
