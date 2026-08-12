const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NAVPILOT_DB_PATH=':memory:';
const db=require('../src/db');
const {
  validateSettingsUpdate,
  maskApiKey,
} = require('../src/services/settingsService');
const { normalizeLocale, extractJson } = require('../src/services/aiParser');

test('validates and normalizes AI settings', () => {
  assert.deepEqual(validateSettingsUpdate({
    aiPersonalEnabled: true,
    ai: { baseURL: ' https://example.com/v1/ ', model: ' model-1 ', apiKey: ' secret ' },
  }), {
    aiPersonalEnabled: true,
    baseURL: 'https://example.com/v1',
    model: 'model-1',
    apiKey: 'secret',
  });
});

test('supports explicit null to restore fallback values', () => {
  assert.deepEqual(validateSettingsUpdate({ ai: { baseURL: null, model: null, apiKey: null } }), {
    baseURL: null,
    model: null,
    apiKey: null,
  });
});

test('rejects unsafe AI base URLs', () => {
  assert.throws(() => validateSettingsUpdate({ ai: { baseURL: 'file:///tmp/key' } }), { code: 'INVALID_AI_BASE_URL' });
  assert.throws(() => validateSettingsUpdate({ ai: { baseURL: 'https://user:pass@example.com' } }), { code: 'INVALID_AI_BASE_URL' });
});

test('validates and normalizes branding settings', () => {
  assert.deepEqual(validateSettingsUpdate({ branding: {
    siteName: '  NavPilot Team  ',
    logoUrl: '/assets/navpilot-logo.svg',
    faviconUrl: 'https://static.example.com/favicon.ico',
  } }), { branding: {
    siteName: 'NavPilot Team',
    logoUrl: '/assets/navpilot-logo.svg',
    faviconUrl: 'https://static.example.com/favicon.ico',
  } });
  assert.throws(() => validateSettingsUpdate({ branding: { siteName: '' } }), { code: 'INVALID_DISPLAY_NAME' });
  assert.throws(() => validateSettingsUpdate({ branding: { logoUrl: 'file:///tmp/logo.svg' } }), { code: 'INVALID_BRANDING_URL' });
  assert.throws(() => validateSettingsUpdate({ branding: { logoUrl: '//tracking.example/logo.svg' } }), { code: 'INVALID_BRANDING_URL' });
  assert.throws(() => validateSettingsUpdate({ branding: [] }), { code: 'INVALID_BRANDING_SETTINGS' });
});

test('validates public insight disclosure settings',()=>{
  assert.deepEqual(validateSettingsUpdate({publicInsights:{enabled:true,anonymousEnabled:false,searchMinCount:3}}),{publicInsights:{enabled:true,anonymousEnabled:false,searchMinCount:3}});
  assert.throws(()=>validateSettingsUpdate({publicInsights:{enabled:'yes'}}),{code:'INVALID_PUBLIC_INSIGHTS_SETTINGS'});
  assert.throws(()=>validateSettingsUpdate({publicInsights:{searchMinCount:1}}),{code:'INVALID_PUBLIC_INSIGHTS_SEARCH_MIN_COUNT'});
  assert.throws(()=>validateSettingsUpdate({publicInsights:{searchMinCount:21}}),{code:'INVALID_PUBLIC_INSIGHTS_SEARCH_MIN_COUNT'});
});

test('masks API keys without returning the full value', () => {
  const key = 'sk-super-secret-1234';
  const masked = maskApiKey(key);
  assert.equal(masked, '••••1234');
  assert.equal(masked.includes(key), false);
});
test.after(()=>db.close());

test('normalizes locale and parses fenced JSON', () => {
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('fr'), 'zh-CN');
  assert.deepEqual(extractJson('```json\n{"items":[]}\n```'), { items: [] });
});
