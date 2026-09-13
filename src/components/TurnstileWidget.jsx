import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'cloudflare-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without exposing its API.'));
    };
    const handleError = () => reject(new Error('Turnstile could not be loaded.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    // A failed script never fires load/error again. Remove it before clearing
    // the promise so navigating away and back can create a real retry instead
    // of attaching listeners to a permanently dead element.
    document.getElementById(SCRIPT_ID)?.remove();
    scriptPromise = undefined;
    throw error;
  });

  return scriptPromise;
}

/**
 * Explicit Cloudflare Turnstile widget used immediately before a protected
 * public submission. The token is short-lived and single-use; the parent bumps
 * `resetKey` after any rejected request so a fresh challenge is required.
 */
export default function TurnstileWidget({ siteKey, action, onToken, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return undefined;

    let cancelled = false;
    setLoadFailed(false);

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => {
            onTokenRef.current('');
            setLoadFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      onTokenRef.current('');
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action, loadAttempt]);

  useEffect(() => {
    if (widgetIdRef.current !== null && window.turnstile) {
      setLoadFailed(false);
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current('');
    }
  }, [resetKey]);

  const retryVerification = () => {
    setLoadFailed(false);
    onTokenRef.current('');
    // Re-run the complete mount path. It handles both a failed script download
    // (where no widget exists) and an in-widget error after the script loaded.
    setLoadAttempt((attempt) => attempt + 1);
  };

  if (!siteKey) {
    return (
      <p role="alert" className="text-sm font-bold text-error">
        Submission verification is not configured. Please let an E-Board member know.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="min-h-[65px]" />
      {loadFailed && (
        <div role="alert" className="space-y-2">
          <p className="text-sm font-bold text-error">
            Verification could not load. Disable content blockers for this page, then retry.
          </p>
          <button
            type="button"
            onClick={retryVerification}
            className="text-sm font-bold text-primary underline underline-offset-2"
          >
            Retry verification
          </button>
        </div>
      )}
    </div>
  );
}
