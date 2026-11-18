import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'cloudflare-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise;

function verificationFailure(rawCode) {
  // Only display Cloudflare's bounded public diagnostic code, never arbitrary
  // callback data. See Cloudflare's Turnstile client-side error-code reference.
  const code = /^\d{6}$/.test(String(rawCode)) ? String(rawCode) : '';
  if (code === '110200') {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    return {
      code,
      message: local
        ? 'Security verification is not enabled for this local address. Use shpeosu.com to submit.'
        : 'Security verification is not enabled for this website address. Please let an E-Board member know.',
    };
  }
  if (['110100', '110110', '400020', '400021', '400070'].includes(code)) {
    return { code, message: 'Security verification needs a site configuration update. Please let an E-Board member know.' };
  }
  if (code === '110600' || code === '110620') {
    return { code, message: 'Verification timed out. Please retry.' };
  }
  if (code === '200100') {
    return { code, message: 'Check your device’s date and time, then reload this page and retry verification.' };
  }
  if (code.startsWith('300') || code.startsWith('600')) {
    return { code, message: 'Verification did not complete. Retry, or try another browser if it continues.' };
  }
  return { code, message: 'Verification could not load. Check your connection or content blockers, then retry.' };
}

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
  const [failure, setFailure] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return undefined;

    let cancelled = false;
    setFailure(null);

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token) => {
            if (cancelled) return;
            setFailure(null);
            onTokenRef.current(token);
          },
          'expired-callback': () => { if (!cancelled) onTokenRef.current(''); },
          'error-callback': (code) => {
            if (cancelled) return true;
            onTokenRef.current('');
            setFailure(verificationFailure(code));
            return true;
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailure(verificationFailure());
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
      setFailure(null);
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current('');
    }
  }, [resetKey]);

  const retryVerification = () => {
    setFailure(null);
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
      {failure && (
        <div role="alert" className="space-y-2">
          <p className="text-sm font-bold text-error">
            {failure.message}
          </p>
          {failure.code && <p className="text-xs text-on-surface-variant">Verification code: {failure.code}</p>}
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
