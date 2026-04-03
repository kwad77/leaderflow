import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { protect } from '../middleware/auth';
import * as orgService from '../services/org.service';

const router = Router();

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}

type MemberInput = {
  name: string;
  email: string;
  role: string;
  managerEmail: string | null;
};

function parseCSV(raw: string): { members: MemberInput[]; errors: string[] } {
  const lines = raw.split(/\r?\n/);
  const errors: string[] = [];
  const members: MemberInput[] = [];

  let headerMap: Record<string, number> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip blank lines and comment lines
    if (!line || line.startsWith('#')) continue;

    if (headerMap === null) {
      // First non-blank, non-comment line is the header
      const cols = parseCSVLine(line).map((c) => c.toLowerCase());
      headerMap = {};
      for (let j = 0; j < cols.length; j++) {
        headerMap[cols[j]] = j;
      }
      const required = ['name', 'email', 'role'];
      for (const req of required) {
        if (!(req in headerMap)) {
          errors.push(`CSV is missing required header: "${req}"`);
        }
      }
      if (errors.length > 0) {
        // Can't continue without valid headers
        return { members, errors };
      }
      continue;
    }

    const cols = parseCSVLine(line);
    const name = cols[headerMap['name']] ?? '';
    const email = cols[headerMap['email']] ?? '';
    const role = cols[headerMap['role']] ?? '';
    const managerEmailRaw =
      'manageremail' in headerMap ? (cols[headerMap['manageremail']] ?? '') : '';
    const managerEmail = managerEmailRaw.trim() || null;

    members.push({ name, email, role, managerEmail });
  }

  return { members, errors };
}

// ─── Shared import logic ──────────────────────────────────────────────────────

async function importMembers(
  members: MemberInput[],
  orgId: string
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Pass 1: validate and upsert each member; build email → memberId map
  const emailToId = new Map<string, string>();

  for (let i = 0; i < members.length; i++) {
    const { name, email, role } = members[i];
    const rowLabel = `Row ${i + 1}`;

    if (!name || !name.trim()) {
      errors.push(`${rowLabel}: missing name`);
      skipped++;
      continue;
    }
    if (!email || !email.trim()) {
      errors.push(`${rowLabel}: missing email`);
      skipped++;
      continue;
    }
    if (!role || !role.trim()) {
      errors.push(`${rowLabel}: missing role (email: ${email})`);
      skipped++;
      continue;
    }

    const existing = await prisma.member.findFirst({
      where: { email: email.trim(), orgId },
    });

    if (existing) {
      await prisma.member.update({
        where: { id: existing.id },
        data: { name: name.trim(), role: role.trim() },
      });
      emailToId.set(email.trim().toLowerCase(), existing.id);
      updated++;
    } else {
      const newMember = await prisma.member.create({
        data: { name: name.trim(), email: email.trim(), role: role.trim(), orgId },
      });
      emailToId.set(email.trim().toLowerCase(), newMember.id);
      created++;
    }
  }

  // Pass 2: set parentId for members that have a managerEmail
  for (const member of members) {
    if (!member.managerEmail) continue;

    const memberId = emailToId.get(member.email.trim().toLowerCase());
    if (!memberId) continue; // was skipped in pass 1

    const managerId = emailToId.get(member.managerEmail.trim().toLowerCase());
    if (!managerId) {
      errors.push(
        `Member "${member.email}": managerEmail "${member.managerEmail}" not found in import set`
      );
      continue;
    }

    await prisma.member.update({
      where: { id: memberId },
      data: { parentId: managerId },
    });
  }

  return { created, updated, skipped, errors };
}

// ─── POST /api/import/csv ─────────────────────────────────────────────────────

router.post('/csv', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let rawCSV: string;

    const contentType = (req.headers['content-type'] ?? '').toLowerCase();

    if (contentType.includes('text/csv')) {
      // Raw text body — express.text() must be registered or we read from express.json fallback
      // express.urlencoded + express.text both parse the body; fall back to req.body as string
      rawCSV = typeof req.body === 'string' ? req.body : req.body?.toString?.() ?? '';
    } else {
      // application/json with { csv: "..." }
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body.csv !== 'string') {
        res.status(400).json({ error: 'Expected JSON body with a "csv" string field, or Content-Type: text/csv' });
        return;
      }
      rawCSV = body.csv;
    }

    if (!rawCSV.trim()) {
      res.status(400).json({ error: 'CSV content is empty' });
      return;
    }

    const { members, errors: parseErrors } = parseCSV(rawCSV);

    if (parseErrors.some((e) => e.startsWith('CSV is missing required header'))) {
      res.status(400).json({ error: parseErrors[0] });
      return;
    }

    if (members.length === 0) {
      res.status(400).json({ error: 'No data rows found in CSV' });
      return;
    }

    const org = await orgService.getFirstOrg();
    const result = await importMembers(members, org.id);

    // Merge any header-level parse errors into result errors
    res.json({ ...result, errors: [...parseErrors, ...result.errors] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/import/json ────────────────────────────────────────────────────

const importJSONSchema = z.object({
  members: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().min(1),
      role: z.string().min(1),
      managerEmail: z.string().nullable().optional(),
    })
  ).min(1),
});

router.post('/json', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = importJSONSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: `Invalid request body: ${message}` });
      return;
    }

    const members: MemberInput[] = parsed.data.members.map((m) => ({
      name: m.name,
      email: m.email,
      role: m.role,
      managerEmail: m.managerEmail ?? null,
    }));

    const org = await orgService.getFirstOrg();
    const result = await importMembers(members, org.id);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/import/template ─────────────────────────────────────────────────

router.get('/template', protect, (_req: Request, res: Response) => {
  const template = [
    'name,email,role,managerEmail',
    '# Fill in your team below. Leave managerEmail blank for the root (CEO/top of org).',
    '# Example:',
    'Sarah Chen,sarah@company.com,CEO,',
    'Marcus Webb,marcus@company.com,VP Engineering,sarah@company.com',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leaderflow-import-template.csv"');
  res.send(template);
});

export default router;
