import { PrismaClient, WorkItemType, WorkItemStatus, Priority } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.workItemUpdate.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.member.deleteMany();
  await prisma.organization.deleteMany();

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
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

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  // 3 INGRESS items for Sarah (new, unprocessed)
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

  // 2 ESCALATION items bubbling up
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

  await prisma.workItemUpdate.create({
    data: {
      itemId: escalation1.id,
      authorId: alex.id,
      note: 'Identified root cause: bad deploy at 14:30. Rollback ready but needs approval.',
      createdAt: hoursAgo(0.5),
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

  // 3 DELEGATION items flowing down
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
      dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      source: 'internal',
      createdAt: daysAgo(2),
    },
  });

  await prisma.workItemUpdate.create({
    data: {
      itemId: delegation1.id,
      authorId: marcus.id,
      note: 'Started drafting with tech leads. 60% complete.',
      createdAt: daysAgo(1),
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
      dueAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
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
      dueAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      acknowledgedAt: daysAgo(2),
      source: 'internal',
      createdAt: daysAgo(4),
    },
  });

  await prisma.workItemUpdate.create({
    data: {
      itemId: delegation3.id,
      authorId: priya.id,
      note: 'Draft OKRs shared with team. Awaiting feedback from David and Emma.',
      createdAt: daysAgo(1),
    },
  });

  // 1 AT_RISK item (due date in the past)
  const atRisk1 = await prisma.workItem.create({
    data: {
      title: 'Migrate legacy auth system to OAuth2',
      description: 'Critical security upgrade. Auth system migration was due last week.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.AT_RISK,
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

  // 1 STALE item (no update in 3+ days)
  const stale1 = await prisma.workItem.create({
    data: {
      title: 'User research synthesis for mobile onboarding',
      description: 'Emma to synthesize user research from last month\'s mobile onboarding interviews.',
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.STALE,
      priority: Priority.MEDIUM,
      orgId: org.id,
      fromMemberId: priya.id,
      toMemberId: emma.id,
      dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      acknowledgedAt: daysAgo(5),
      source: 'internal',
      createdAt: daysAgo(8),
    },
  });

  console.log(`  Created 10 work items`);
  console.log('  - 3 INGRESS items for Sarah');
  console.log('  - 2 ESCALATION items (Alex→Marcus, Marcus→Sarah)');
  console.log('  - 3 DELEGATION items (Sarah→Marcus x2, Sarah→Priya)');
  console.log('  - 1 AT_RISK item (Jamie, overdue)');
  console.log('  - 1 STALE item (Emma, no updates)');

  // Add an integration stub
  await prisma.integration.create({
    data: {
      orgId: org.id,
      type: 'slack',
      config: { workspaceId: 'T0DEMO', webhookUrl: '' },
      enabled: false,
    },
  });

  console.log('✅ Seed complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   Org ID: ${org.id}`);
  console.log(`   CEO: Sarah Chen (${sarah.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
