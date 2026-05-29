-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "pixQrCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "pixQrCodeBase64" TEXT;
