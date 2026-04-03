import { triageQueue, followupQueue, escalationQueue, automationQueue, digestQueue, createWorker } from './queue';
import { processTriageJob } from './processors/triage.processor';
import { processFollowupJob } from './processors/followup.processor';
import { processEscalationJob } from './processors/escalation.processor';
import { processAutomationJob } from './processors/automation.processor';
import { processDigestJob } from './processors/digest.processor';

export async function startJobWorkers(): Promise<void> {
  createWorker('triage', processTriageJob);
  createWorker('followup', processFollowupJob);
  createWorker('escalation', processEscalationJob);
  createWorker('automation', processAutomationJob);
  createWorker('digest', processDigestJob);

  // Register repeatable jobs (idempotent — BullMQ deduplicates by jobId)
  await followupQueue.add('followup-scan', {}, {
    repeat: { every: parseInt(process.env.FOLLOWUP_INTERVAL_HOURS ?? '4') * 3600 * 1000 },
    jobId: 'followup-repeatable',
  });

  await escalationQueue.add('escalation-sla-check', {}, {
    repeat: { every: 3600 * 1000 },
    jobId: 'escalation-sla-repeatable',
  });

  await automationQueue.add('automation-detect', {}, {
    repeat: { pattern: process.env.AUTOMATION_ANALYSIS_CRON ?? '0 6 * * 1' },
    jobId: 'automation-weekly-repeatable',
  });

  await digestQueue.add('daily-digest', {}, {
    repeat: { pattern: '0 8 * * *' },
    jobId: 'digest-daily-repeatable',
  });

  console.log('[jobs] All workers started');
}
