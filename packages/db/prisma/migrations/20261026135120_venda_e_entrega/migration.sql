-- CreateEnum
CREATE TYPE "OfferMode" AS ENUM ('ALUGUEL', 'VENDA', 'AMBOS');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('ALUGUEL', 'VENDA');

-- AlterTable
ALTER TABLE "PartyTheme" ADD COLUMN     "allowDelivery" BOOLEAN,
ADD COLUMN     "allowPickup" BOOLEAN,
ADD COLUMN     "offerMode" "OfferMode",
ADD COLUMN     "salePrice" INTEGER,
ADD COLUMN     "saleQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "dealType" "DealType" NOT NULL DEFAULT 'ALUGUEL';

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "allowDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "defaultOfferMode" "OfferMode" NOT NULL DEFAULT 'ALUGUEL';
