import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EDGE_GAP = 8;

export default function ContextMenu({ x, y, onClose, label, children }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left:x, top:y, ready:false });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(EDGE_GAP, Math.min(x, window.innerWidth - rect.width - EDGE_GAP));
    const top = Math.max(EDGE_GAP, Math.min(y, window.innerHeight - rect.height - EDGE_GAP));
    setPosition({ left, top, ready:true });
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();

    const outside = event => {
      if (!menu.contains(event.target)) onClose();
    };
    const close = () => onClose();
    const keydown = event => {
      const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + offset + items.length) % items.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items.at(-1)?.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', keydown);
    };
  }, [onClose, x, y]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="resource-context-menu"
      style={{ left:position.left, top:position.top, visibility:position.ready ? 'visible' : 'hidden' }}
      onContextMenu={event => event.preventDefault()}
      onClick={event => event.target.closest('[data-context-action]') && onClose()}
    >
      {children}
    </div>,
    document.body,
  );
}
