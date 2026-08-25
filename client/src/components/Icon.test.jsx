import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CATEGORY_ICON_GROUPS } from '../constants/categoryIcons.js';
import { ContentIcon, ICON_NAMES } from './Icon.jsx';

afterEach(cleanup);

describe('ContentIcon', () => {
  it('provides eleven unique groups backed by one hundred fifty SVG icons', () => {
    const names = CATEGORY_ICON_GROUPS.flatMap((group) => group.names);
    expect(CATEGORY_ICON_GROUPS).toHaveLength(11);
    expect(names).toHaveLength(150);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => ICON_NAMES.includes(name))).toBe(true);
  });

  it('loads a remote icon lazily through its same-origin cache URL', () => {
    const { container } = render(
      <ContentIcon
        value="https://icons.example/favicon.png"
        cachedUrl="/api/items/icon-cache/0123456789abcdef"
      />,
    );
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/api/items/icon-cache/0123456789abcdef');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
  });

  it('retries the original icon URL when its cache proxy is unavailable', () => {
    const { container } = render(<ContentIcon value="http://192.168.10.201/favicon.ico" cachedUrl="/api/items/icon-cache/deadbeefdeadbeef"/>);
    const image = container.querySelector('img');
    image.dispatchEvent(new Event('error'));
    expect(image?.getAttribute('src')).toBe('http://192.168.10.201/favicon.ico');
    expect(image?.dataset.originalTried).toBe('true');
  });
});
