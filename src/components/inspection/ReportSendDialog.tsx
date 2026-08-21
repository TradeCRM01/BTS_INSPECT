import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import {
  decideReportSend,
  type ReportSendBundle,
  type ReportSendCompany,
  type ReportSendDecision,
} from '../../lib/sendReport';
import { deliverReport, loadReportSendBundle } from '../../lib/sendReportDeliver';

export function ReportSendDialog({
  reportId,
  company,
  onClose,
  onSent,
}: {
  reportId: string;
  company: ReportSendCompany & { id: string };
  onClose: () => void;
  onSent: (to: string, message?: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [bundle, setBundle] = useState<ReportSendBundle | null>(null);
  const [decision, setDecision] = useState<ReportSendDecision | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const loaded = await loadReportSendBundle(reportId, company);
        if (cancelled) return;
        setBundle(loaded);
        setDecision(decideReportSend(loaded));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load this report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // Company identity is the send scope; latest company fields are used on each load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, company.id]);

  const handleSend = async () => {
    if (!decision?.ok) return;
    setSending(true);
    setErr('');
    try {
      const result = await deliverReport({ reportId, company });
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      onSent(result.to, result.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the report.');
    } finally {
      setSending(false);
    }
  };

  const ready = decision?.ok === true;
  const blockerHref = decision && !decision.ok ? decision.href : undefined;
  const blockerMessage = decision && !decision.ok ? decision.message : '';
  const reportLabel = bundle?.report?.report_number
    ? `Report ${bundle.report.report_number}`
    : '';
  const pdfName = ready && decision.ok
    ? (bundle?.existingPdf?.filename ?? decision.filename)
    : '';

  return (
    <Modal open onClose={onClose} size="md">
      <div className="hub-invoice-send">
        <div className="hub-invoice-send-head">
          <div className="min-w-0">
            <h2 className="hub-invoice-send-title">Send report</h2>
            {reportLabel ? <p className="hub-invoice-muted mt-1">{reportLabel}</p> : null}
          </div>
        </div>

        <div className="hub-invoice-send-body">
          {loading && <p className="hub-invoice-muted">Loading send details…</p>}

          {!loading && ready && decision.ok && (
            <>
              <div className="hub-invoice-send-tos">
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">To</p>
                  <p className="hub-invoice-send-value">{decision.to}</p>
                  <p className="hub-invoice-muted">{decision.toName} — already on this job.</p>
                </div>
                <div className="hub-invoice-send-field">
                  <p className="hub-invoice-kicker">SMS To</p>
                  <p className={`hub-invoice-send-value tabular-nums${decision.smsTo ? '' : ' is-miss'}`}>
                    {decision.smsTo || 'No client phone'}
                  </p>
                  {decision.smsTo ? null : (
                    <p className="hub-invoice-muted">{decision.smsMessage}</p>
                  )}
                </div>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">Subject</p>
                <p className="hub-invoice-send-value">{decision.subject}</p>
              </div>
              <div className="hub-invoice-send-field">
                <p className="hub-invoice-kicker">PDF</p>
                <p className="hub-invoice-pdf">{pdfName}</p>
              </div>
            </>
          )}

          {!loading && !ready && (
            <p className="text-sm text-fail">{blockerMessage || err || 'This report cannot be sent yet.'}</p>
          )}

          {err && ready && <p className="text-sm text-fail">{err}</p>}
        </div>

        <div className="hub-invoice-send-foot">
          <button type="button" onClick={onClose} className="ops-link shrink-0">
            Cancel
          </button>
          {ready && (
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="btn-primary">
              {sending ? 'Sending…' : 'Send report'}
            </button>
          )}
          {!ready && blockerHref && !loading && (
            <Link to={blockerHref} className="btn-primary" onClick={onClose}>
              {decision && !decision.ok && decision.blocker === 'no_smtp' ? 'Company settings' : 'Open client'}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
