"use client";
import { useEffect, useRef, useState } from "react";
import { isQcPresentationFresh, qcPresentation, subscribeQcChanges, type QcPresentation } from "./qc-client-state";

export function useQcVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      const laidOut = entry.boundingClientRect.width > 0;
      setNear(entry.isIntersecting && laidOut);
      // Keep discovered rows mounted when they cross the prefetch boundary.
      // A CSS-hidden desktop/mobile branch must still release its consumers.
      setVisible(previous => laidOut && (previous || entry.isIntersecting));
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, visible, near };
}

export function useQcPresentation(scope: string, purchaseId: string, itemId: string, enabled: boolean, near = enabled) {
  const [result, setResult] = useState<{ key: string; value: QcPresentation } | null>(null);
  const key = JSON.stringify([scope, purchaseId, itemId]);
  useEffect(() => subscribeQcChanges(() => setResult(null)), []);
  useEffect(() => {
    if (!enabled || !near) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, loading = false, sequence = 0;
    const load = () => {
      if (!active || loading) return;
      loading = true;
      const current = ++sequence;
      if (timer) clearTimeout(timer);
      const entry = qcPresentation(scope, purchaseId, itemId);
      // An expired entry cannot recreate photos from an unvalidated Blob.
      if (!entry.value) setResult(null);
      void entry.promise.then(value => {
        if (!active || current !== sequence) return;
        loading = false; setResult({ key, value });
        timer = setTimeout(load, Math.max(1, entry.expiresAt - Date.now()));
      }).catch(() => { if (active && current === sequence) { loading = false; setResult(null); } });
    };
    load();
    const unsubscribe = subscribeQcChanges(() => { loading = false; load(); });
    window.addEventListener("focus", load);
    return () => { active = false; if (timer) clearTimeout(timer); unsubscribe(); window.removeEventListener("focus", load); };
  }, [enabled, itemId, key, near, purchaseId, scope]);
  return enabled && result?.key === key && (!near || isQcPresentationFresh(scope, purchaseId, itemId, result.value)) ? result.value : null;
}
