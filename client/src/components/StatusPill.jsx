import React from 'react';
import { useI18n } from '../i18n/LocaleContext.jsx';

export default function StatusPill({ status, latencyMs, checking }) {
  const { t } = useI18n();
  const cls = `status-pill status-${status}${checking ? ' status-checking' : ''}`;
  return (
    <span className={cls} title={checking ? t('status.checkingTitle') : undefined}>
      <span className="status-dot" />
      {checking ? t('status.checking') : t(`status.${['online', 'offline'].includes(status) ? status : 'unknown'}`)}
      {status === 'online' && !checking && typeof latencyMs === 'number' && <span>· {latencyMs}ms</span>}
    </span>
  );
}
