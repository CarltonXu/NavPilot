export function readImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return Promise.reject(new Error('请选择有效的图片文件'));
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('原始图片不能超过 10MB'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取，请更换文件')); };
    image.src = url;
  });
}

export async function normalizeBrandImage(file, { square = false } = {}) {
  const { image, url } = await readImageFile(file);
  try {
    const limit = square ? 256 : 512;
    const canvas = document.createElement('canvas');
    if (square) {
      canvas.width = limit; canvas.height = limit;
      const scale = Math.min(limit / image.naturalWidth, limit / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      canvas.getContext('2d').drawImage(image, (limit-width)/2, (limit-height)/2, width, height);
    } else {
      const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
