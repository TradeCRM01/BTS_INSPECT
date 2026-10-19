import { useEffect, useRef, type MutableRefObject } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  bindUnsavedChangesFlush,
  unsavedChangesHint,
  unsavedChangesLeaveCopy,
  unsavedChangesNeedsWarn,
  unsavedChangesShouldFlush,
  type UnsavedChangesStatus,
  type UnsavedFlushOpts,
} from './unsavedChangesGuard';

export function useUnsavedChangesGuard(args: {
  status: UnsavedChangesStatus;
  hasPending?: boolean;
  flush: (opts?: UnsavedFlushOpts) => void;
  allowLeaveRef: MutableRefObject<boolean>;
}) {
  const allowLeaveRef = args.allowLeaveRef;
  const flushRef = useRef(args.flush);
  const statusRef = useRef(args.status);
  const hasPendingRef = useRef(args.hasPending ?? false);
  flushRef.current = args.flush;
  statusRef.current = args.status;
  hasPendingRef.current = args.hasPending ?? false;

  useEffect(() => {
    if (unsavedChangesShouldFlush(args.status, args.hasPending ?? false)) {
      allowLeaveRef.current = false;
    }
  }, [args.status, args.hasPending, allowLeaveRef]);

  const blocker = useBlocker(() => {
    if (allowLeaveRef.current) return false;
    return unsavedChangesNeedsWarn(statusRef.current, hasPendingRef.current);
  });

  useEffect(() => {
    return bindUnsavedChangesFlush({
      flush: opts => flushRef.current(opts),
      shouldWarn: () => (
        !allowLeaveRef.current
        && unsavedChangesNeedsWarn(statusRef.current, hasPendingRef.current)
      ),
      shouldFlush: () => unsavedChangesShouldFlush(statusRef.current, hasPendingRef.current),
    });
  }, [allowLeaveRef]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (!unsavedChangesShouldFlush(statusRef.current, hasPendingRef.current)) return;
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
    allowLeave: () => {
      allowLeaveRef.current = true;
    },
    leaveCopy: unsavedChangesLeaveCopy(),
  };
}
