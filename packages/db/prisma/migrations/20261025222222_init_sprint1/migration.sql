-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ATENDENTE', 'CLIENTE', 'PERSONAGEM');

-- CreateEnum
CREATE TYPE "ThemeStatus" AS ENUM ('ATIVO', 'MANUTENCAO', 'DESCONTINUADO');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDENTE', 'PAGO', 'EM_LOCACAO', 'DEVOLVIDO', 'ATRASADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('RETIRADA', 'ENTREGA');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('RG_FRENTE', 'RG_VERSO', 'COMPROVANTE_RESIDENCIA', 'SELFIE');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('RESERVA', 'BLOQUEIO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'A Fábrica Mágica',
    "slug" TEXT NOT NULL DEFAULT 'afabricamagica',
    "whatsapp" TEXT NOT NULL DEFAULT '5521972848645',
    "branding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostSensitiveDocs" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "requireProof" BOOLEAN NOT NULL DEFAULT true,
    "requireSelfie" BOOLEAN NOT NULL DEFAULT false,
    "blockWithoutDocs" BOOLEAN NOT NULL DEFAULT true,
    "weekendMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.3,
    "deliveryFeeBase" INTEGER NOT NULL DEFAULT 0,
    "lateFeePerDay" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyTheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "includedItems" TEXT[],
    "sizeM2" DOUBLE PRECISION,
    "dailyPrice" INTEGER NOT NULL,
    "totalQty" INTEGER NOT NULL DEFAULT 1,
    "weekendMultiplier" DOUBLE PRECISION,
    "photos" TEXT[],
    "status" "ThemeStatus" NOT NULL DEFAULT 'ATIVO',
    "isBestseller" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartyTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveCharacter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "pricePer2h" INTEGER NOT NULL,
    "priceExtraHour" INTEGER NOT NULL,
    "photos" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LiveCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSchedule" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "kind" "ScheduleKind" NOT NULL DEFAULT 'RESERVA',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reservationCharacterId" TEXT,
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "phone2" TEXT,
    "address" JSONB NOT NULL,
    "partyAddress" JSONB,
    "lgpdConsent" BOOLEAN NOT NULL,
    "lgpdConsentAt" TIMESTAMP(3),
    "contractAccepted" BOOLEAN NOT NULL,
    "contractVersion" TEXT,
    "docsVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL,
    "deliveryAddress" JSONB,
    "subtotal" INTEGER NOT NULL,
    "weekendFee" INTEGER NOT NULL DEFAULT 0,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "lateFee" INTEGER NOT NULL DEFAULT 0,
    "damageFee" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDENTE',
    "holdExpiresAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "pixQrCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTheme" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "weekendFee" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReservationTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCharacter" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "extraHours" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,

    CONSTRAINT "ReservationCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageReport" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "themeId" TEXT,
    "photos" TEXT[],
    "note" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MERCADOPAGO',
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "clientId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("clientId","themeId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "PartyTheme_tenantId_category_idx" ON "PartyTheme"("tenantId", "category");

-- CreateIndex
CREATE INDEX "PartyTheme_tenantId_status_idx" ON "PartyTheme"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartyTheme_tenantId_slug_key" ON "PartyTheme"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "LiveCharacter_userId_key" ON "LiveCharacter"("userId");

-- CreateIndex
CREATE INDEX "LiveCharacter_tenantId_idx" ON "LiveCharacter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveCharacter_tenantId_slug_key" ON "LiveCharacter"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSchedule_reservationCharacterId_key" ON "CharacterSchedule"("reservationCharacterId");

-- CreateIndex
CREATE INDEX "CharacterSchedule_characterId_startsAt_endsAt_idx" ON "CharacterSchedule"("characterId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- CreateIndex
CREATE INDEX "Client_tenantId_createdAt_idx" ON "Client"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_cpf_key" ON "Client"("tenantId", "cpf");

-- CreateIndex
CREATE INDEX "ClientDocument_retainUntil_idx" ON "ClientDocument"("retainUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDocument_clientId_sha256_key" ON "ClientDocument"("clientId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_code_key" ON "Reservation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_paymentId_key" ON "Reservation"("paymentId");

-- CreateIndex
CREATE INDEX "Reservation_tenantId_status_idx" ON "Reservation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Reservation_tenantId_eventDate_returnDate_idx" ON "Reservation"("tenantId", "eventDate", "returnDate");

-- CreateIndex
CREATE INDEX "Reservation_clientId_idx" ON "Reservation"("clientId");

-- CreateIndex
CREATE INDEX "ReservationTheme_themeId_idx" ON "ReservationTheme"("themeId");

-- CreateIndex
CREATE INDEX "ReservationTheme_reservationId_idx" ON "ReservationTheme"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationCharacter_characterId_startsAt_idx" ON "ReservationCharacter"("characterId", "startsAt");

-- CreateIndex
CREATE INDEX "ReservationCharacter_reservationId_idx" ON "ReservationCharacter"("reservationId");

-- CreateIndex
CREATE INDEX "DamageReport_reservationId_idx" ON "DamageReport"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_externalId_key" ON "PaymentEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyTheme" ADD CONSTRAINT "PartyTheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCharacter" ADD CONSTRAINT "LiveCharacter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCharacter" ADD CONSTRAINT "LiveCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSchedule" ADD CONSTRAINT "CharacterSchedule_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "LiveCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSchedule" ADD CONSTRAINT "CharacterSchedule_reservationCharacterId_fkey" FOREIGN KEY ("reservationCharacterId") REFERENCES "ReservationCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTheme" ADD CONSTRAINT "ReservationTheme_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTheme" ADD CONSTRAINT "ReservationTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "PartyTheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCharacter" ADD CONSTRAINT "ReservationCharacter_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCharacter" ADD CONSTRAINT "ReservationCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "LiveCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "PartyTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "PartyTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
