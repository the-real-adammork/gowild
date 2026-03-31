import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.searchConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      searchDaysOut: 7,
      searchIncludeToday: true,
      fareTabs: JSON.stringify(['GoWild']),
      emailTo: '',
      emailEnabled: true,
      cronBaseHours: JSON.stringify([7, 11, 15, 21]),
      cronJitterMinutes: 30,
    },
  })
  console.log('Seeded default SearchConfig')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
