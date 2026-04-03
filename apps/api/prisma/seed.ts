import { PrismaClient, WorkItemType, WorkItemStatus, Priority } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Idempotency guard: if Acme Corp already exists, only update settings and exit
  const existing = await prisma.organization.findFirst({ where: { name: 'Acme Corp' } });
  if (existing) {
    console.log('Seed data already exists, updating settings only...');
    await prisma.organization.update({
      where: { id: existing.id },
      data: {
        settings: {
          staleThresholdHours: 48,
          atRiskHoursBeforeDue: 24,
          slaByPriority: { LOW: 168, MEDIUM: 72, HIGH: 24, URGENT: 4 },
        },
      },
    });
    console.log('Settings updated. Exiting.');
    process.exit(0);
  }

  // Clean existing data
  await prisma.workItemUpdate.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.member.deleteMany();
  await prisma.organization.deleteMany();

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
    },
  });

  // Apply org settings
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      settings: {
        staleThresholdHours: 48,
        atRiskHoursBeforeDue: 24,
        slaByPriority: { LOW: 168, MEDIUM: 72, HIGH: 24, URGENT: 4 },
      },
    },
  });

  console.log(`  Created org: ${org.name} (${org.id})`);

  // Create CEO
  const sarah = await prisma.member.create({
    data: {
      name: 'Sarah Chen',
      email: 'sarah.chen@acme.com',
      role: 'Chief Executive Officer',
      orgId: org.id,
      parentId: null,
    },
  });

  // Create VPs
  const marcus = await prisma.member.create({
    data: {
      name: 'Marcus Thompson',
      email: 'marcus.thompson@acme.com',
      role: 'VP Engineering',
      orgId: org.id,
      parentId: sarah.id,
    },
  });

  const priya = await prisma.member.create({
    data: {
      name: 'Priya Patel',
      email: 'priya.patel@acme.com',
      role: 'VP Product',
      orgId: org.id,
      parentId: sarah.id,
    },
  });

  // Engineers under Marcus
  const alex = await prisma.member.create({
    data: {
      name: 'Alex Rivera',
      email: 'alex.rivera@acme.com',
      role: 'Senior Engineer',
      orgId: org.id,
      parentId: marcus.id,
    },
  });

  const jamie = await prisma.member.create({
    data: {
      name: 'Jamie Kim',
      email: 'jamie.kim@acme.com',
      role: 'Engineer',
      orgId: org.id,
      parentId: marcus.id,
    },
  });

  // PMs under Priya
  const david = await prisma.member.create({
    data: {
      name: 'David Park',
      email: 'david.park@acme.com',
      role: 'Senior Product Manager',
      orgId: org.id,
      parentId: priya.id,
    },
  });

  const emma = await prisma.member.create({
    data: {
      name: 'Emma Walsh',
      email: 'emma.walsh@acme.com',
      role: 'Product Manager',
      orgId: org.id,
      parentId: priya.id,
    },
  });

  console.log(`  Created 7 members`);

  // Notification preferences on Marcus and Emma
  await prisma.member.update({
    where: { id: marcus.id },
    data: {
      metadata: {
        notifications: {
          emailDigest: 'daily',
          emailDigestTime: '08:00',
          slackDm: true,
          notifyOn: {
            newAssignment: true,
            escalation: true,
            overdue: true,
            atRisk: false,
            aiSuggestion: false,
          },
        },
      },
    },
  });

  await prisma.member.update({
    where: { id: emma.id },
    data: {
      metadata: {
        notifications: {
          emailDigest: 'weekly',
          emailDigestTime: '09:00',
          slackDm: false,
          notifyOn: {
            newAssignment: true,
            escalation: true,
            overdue: true,
            atRisk: true,
            aiSuggestion: true,
          },
        },
      },
    },
  });

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  // -----------------------------------------------------------------------
  // INGRESS items for Sarah (new, unprocessed)
  // -----------------------------------------------------------------------
  const ingress1 = await prisma.workItem.create({
    data: {
      title: 'Board deck review request from investor',
      description: 'Sequoia Capital requesting Q1 board deck review before Friday. Need CEO sign-off.',
      type: WorkItemType.INGRESS,
      status: WorkItemStatus.PENDING,
      priority: Priority.URGENT,
      orgId: org.id,
      toMemberId: sarah.id,
      fromExternal: 'board@sequoiacap.com',
      source: 'email',
      createdAt: hoursAgo(2),
    },
  });

  const ingress2 = await prisma.workItem.create({
    data: {
      title: 'Partnership inquiry from TechCorp',
      description: 'TechCorp wants to explore a strategic partnership. Initial meeting proposed.',
      type: WorkItemType.INGRESS,
      status: WorkItemStatus.PENDING,
      priority: Priority.HIGH,
      orgId: org.id,
      toMemberId: sarah.id,
      fromExternal: 'partnerships@techcorp.io',
      source: 'email',
      createdAt: hoursAgo(6),
    },
  });

  const ingress3 = await prisma.workItem.create({
    data: {
      title: 'Press inquiry: Q1 growth metrics',
      description: 'TechCrunch requesting comment on reported 40% growth. Response needed within 24h.',
      type: WorkItemType.INGRESS,
      status: WorkItemStatus.ACKNOWLEDGED,
      priority: Priority.MEDIUM,
      orgId: org.id,
      toMemberId: sarah.id,
      fromExternal: 'reporter@techcrunch.com',
      source: 'email',
      acknowledgedAt: hoursAgo(1),
      createdAt: hoursAgo(8),
    },
  });

  // -----------------------------------------------------------------------
  // ESCALATION items bubbling up
  // -----------------------------------------------------------------------
  const escalation1 = await prisma.workItem.create({
    data: {
      title: 'Production outage: payment service down',
      description: 'Payment service has been degraded for 45 minutes. Alex needs VP sign-off to roll back deployment.',
      type: WorkItemType.ESCALATION,
      status: WorkItemStatus.IN_PROGRESS,
      priority: Priority.URGENT,
      orgId: org.id,
      fromMemberId: alex.id,
      toMemberId: marcus.id,
      source: 'internal',
      createdAt: hoursAgo(1),
    },
  });

  const escalation2 = await prisma.workItem.create({
    data: {
      title: 'Critical bug in v2.4 release blocking launch',
      description: 'Found a data corruption bug in the migration script. Cannot ship v2.4 without fix or waiver.',
      type: WorkItemType.ESCALATION,
      status: WorkItemStatus.PENDING,
      priority: Priority.HIGH,
      orgId: org.id,
      fromMemberId: marcus.id,
      toMemberId: sarah.id,
      source: 'internal',
      createdAt: hoursAgo(4),
    },
  });

  // -----------------------------------------------------------------------
  // DELEGATION items flowing down
  // -----------------------------------------------------------------------
  const delegation1 = await prisma.workItem.create({
    data: {
      title: 'Prepare Q2 engineering roadmap',
      description: 'Board wants Q2 roadmap aligned with company strategy. Need engineering perspective.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      orgId: org.id,
      fromMemberId: sarah.id,
      toMemberId: marcus.id,
      dueAt: daysFromNow(7),
      source: 'internal',
      createdAt: daysAgo(2),
    },
  });

  const delegation2 = await prisma.workItem.create({
    data: {
      title: 'Hire two backend engineers by end of quarter',
      description: 'Approved HC for 2 senior backend engineers. Start pipeline immediately.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.ACKNOWLEDGED,
      priority: Priority.HIGH,
      orgId: org.id,
      fromMemberId: sarah.id,
      toMemberId: marcus.id,
      dueAt: daysFromNow(60),
      acknowledgedAt: daysAgo(1),
      source: 'internal',
      createdAt: daysAgo(3),
    },
  });

  const delegation3 = await prisma.workItem.create({
    data: {
      title: 'Define OKRs for product team Q2',
      description: 'Priya to define product OKRs aligned with Q2 company goals.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.ON_TRACK,
      priority: Priority.MEDIUM,
      orgId: org.id,
      fromMemberId: sarah.id,
      toMemberId: priya.id,
      dueAt: daysFromNow(5),
      acknowledgedAt: daysAgo(2),
      source: 'internal',
      createdAt: daysAgo(4),
    },
  });

  // -----------------------------------------------------------------------
  // AT_RISK item — demonstrates SLA badge (due in 2 hours)
  // -----------------------------------------------------------------------
  const atRisk1 = await prisma.workItem.create({
    data: {
      title: 'Finalize security audit report for compliance review',
      description: 'Compliance team requires the security audit report before the board meeting today. Deadline is approaching.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.AT_RISK,
      priority: Priority.HIGH,
      orgId: org.id,
      fromMemberId: marcus.id,
      toMemberId: alex.id,
      dueAt: hoursFromNow(2),
      acknowledgedAt: daysAgo(1),
      source: 'internal',
      createdAt: daysAgo(3),
    },
  });

  // -----------------------------------------------------------------------
  // OVERDUE item — dueAt in the past
  // -----------------------------------------------------------------------
  const overdue1 = await prisma.workItem.create({
    data: {
      title: 'Migrate legacy auth system to OAuth2',
      description: 'Critical security upgrade. Auth system migration was due last week.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.OVERDUE,
      priority: Priority.URGENT,
      orgId: org.id,
      fromMemberId: marcus.id,
      toMemberId: jamie.id,
      dueAt: daysAgo(2),
      acknowledgedAt: daysAgo(7),
      source: 'internal',
      createdAt: daysAgo(10),
    },
  });

  // -----------------------------------------------------------------------
  // STALE item — no update in 3+ days
  // -----------------------------------------------------------------------
  const stale1 = await prisma.workItem.create({
    data: {
      title: 'User research synthesis for mobile onboarding',
      description: "Emma to synthesize user research from last month's mobile onboarding interviews.",
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.STALE,
      priority: Priority.MEDIUM,
      orgId: org.id,
      fromMemberId: priya.id,
      toMemberId: emma.id,
      dueAt: daysFromNow(3),
      acknowledgedAt: daysAgo(5),
      source: 'internal',
      createdAt: daysAgo(8),
    },
  });

  // -----------------------------------------------------------------------
  // COMPLETED items — gives metrics dashboard real data
  // -----------------------------------------------------------------------
  const completed1 = await prisma.workItem.create({
    data: {
      title: 'Launch redesigned onboarding flow',
      description: 'Ship the new onboarding flow to 100% of new users. A/B test complete; winner selected.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.COMPLETED,
      priority: Priority.HIGH,
      orgId: org.id,
      fromMemberId: priya.id,
      toMemberId: david.id,
      dueAt: daysAgo(1),
      acknowledgedAt: daysAgo(10),
      completedAt: daysAgo(1),
      source: 'internal',
      createdAt: daysAgo(14),
    },
  });

  const completed2 = await prisma.workItem.create({
    data: {
      title: 'Patch CVE-2024-1234 in API gateway',
      description: 'Critical vulnerability in the API gateway dependency. Patched and deployed to production.',
      type: WorkItemType.ESCALATION,
      status: WorkItemStatus.COMPLETED,
      priority: Priority.URGENT,
      orgId: org.id,
      fromMemberId: alex.id,
      toMemberId: marcus.id,
      acknowledgedAt: daysAgo(5),
      completedAt: daysAgo(4),
      source: 'internal',
      createdAt: daysAgo(6),
    },
  });

  // -----------------------------------------------------------------------
  // AI-suggested item — demonstrates triage modal
  // -----------------------------------------------------------------------
  const aiSuggested1 = await prisma.workItem.create({
    data: {
      title: 'Unexpected spike in API error rate — investigate root cause',
      description: 'Error rate jumped from 0.2% to 4.8% over the last hour. Affects checkout and profile endpoints.',
      type: WorkItemType.INGRESS,
      status: WorkItemStatus.PENDING,
      priority: Priority.MEDIUM,
      orgId: org.id,
      toMemberId: sarah.id,
      fromExternal: 'monitoring@pagerduty.com',
      source: 'pagerduty',
      aiSuggestedPriority: 'HIGH',
      aiSuggestedOwner: marcus.id,
      aiRationale:
        'Error pattern matches infrastructure-layer failures. Marcus owns the platform team and resolved the last two similar incidents. Recommend upgrading priority to HIGH and routing directly to him.',
      createdAt: hoursAgo(0.5),
    },
  });

  console.log(`  Created 15 work items`);
  console.log('  - 3 INGRESS items for Sarah (incl. 1 with AI suggestion)');
  console.log('  - 2 ESCALATION items (Alex->Marcus, Marcus->Sarah)');
  console.log('  - 3 DELEGATION items (Sarah->Marcus x2, Sarah->Priya)');
  console.log('  - 1 AT_RISK item (Alex, due in 2h) — SLA badge demo');
  console.log('  - 1 OVERDUE item (Jamie)');
  console.log('  - 1 STALE item (Emma)');
  console.log('  - 2 COMPLETED items — metrics dashboard data');

  // -----------------------------------------------------------------------
  // WorkItemUpdate activity history
  // -----------------------------------------------------------------------
  await prisma.workItemUpdate.createMany({
    data: [
      // Escalation 1: payment outage
      {
        itemId: escalation1.id,
        authorId: alex.id,
        note: 'Identified root cause: bad deploy at 14:30. Rollback ready but needs approval.',
        createdAt: hoursAgo(0.5),
      },
      // Delegation 1: Q2 roadmap
      {
        itemId: delegation1.id,
        authorId: marcus.id,
        note: 'Started drafting with tech leads. 60% complete.',
        createdAt: daysAgo(1),
      },
      // Delegation 3: OKRs
      {
        itemId: delegation3.id,
        authorId: priya.id,
        note: 'Draft OKRs shared with team. Awaiting feedback from David and Emma.',
        createdAt: daysAgo(1),
      },
      // AT_RISK item: security audit
      {
        itemId: atRisk1.id,
        authorId: alex.id,
        note: 'Reviewed with team, need more context on the network segmentation findings.',
        createdAt: hoursAgo(2),
      },
      {
        itemId: atRisk1.id,
        authorId: marcus.id,
        note: 'Escalated to Sarah per protocol — deadline is today.',
        statusChange: 'ESCALATION',
        createdAt: hoursAgo(4),
      },
      // Overdue item: legacy auth
      {
        itemId: overdue1.id,
        authorId: jamie.id,
        note: 'Blocked on IdP configuration access. Waiting on IT provisioning.',
        createdAt: daysAgo(4),
      },
      // Completed 1: onboarding flow
      {
        itemId: completed1.id,
        authorId: david.id,
        note: 'Shipped to 100% of new users. Activation rate up 12% vs control.',
        statusChange: 'COMPLETED',
        createdAt: daysAgo(1),
      },
    ],
  });

  console.log(`  Created 7 work item updates`);

  // -----------------------------------------------------------------------
  // Automation rules
  // -----------------------------------------------------------------------
  await prisma.automationRule.createMany({
    data: [
      {
        orgId: org.id,
        name: 'Auto-route security issues',
        description: 'Delegate items mentioning security to the security lead',
        type: 'routing_rule',
        condition: { titleContains: 'security' },
        action: { type: 'delegate', toMemberId: marcus.id },
        enabled: true,
      },
      {
        orgId: org.id,
        name: 'Flag urgent ingress',
        description: 'Mark URGENT any new ingress items',
        type: 'status_update',
        condition: { type: 'INGRESS', priority: 'URGENT' },
        action: { type: 'updateStatus', status: 'IN_PROGRESS' },
        enabled: false, // disabled by default — users enable it
      },
    ],
  });

  console.log(`  Created 2 automation rules`);

  // -----------------------------------------------------------------------
  // Integration stub
  // -----------------------------------------------------------------------
  await prisma.integration.create({
    data: {
      orgId: org.id,
      type: 'slack',
      config: { workspaceId: 'T0DEMO', webhookUrl: '' },
      enabled: false,
    },
  });

  console.log('Seed complete!');
  console.log(`\nSummary:`);
  console.log(`   Org ID:  ${org.id}`);
  console.log(`   CEO:     Sarah Chen (${sarah.id})`);
  console.log(`   VP Eng:  Marcus Thompson (${marcus.id})`);
  console.log(`   VP Prod: Priya Patel (${priya.id})`);
  console.log(`   Eng:     Alex Rivera (${alex.id})`);
  console.log(`   Eng:     Jamie Kim (${jamie.id})`);
  console.log(`   PM:      David Park (${david.id})`);
  console.log(`   PM:      Emma Walsh (${emma.id})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
