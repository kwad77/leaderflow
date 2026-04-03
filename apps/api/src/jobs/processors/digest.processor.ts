import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import * as orgService from '../../services/org.service';

export async function processDigestJob(_job: Job): Promise<void> {
  const org = await orgService.getFirstOrg();

  // Find members with daily digest enabled
  const members = await prisma.member.findMany({
    where: { orgId: org.id },
  });

  const now = new Date();
  const digestMembers = members.filter((m) => {
    const prefs = (m.metadata as any)?.notifications;
    return prefs?.emailDigest === 'daily' || (!prefs && true); // default is daily
  });

  for (const member of digestMembers) {
    // Find their overdue/at-risk/pending items
    const items = await prisma.workItem.findMany({
      where: {
        orgId: org.id,
        toMemberId: member.id,
        status: { in: ['PENDING', 'AT_RISK', 'OVERDUE', 'STALE'] },
      },
    });

    if (items.length === 0) continue;

    // Log the digest (real implementation would send email via nodemailer/sendgrid)
    logger.info(
      {
        event: 'digest',
        memberId: member.id,
        memberEmail: member.email,
        itemCount: items.length,
        overdueCount: items.filter((i) => i.status === 'OVERDUE').length,
      },
      `[digest] Would send ${items.length} items to ${member.email}`
    );
  }

  logger.info(`[digest] Processed ${digestMembers.length} members`);
}
