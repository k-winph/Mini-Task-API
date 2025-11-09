/*
  Warnings:

  - A unique constraint covering the columns `[key]` on the table `IdempotencyKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `key` to the `IdempotencyKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `IdempotencyKey` ADD COLUMN `key` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `IdempotencyKey_key_key` ON `IdempotencyKey`(`key`);
