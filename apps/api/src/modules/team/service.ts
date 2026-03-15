import { randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { resolveCompanyPlan } from "../../lib/billing/subscriptions.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/security.js";

const toPublicMember = (user: { id: string; email: string; fullName: string; role: UserRole; isActive: boolean; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role.toLowerCase(),
  isActive: user.isActive,
  createdAt: user.createdAt
});

export class TeamService {
  constructor(private readonly app: FastifyInstance) {}

  async listMembers(companyId: string) {
    const users = await this.app.prisma.user.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true }
    });

    const invites = await this.app.prisma.teamInvite.findMany({
      where: { companyId, acceptedAt: null },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }
    });

    return {
      members: users.map(toPublicMember),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role.toLowerCase(),
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt
      }))
    };
  }

  async inviteMember(params: { companyId: string; invitedByUserId: string; email: string; role: "member" | "admin" }) {
    const company = await this.app.prisma.company.findUnique({ where: { id: params.companyId } });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const latestSubscription = await this.app.prisma.subscription.findFirst({
      where: { companyId: params.companyId },
      orderBy: { createdAt: "desc" }
    });

    const plan = resolveCompanyPlan(latestSubscription?.plan, company.plan);
    const activeUsersCount = await this.app.prisma.user.count({ where: { companyId: params.companyId, isActive: true } });

    if (activeUsersCount >= plan.maxUsers) {
      throw new AppError(402, "TEAM_LIMIT_REACHED", "team_limit_reached");
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.app.prisma.teamInvite.create({
      data: {
        companyId: params.companyId,
        email: params.email.toLowerCase(),
        token,
        role: params.role === "admin" ? UserRole.ADMIN : UserRole.MEMBER,
        invitedByUserId: params.invitedByUserId,
        expiresAt
      }
    });

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role.toLowerCase(),
        expiresAt: invite.expiresAt,
        inviteLink: `${this.app.config.env.APP_BASE_URL}/register?inviteToken=${invite.token}`
      }
    };
  }

  async removeMember(params: { companyId: string; actorUserId: string; memberId: string }) {
    const actor = await this.app.prisma.user.findFirst({
      where: { id: params.actorUserId, companyId: params.companyId, isActive: true },
      select: { id: true, role: true }
    });

    if (!actor || (actor.role !== UserRole.OWNER && actor.role !== UserRole.ADMIN)) {
      throw new AppError(403, "FORBIDDEN", "Only owner/admin can remove members");
    }

    const member = await this.app.prisma.user.findFirst({
      where: { id: params.memberId, companyId: params.companyId },
      select: { id: true, role: true }
    });

    if (!member) {
      throw new AppError(404, "USER_NOT_FOUND", "Member not found");
    }

    if (member.role === UserRole.OWNER) {
      throw new AppError(400, "INVALID_OPERATION", "Owner cannot be removed");
    }

    await this.app.prisma.user.update({
      where: { id: member.id },
      data: { isActive: false }
    });

    return { ok: true };
  }

  async acceptInvite(params: { token: string; fullName: string; password: string }) {
    const invite = await this.app.prisma.teamInvite.findUnique({ where: { token: params.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new AppError(400, "INVALID_INVITE", "Invite is invalid or expired");
    }

    const company = await this.app.prisma.company.findUnique({ where: { id: invite.companyId } });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const latestSubscription = await this.app.prisma.subscription.findFirst({
      where: { companyId: invite.companyId },
      orderBy: { createdAt: "desc" }
    });
    const plan = resolveCompanyPlan(latestSubscription?.plan, company.plan);
    const activeUsersCount = await this.app.prisma.user.count({ where: { companyId: invite.companyId, isActive: true } });

    if (activeUsersCount >= plan.maxUsers) {
      throw new AppError(402, "TEAM_LIMIT_REACHED", "team_limit_reached");
    }

    const existingUser = await this.app.prisma.user.findUnique({ where: { email: invite.email } });
    if (existingUser) {
      throw new AppError(409, "EMAIL_IN_USE", "Email already exists");
    }

    const passwordHash = await hashPassword(params.password);

    const user = await this.app.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: invite.companyId,
          email: invite.email,
          passwordHash,
          fullName: params.fullName,
          role: invite.role
        }
      });

      await tx.teamInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() }
      });

      return created;
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.toLowerCase(),
        companyId: user.companyId
      }
    };
  }
}
