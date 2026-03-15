import { PrismaClient, Plan, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: {
      name: "Demo Company",
      slug: "demo-company",
      plan: Plan.FREE,
      timezone: "UTC"
    }
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.local" },
    update: {
      companyId: company.id,
      role: UserRole.OWNER,
      isActive: true
    },
    create: {
      companyId: company.id,
      email: "owner@demo.local",
      passwordHash: "change_me",
      fullName: "Demo Owner",
      role: UserRole.OWNER,
      isActive: true
    }
  });

  await prisma.replyPolicy.upsert({
    where: { companyId: company.id },
    update: {
      toneRules: { style: "professional", brevity: "concise" },
      pricingRules: { disclosePriceOnlyWhenAsked: true },
      discountRules: { maxDiscountPercentWithoutApproval: 0 },
      forbiddenPromises: ["guaranteed results", "lifetime support"],
      forbiddenTopics: ["politics", "religion"],
      humanHandoffRules: { escalationKeyword: "manager" }
    },
    create: {
      companyId: company.id,
      toneRules: { style: "professional", brevity: "concise" },
      pricingRules: { disclosePriceOnlyWhenAsked: true },
      discountRules: { maxDiscountPercentWithoutApproval: 0 },
      forbiddenPromises: ["guaranteed results", "lifetime support"],
      forbiddenTopics: ["politics", "religion"],
      humanHandoffRules: { escalationKeyword: "manager" }
    }
  });

  console.log(`Seed completed for company ${company.slug} and user ${owner.email}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
