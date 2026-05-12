import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getUserTeamIds } from '../services/team-scope';
import { prisma } from '@openlinear/db';

describe('Team Scope', () => {
  let userId: string;
  let teamId1: string;
  let teamId2: string;

  beforeEach(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.projectTeam.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({ where: { username: { startsWith: 'teamscope' } } });

    const user = await prisma.user.create({
      data: {
        githubId: 111111,
        username: 'teamscopeuser',
        email: 'teamscope@example.com',
      },
    });
    userId = user.id;

    const team1 = await prisma.team.create({
      data: { name: 'Team Alpha', key: 'ALP' },
    });
    teamId1 = team1.id;

    const team2 = await prisma.team.create({
      data: { name: 'Team Beta', key: 'BET' },
    });
    teamId2 = team2.id;
  });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.projectTeam.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({ where: { username: { startsWith: 'teamscope' } } });
  });

  it('returns empty array when user has no memberships', async () => {
    const result = await getUserTeamIds(userId);
    expect(result).toEqual([]);
  });

  it('returns team IDs for user memberships', async () => {
    await prisma.teamMember.create({
      data: { teamId: teamId1, userId, role: 'owner' },
    });
    await prisma.teamMember.create({
      data: { teamId: teamId2, userId, role: 'member' },
    });

    const result = await getUserTeamIds(userId);
    expect(result).toHaveLength(2);
    expect(result).toContain(teamId1);
    expect(result).toContain(teamId2);
  });

  it('returns only teams the user belongs to', async () => {
    await prisma.teamMember.create({
      data: { teamId: teamId1, userId, role: 'admin' },
    });

    const result = await getUserTeamIds(userId);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(teamId1);
  });

  it('ignores memberships for other users', async () => {
    const otherUser = await prisma.user.create({
      data: {
        githubId: 222222,
        username: 'teamscopeother',
        email: 'other@example.com',
      },
    });

    await prisma.teamMember.create({
      data: { teamId: teamId1, userId: otherUser.id, role: 'owner' },
    });

    const result = await getUserTeamIds(userId);
    expect(result).toEqual([]);
  });
});
