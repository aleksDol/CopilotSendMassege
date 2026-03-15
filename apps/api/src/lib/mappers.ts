import type { Company, User } from "@prisma/client";

export type PublicCompany = Pick<Company, "id" | "name" | "slug" | "plan" | "timezone">;
export type PublicUser = Omit<Pick<User, "id" | "email" | "fullName" | "role" | "companyId">, "role"> & {
  role: Lowercase<User["role"]>;
};

export const toPublicCompany = (company: Company): PublicCompany => ({
  id: company.id,
  name: company.name,
  slug: company.slug,
  plan: company.plan,
  timezone: company.timezone
});

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role.toLowerCase() as Lowercase<User["role"]>,
  companyId: user.companyId
});
