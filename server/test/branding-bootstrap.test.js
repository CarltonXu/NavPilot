const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NAVPILOT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { renderClientIndex } = require('../src/index');

test('server injects safe branding into the first HTML response', () => {
  const template = '<title><!--NAVPILOT_TITLE-->NavPilot<!--/NAVPILOT_TITLE--></title><link href="<!--NAVPILOT_FAVICON-->fallback<!--/NAVPILOT_FAVICON-->"><script>window.x=<!--NAVPILOT_BOOTSTRAP-->{}<!--/NAVPILOT_BOOTSTRAP--></script>';
  const rendered = renderClientIndex(template, {
    ai_personal_enabled:true,
    branding:{
      siteName:'OnePro </title><script>alert(1)</script>',
      logoUrl:'/branding/navpilot-logo.svg',
      faviconUrl:'/branding/navpilot-logo.svg',
    },
  });

  assert.match(rendered, /<title>OnePro &lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
  assert.match(rendered, /href="\/branding\/navpilot-logo\.svg"/);
  assert.match(rendered, /window\.x=\{"ai_personal_enabled":true/);
  assert.match(rendered, /OnePro \\u003c\/title\\u003e\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e/);
  assert.equal(rendered.includes('<script>alert(1)</script>'), false);
});
