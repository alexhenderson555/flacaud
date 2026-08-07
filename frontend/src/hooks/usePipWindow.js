import { useCallback, useEffect, useRef, useState } from 'react';

/** Copies the opener document's stylesheets into a Document Picture-in-Picture
 * window -- a PiP window is a genuinely separate document/realm and inherits
 * NONE of the opener's CSS, so without this the portaled content would render
 * completely unstyled. Same-origin sheets get their rules copied inline
 * (works even for Vite's injected <style> tags); anything that throws on
 * `.cssRules` (a cross-origin stylesheet) is re-linked instead. */
function copyStylesInto(targetDoc) {
  for (const styleSheet of document.styleSheets) {
    try {
      const rules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('\n');
      const style = targetDoc.createElement('style');
      style.textContent = rules;
      targetDoc.head.appendChild(style);
    } catch {
      if (styleSheet.href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = styleSheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  }
}

/**
 * Wraps the Document Picture-in-Picture API (Chrome/Edge 116+ only --
 * `'documentPictureInPicture' in window` is the feature check). Unlike the
 * classic video-element PiP, this opens a real floating browser window that
 * can host arbitrary DOM/React content, so the mini player keeps its actual
 * buttons instead of a canvas-drawn video hack.
 */
export function usePipWindow({ width = 340, height = 170 } = {}) {
  const [pipWindow, setPipWindow] = useState(null);
  const pipWindowRef = useRef(null);
  const isSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const closePip = useCallback(() => {
    pipWindowRef.current?.close();
  }, []);

  const openPip = useCallback(async () => {
    if (!isSupported) return null;
    if (pipWindowRef.current) return pipWindowRef.current;
    const win = await window.documentPictureInPicture.requestWindow({ width, height });
    copyStylesInto(win.document);
    win.document.documentElement.setAttribute(
      'data-theme',
      document.documentElement.getAttribute('data-theme') || '',
    );
    win.document.body.style.margin = '0';
    win.document.body.style.overflow = 'hidden';
    win.document.title = 'FlacAud';
    pipWindowRef.current = win;
    setPipWindow(win);
    // Fires when the user closes the PiP window directly (its own close
    // button), not just when we call closePip() ourselves.
    win.addEventListener('pagehide', () => {
      pipWindowRef.current = null;
      setPipWindow(null);
    }, { once: true });
    return win;
  }, [isSupported, width, height]);

  // Close the PiP window if the component using this hook unmounts (e.g.
  // navigating away in a way that tears down the player chrome entirely).
  useEffect(() => () => { pipWindowRef.current?.close(); }, []);

  return { pipWindow, isSupported, isOpen: Boolean(pipWindow), openPip, closePip };
}
