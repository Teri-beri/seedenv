import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(name: string) {
  const prefixed = `${name}=`;
  const index = process.argv.findIndex((arg) => arg === name);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(prefixed));
  return inline?.slice(prefixed.length);
}

async function main() {
  const email = readArg("--email")?.trim().toLowerCase();
  const roleName = readArg("--role")?.trim().toUpperCase();

  if (!email) throw new Error("Missing --email user@example.com");
  if (!roleName || !(roleName in UserRole)) throw new Error(`Invalid --role. Use one of: ${Object.keys(UserRole).join(", ")}`);

  const user = await prisma.user.update({
    where: { email },
    data: { role: UserRole[roleName as keyof typeof UserRole] },
    select: { id: true, email: true, role: true, username: true },
  });

  console.log(`Updated ${user.email} (${user.username}) to ${user.role}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });