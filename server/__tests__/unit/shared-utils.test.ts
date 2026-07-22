import { describe, it, expect } from 'vitest';
import { escapeHtml, toMessage, interpolate } from '../../../shared/utils';

describe('escapeHtml', () => {
  it('returns the original string when nothing needs escaping', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('</div>')).toBe('&lt;/div&gt;');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it("escapes ' to &#039;", () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('replaces null bytes with replacement character', () => {
    expect(escapeHtml('a\0b')).toBe('a\uFFFDb');
  });

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes all special characters in a combined string', () => {
    const input = '<a href="x">&y\'s\0</a>';
    expect(escapeHtml(input)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;y&#039;s\uFFFd&lt;/a&gt;');
  });
});

describe('toMessage', () => {
  it('returns the message property of an Error', () => {
    expect(toMessage(new Error('something broke'))).toBe('something broke');
  });

  it('stringifies non-Error values', () => {
    expect(toMessage(42)).toBe('42');
    expect(toMessage('plain string')).toBe('plain string');
    expect(toMessage(null)).toBe('null');
    expect(toMessage(undefined)).toBe('undefined');
  });

  it('handles Error subclasses', () => {
    expect(toMessage(new TypeError('type error'))).toBe('type error');
  });
});

describe('interpolate', () => {
  it('returns the template unchanged when no params are provided', () => {
    expect(interpolate('hello {name}', undefined)).toBe('hello {name}');
  });

  it('replaces {key} placeholders with matching param values', () => {
    expect(interpolate('hello {name}', { name: 'world' })).toBe('hello world');
  });

  it('replaces multiple placeholders', () => {
    expect(interpolate('{greeting} {name}!', { greeting: 'Hello', name: 'World' })).toBe(
      'Hello World!',
    );
  });

  it('leaves unknown placeholders intact', () => {
    expect(interpolate('hello {name}', { other: 'value' })).toBe('hello {name}');
  });

  it('replaces numeric values', () => {
    expect(interpolate('count: {n}', { n: 42 })).toBe('count: 42');
  });

  it('returns the template unchanged when params is empty', () => {
    expect(interpolate('{a}', {})).toBe('{a}');
  });

  it('does not replace partial key matches', () => {
    expect(interpolate('{abc}', { ab: 'x' })).toBe('{abc}');
  });
});
