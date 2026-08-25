import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/LocaleContext.jsx';
import {
  CATEGORY_ICON_GROUPS,
  COMMON_ICON_NAMES,
  ICON_LABELS,
} from '../constants/categoryIcons.js';
import Icon, { ContentIcon } from './Icon.jsx';

const RECENT_ICONS_KEY = 'navpilot_recent_icons';
const MAX_RECENT_ICONS = 12;

function iconName(value) {
  const text = String(value || '');
  return text.startsWith('icon:') ? text.slice(5) : '';
}

function isRemoteIcon(value) {
  return /^https?:\/\/[^\s]+$/i.test(String(value || '').trim());
}

function readRecentIcons() {
  try {
    const values = JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) || '[]');
    return Array.isArray(values)
      ? values.filter(name => ICON_LABELS[name]).slice(0, MAX_RECENT_ICONS)
      : [];
  } catch {
    return [];
  }
}

function writeRecentIcon(name) {
  if (!ICON_LABELS[name]) return;
  try {
    const values = [name, ...readRecentIcons().filter(value => value !== name)]
      .slice(0, MAX_RECENT_ICONS);
    localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(values));
  } catch {
    /* Icon selection still works when browser storage is unavailable. */
  }
}

export default function VectorIconPicker({ value, onChange, label, allowCustom = false, compact = false, iconOnly = false, autoOpen = false, hideTrigger = false, onDismiss }) {
  const { t, locale, errorMessage } = useI18n();
  const titleId = useId();
  const searchRef = useRef(null);
  const selectedName = iconName(value);
  const [open, setOpen] = useState(autoOpen);
  const [draftValue, setDraftValue] = useState(value || 'icon:link');
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState('all');
  const [recentNames, setRecentNames] = useState(readRecentIcons);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  const primaryLanguage = locale === 'en' ? 'en' : 'zh';
  const currentMeta = ICON_LABELS[selectedName];
  const currentTitle = currentMeta
    ? currentMeta[primaryLanguage]
    : (isRemoteIcon(value) ? t('iconPicker.custom') : t('iconPicker.none'));

  const groups = useMemo(() => [
    { key: 'all', names: CATEGORY_ICON_GROUPS.flatMap(group => group.names) },
    { key: 'common', names: COMMON_ICON_NAMES },
    { key: 'recent', names: recentNames },
    ...CATEGORY_ICON_GROUPS,
  ], [recentNames]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(() => {
    if (normalizedQuery)
      return CATEGORY_ICON_GROUPS
        .map(group => ({
          ...group,
          names: group.names.filter(name => ICON_LABELS[name]?.search.includes(normalizedQuery)),
        }))
        .filter(group => group.names.length);
    if (activeKey === 'all') return CATEGORY_ICON_GROUPS;
    const group = groups.find(item => item.key === activeKey);
    return group ? [group] : CATEGORY_ICON_GROUPS;
  }, [activeKey, groups, normalizedQuery]);
  const visibleNames = useMemo(
    () => visibleSections.flatMap(group => group.names),
    [visibleSections],
  );
  const showSectionHeadings = Boolean(normalizedQuery) || activeKey === 'all';
  const groupLabel = key =>
    ['all', 'common', 'recent'].includes(key)
      ? t(`iconPicker.${key}`)
      : t(`category.iconGroup.${key}`);

  const openDialog = () => {
    const latestRecentNames = readRecentIcons();
    setDraftValue(value || 'icon:link');
    setRecentNames(latestRecentNames);
    setActiveKey('all');
    setQuery('');
    setApplyError('');
    setOpen(true);
  };

  const closeDialog = () => {
    if (applying) return;
    setOpen(false);
    onDismiss?.();
  };
  const applyValue = async nextValue => {
    if (applying) return;
    setApplying(true);
    setApplyError('');
    const nextName = iconName(nextValue);
    try {
      await onChange(nextValue);
      writeRecentIcon(nextName);
      if (nextName) setRecentNames(readRecentIcons());
      setApplying(false);
      setOpen(false);
      onDismiss?.();
    } catch (error) {
      setApplyError(errorMessage(error));
      setApplying(false);
    }
  };
  const canApply = Boolean(ICON_LABELS[iconName(draftValue)]) || (allowCustom && isRemoteIcon(draftValue));

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDialog();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [applying, onDismiss, open]);

  return <div className={`vector-icon-picker ${compact ? 'compact' : ''} ${iconOnly ? 'icon-only' : ''} ${hideTrigger ? 'trigger-hidden' : ''}`}>
    {!hideTrigger && <button
      type="button"
      className={`vector-icon-trigger ${compact ? 'compact' : ''} ${iconOnly ? 'icon-only' : ''}`}
      aria-haspopup="dialog"
      aria-label={iconOnly ? t('iconPicker.choose') : undefined}
      onClick={openDialog}
    >
      {iconOnly ? <ContentIcon value={value} size={20}/> : compact ? <><Icon name="palette" size={15}/><span>{t('iconPicker.choose')}</span></> : <>
        <span className="vector-icon-trigger-preview"><ContentIcon value={value} size={22}/></span>
        <span className="vector-icon-trigger-copy">
          <strong>{currentTitle}</strong>
          <small>{currentMeta?.en || String(value || '')}</small>
        </span>
        <span className="vector-icon-trigger-action"><Icon name="palette" size={15}/>{t('iconPicker.choose')}</span>
      </>}
    </button>}
    {open && createPortal(
      <div className="vector-icon-mask" onMouseDown={event => event.target === event.currentTarget && closeDialog()}>
        <section className="vector-icon-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="vector-icon-heading">
            <span><Icon name="palette" size={21}/></span>
            <div><h3 id={titleId}>{label || t('iconPicker.title')}</h3><p>{t('iconPicker.description')}</p></div>
            <button type="button" className="mini-btn" aria-label={t('common.close')} disabled={applying} onClick={closeDialog}><Icon name="close" size={15}/></button>
          </header>
          <label className="vector-icon-search">
            <Icon name="search" size={17}/>
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('iconPicker.search')}
              aria-label={t('iconPicker.searchLabel')}
            />
            {query && <button type="button" aria-label={t('iconPicker.clearSearch')} onClick={() => setQuery('')}><Icon name="close" size={14}/></button>}
          </label>
          <div className="vector-icon-layout">
            <nav className="vector-icon-groups" aria-label={t('iconPicker.categories')}>
              {groups.map(group => <button
                key={group.key}
                type="button"
                className={!normalizedQuery && activeKey === group.key ? 'active' : ''}
                aria-current={!normalizedQuery && activeKey === group.key ? 'true' : undefined}
                onClick={() => { setQuery(''); setActiveKey(group.key); }}
              >
                <span>{groupLabel(group.key)}</span>
                <small>{group.names.length}</small>
              </button>)}
            </nav>
            <div className="vector-icon-results">
              <div className="vector-icon-results-heading">
                <strong>{normalizedQuery ? t('iconPicker.results') : groupLabel(activeKey)}</strong>
                <small>{t('iconPicker.count', { count: visibleNames.length })}</small>
              </div>
              {visibleNames.length ? <div className="vector-icon-sections">
                {visibleSections.map(section => <section className="vector-icon-section" key={section.key}>
                  {showSectionHeadings && <div className="vector-icon-section-heading"><strong>{groupLabel(section.key)}</strong><small>{section.names.length}</small></div>}
                  <div className="vector-icon-grid">
                    {section.names.map(name => {
                      const icon = `icon:${name}`;
                      const meta = ICON_LABELS[name];
                      return <button
                        key={icon}
                        type="button"
                        className={draftValue === icon ? 'active' : ''}
                        aria-pressed={draftValue === icon}
                        aria-label={`${t('iconPicker.select')} ${meta.zh} ${meta.en}`}
                        title={`${meta.zh} · ${meta.en}`}
                        onClick={() => setDraftValue(icon)}
                        onDoubleClick={() => applyValue(icon)}
                      >
                        <span><ContentIcon value={icon} size={22}/></span>
                        <strong>{meta[primaryLanguage]}</strong>
                        <small>{locale === 'en' ? meta.zh : meta.en}</small>
                      </button>;
                    })}
                  </div>
                </section>)}
              </div> : <div className="vector-icon-empty"><Icon name={activeKey === 'recent' && !normalizedQuery ? 'clock' : 'search'} size={24}/><span>{t(activeKey === 'recent' && !normalizedQuery ? 'iconPicker.noRecent' : 'iconPicker.noResults')}</span></div>}
            </div>
          </div>
          {allowCustom && <div className="vector-icon-custom">
            <div><strong>{t('iconPicker.custom')}</strong><small>{t('iconPicker.customHint')}</small></div>
            <div>
              <span><ContentIcon value={isRemoteIcon(draftValue) ? draftValue : 'icon:link'} size={20}/></span>
              <input
                value={isRemoteIcon(draftValue) || !iconName(draftValue) ? draftValue : ''}
                onChange={event => setDraftValue(event.target.value.trim())}
                placeholder="https://example.com/icon.svg"
                aria-label={t('iconPicker.customUrl')}
                maxLength={500}
              />
            </div>
          </div>}
          {applyError && <div className="vector-icon-apply-error error-text">{applyError}</div>}
          <footer className="vector-icon-footer">
            <div className="vector-icon-selection"><span><ContentIcon value={canApply ? draftValue : 'icon:link'} size={21}/></span><div><small>{t('iconPicker.selected')}</small><strong>{ICON_LABELS[iconName(draftValue)]?.[primaryLanguage] || t('iconPicker.custom')}</strong></div></div>
            <button type="button" className="icon-btn" disabled={applying} onClick={closeDialog}>{t('common.cancel')}</button>
            <button type="button" className="icon-btn primary" disabled={!canApply || applying} onClick={() => applyValue(String(draftValue).trim())}><Icon name="check" size={15}/>{t(applying ? 'common.saving' : 'common.confirm')}</button>
          </footer>
        </section>
      </div>,
      document.body,
    )}
  </div>;
}
