const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IMAGE_TYPES = {
  'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/webp': { extension: 'webp', signature: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function uploadError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function getUploadRoot() {
  if (process.env.NAVPILOT_UPLOAD_DIR) return path.resolve(process.env.NAVPILOT_UPLOAD_DIR);
  const databasePath = process.env.NAVPILOT_DB_PATH;
  // Keep in-memory test databases isolated, but make the application's default
  // database and uploads share the same persistent server/data directory.
  if (databasePath === ':memory:') return path.join(os.tmpdir(), `navpilot-uploads-${process.pid}`);
  const dataDirectory = databasePath
    ? path.dirname(path.resolve(databasePath))
    : path.resolve(__dirname, '..', '..', 'data');
  return path.join(dataDirectory, 'uploads');
}

function decodeImageDataUrl(value) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw uploadError('INVALID_IMAGE_DATA', '仅支持 PNG、JPEG 或 WebP 图片');
  const type = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw uploadError('IMAGE_TOO_LARGE', '图片大小不能超过 4MB');
  if (!IMAGE_TYPES[type].signature(buffer)) throw uploadError('INVALID_IMAGE_DATA', '图片内容与文件类型不匹配');
  return { buffer, type, extension: IMAGE_TYPES[type].extension };
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function saveImageDataUrl(dataUrl, { namespace, name }) {
  const image = decodeImageDataUrl(dataUrl);
  const safeNamespace = safeSegment(namespace);
  const safeName = safeSegment(name);
  if (!safeNamespace || !safeName) throw uploadError('INVALID_UPLOAD_TARGET', '上传目标无效');
  const digest = crypto.createHash('sha256').update(image.buffer).digest('hex').slice(0, 16);
  const directory = path.join(getUploadRoot(), safeNamespace);
  const filename = `${safeName}-${digest}.${image.extension}`;
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
  const destination = path.join(directory, filename);
  if (!fs.existsSync(destination)) {
    const temporary = path.join(directory, `.${filename}.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporary, image.buffer, { mode: 0o640, flag: 'wx' });
    fs.renameSync(temporary, destination);
  }
  return `/uploads/${safeNamespace}/${filename}`;
}

function removeManagedUpload(url, namespace) {
  const prefix = `/uploads/${safeSegment(namespace)}/`;
  if (!String(url || '').startsWith(prefix)) return;
  const filename = path.basename(String(url));
  const target = path.join(getUploadRoot(), safeSegment(namespace), filename);
  try { fs.unlinkSync(target); } catch (error) { if (error.code !== 'ENOENT') console.warn('[uploads] 删除旧文件失败:', error.message); }
}

module.exports = { getUploadRoot, decodeImageDataUrl, saveImageDataUrl, removeManagedUpload, MAX_IMAGE_BYTES };
