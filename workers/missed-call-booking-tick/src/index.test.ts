import { describeTickWorker } from '../../_shared/describeTickWorker';
import worker from './index';

describeTickWorker({
  title: 'missed-call-booking-tick scheduled handler',
  scheduled: (controller, env) => worker.scheduled(controller, env),
  functionName: 'missed-call-booking-worker',
  secretName: 'MISSED_CALL_BOOKING_WORKER_SECRET',
});
