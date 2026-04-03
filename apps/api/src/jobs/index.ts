import { triageQueue, followupQueue, escalationQueue, automationQueue, createWorker } from './queue';
import { processTriageJob } from './processors/triage.processor';
import { processFollowupJob } from './processors/followup.processor';
import { processEscalationJob } from './processors/escalation.processor';
import { processAutomationJob } from './processors/automation.processor';

export async function startJobWorkers(): Promise<void> {
  createWorker('triage', processTriageJob);
  createWorker('followup', processFollowupJob);
  createWorker('escalation', processEscalationJob);
  createWorker('automation', processAutomationJob);

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

  console.log('[jobs] All workers started');
}
