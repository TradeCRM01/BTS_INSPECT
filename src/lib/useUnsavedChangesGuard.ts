import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  bindUnsavedChangesFlush,
  unsavedChangesHint,
  unsavedChangesLeaveCopy,
  unsavedChangesNeedsWarn,
  type UnsavedChangesStatus,
} from './unsavedChangesGuard';

export function useUnsavedChangesGuard(args: {
  status: UnsavedChangesStatus;
  hasPending?: boolean;
  flush: () => void;
}) {
  const shouldWarn = unsavedChangesNeedsWarn(args.status, args.hasPending ?? false);
  const blocker = useBlocker(shouldWarn);
  const flushRef = useRef(args.flush);
  const shouldWarnRef = useRef(shouldWarn);
  flushRef.current = args.flush;
  shouldWarnRef.current = shouldWarn;

  useEffect(() => {
    return bindUnsavedChangesFlush({
      flush: () => flushRef.current(),
      shouldWarn: () => shouldWarnRef.current,
    });
  }, []);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    flushRef.current();
  }, [blocker.state]);

  return {
    hint: unsavedChangesHint(args.status),
    blocked: blocker.state === 'blocked',
    proceed: () => {
      blocker.proceed?.();
    },
    reset: () => {
      blocker.reset?.();
    },
    leaveCopy: unsavedChangesLeaveCopy(),
  };
}
