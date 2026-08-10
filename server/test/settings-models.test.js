const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NAVPILOT_DB_PATH = ':memory:';

const db = require('../src/db');
const {
  addAiModel,
  updateAiModel,
  deleteAiModel,
  setDefaultAiModel,
  getAdminSettingsView,
  getEffectiveAiConfig,
} = require('../src/services/settingsService');

test('manages multiple AI models and keeps an enabled default', () => {
  let settings = addAiModel({
    name: 'Primary', baseURL: 'https://ai-one.example/v1/', model: 'model-one', apiKey: 'secret-one', enabled: true,
  });
  const first = settings.aiModels[0];
  assert.equal(settings.defaultAiModelId, first.id);
  assert.equal(first.isDefault, true);
  assert.equal(first.baseURL, 'https://ai-one.example/v1');
  assert.equal(first.maskedApiKey, '••••-one');
  assert.equal(Object.hasOwn(first, 'apiKey'), false);
  const storedModels=db.prepare("SELECT value FROM settings WHERE key='ai_models_v1'").get().value;
  assert.equal(storedModels.includes('secret-one'),false);
  assert.equal(storedModels.includes('enc:v1:'),true);

  settings = addAiModel({
    name: 'Backup', baseURL: 'https://ai-two.example/v1', model: 'model-two', apiKey: 'secret-two', enabled: true,
  });
  const second = settings.aiModels.find((model) => model.name === 'Backup');
  assert.equal(settings.defaultAiModelId, first.id);

  settings = setDefaultAiModel(second.id);
  assert.equal(settings.defaultAiModelId, second.id);
  assert.equal(getEffectiveAiConfig().model, 'model-two');

  settings = updateAiModel(second.id, { enabled: false });
  assert.equal(settings.defaultAiModelId, first.id);
  assert.equal(getEffectiveAiConfig().model, 'model-one');
  assert.throws(() => setDefaultAiModel(second.id), { code: 'AI_MODEL_DISABLED' });

  settings = updateAiModel(first.id, { enabled: false });
  assert.equal(settings.defaultAiModelId, null);
  assert.equal(getEffectiveAiConfig().model, '');

  settings = updateAiModel(second.id, { enabled: true, name: 'Backup enabled' });
  settings = setDefaultAiModel(second.id);
  assert.equal(settings.aiModels.find((model) => model.id === second.id).name, 'Backup enabled');
  assert.equal(settings.defaultAiModelId, second.id);

  settings = deleteAiModel(second.id);
  assert.equal(settings.aiModels.length, 1);
  assert.equal(settings.defaultAiModelId, null);
  assert.throws(() => deleteAiModel('missing'), { code: 'AI_MODEL_NOT_FOUND' });
  assert.equal(JSON.stringify(getAdminSettingsView()).includes('secret-one'), false);
});

test.after(() => db.close());
