-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_name_key" ON "Resource"("name");

-- CreateIndex
CREATE INDEX "Booking_resourceId_startsAt_idx" ON "Booking"("resourceId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_userId_startsAt_idx" ON "Booking"("userId", "startsAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras de integridade que o Prisma não expressa (ver docs/adr/0001).
-- O banco é a última linha de defesa contra corrida entre requisições.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Uma reserva sempre termina depois de começar.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_time_order" CHECK ("endsAt" > "startsAt");

-- Um recurso não pode ter duas reservas CONFIRMED que se sobreponham.
-- Intervalo semiaberto [início, fim): uma reserva pode começar quando outra termina.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_resource_overlap"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');

-- Um usuário não pode estar em duas reservas CONFIRMED ao mesmo tempo.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_user_overlap"
  EXCLUDE USING gist (
    "userId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');
