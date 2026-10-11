import { describeTickWorker } from '../../_shared/describeTickWorker';
import worker from './index';

describeTickWorker({
  title: 'missed-call-sms-tick scheduled handler',
  scheduled: (controller, env) => worker.scheduled(controller, env),
  functionName: 'missed-call-sms-worker',
  secretName: 'MISSED_CALL_SMS_WORKER_SECRET',
});
