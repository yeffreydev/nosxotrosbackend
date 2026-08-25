-- AlterTable
ALTER TABLE "CampaignVolunteer" ADD COLUMN     "donationId" TEXT,
ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "guestPhone" TEXT,
ALTER COLUMN "volunteerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVolunteer_donationId_key" ON "CampaignVolunteer"("donationId");

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

